// Offline-aware API request wrapper
// Automatically falls back to PouchDB when network is unavailable

import { setOfflineStorageHandler } from "./offlineApiRequestHelper";
import {
  cacheGetResponse,
  getCachedResponse,
  listCacheKeyFor,
  removeCachedEntity,
  upsertCachedEntity,
} from "./offlineCache";
import { getInstallMode } from "./installMode";
import { toast } from "@/hooks/use-toast";
import { t } from "./i18n";
import {
  createOfflineOperation,
  type OfflineOperationDocument,
  type OfflineOperationDraft,
  type OfflineMethod,
} from "./offlineOperationQueue";
import { getLocalDashboardMetrics } from "./localDashboardMetrics";
import {
  getLocalProductAnalytics,
  getLocalSalesAnalytics,
  getLocalSalesByProduct,
  getLocalSalesReport,
} from "./localSalesAnalytics";

// Store reference to save function
let saveToOfflineStorage:
  | ((
      operation: OfflineOperationDraft
    ) => Promise<OfflineOperationDocument | void>)
  | null = null;

/**
 * Initialize the offline storage handler
 * This must be called from a component that has access to useOfflineSync
 */
export function initOfflineStorage(
  saveFunction: (
    operation: OfflineOperationDraft
  ) => Promise<OfflineOperationDocument | void>
) {
  saveToOfflineStorage = saveFunction;
  setOfflineStorageHandler(saveFunction);
}

interface OfflineRequestOptions {
  collection?: string;
  showToast?: boolean;
  entityId?: string;
  /**
   * For a parent-scoped sub-resource (a product's variants, a product's
   * pricing rules) that isn't the tenant-wide `collection` list: the exact
   * URL the matching GET reads from (e.g. `/api/products/${id}/variants`).
   * Lets the offline cache find/seed the right list instead of the
   * tenant-wide one. See upsertCachedEntity's docstring in offlineCache.ts.
   */
  listKey?: string;
}

interface SavedResponse {
  ok: boolean;
  status: number;
  _savedOffline?: true;
  json: () => Promise<any>;
  text: () => Promise<string>;
}

export const OFFLINE_MUTATION_SAVED_EVENT = "medicalconnect:offline-mutation-saved";
const API_REACHABILITY_TIMEOUT_MS = 3000;

// Create a synthetic Response object from saved data (for POST/PUT offline)
function createSyntheticResponse(data: any): SavedResponse {
  return {
    ok: true,
    status: 202, // Accepted - will sync later
    _savedOffline: true,
    async json() {
      return { ...data, _savedOffline: true }; // Flag to indicate offline save
    },
    async text() {
      return JSON.stringify({ ...data, _savedOffline: true });
    },
  };
}

export function isSavedOfflineResponse(response: unknown): boolean {
  return (
    typeof response === "object" &&
    response !== null &&
    "_savedOffline" in response &&
    response._savedOffline === true
  );
}

// Create cached response for GET requests
function createCachedResponse(data: any): SavedResponse {
  return {
    ok: true,
    status: 200, // OK status for cached reads
    async json() {
      return data;
    },
    async text() {
      return JSON.stringify(data);
    },
  };
}

// Detect if error is network-related
function isNetworkError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) {
    return true;
  }
  if (error instanceof DOMException) {
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "NetworkError"
  ) {
    return true;
  }
  // Check for common network error statuses
  return false;
}

/**
 * A "local" install never has a server to reach, by design (see
 * docs/superpowers/specs/2026-08-15-offline-authentication-design.md) - it
 * should never attempt the network at all. Attempting it anyway is not just
 * wasted latency: when the failure arrives as an HTTP response instead of a
 * fetch-level exception (e.g. a dev proxy or reverse proxy returning a 500/502
 * for an unreachable backend), isNetworkError() below doesn't recognize it,
 * and the request is thrown as a real API error instead of falling back to
 * the offline cache/queue - so nothing ever gets saved or read locally.
 */
function localInstallNetworkError(): TypeError {
  return new TypeError("fetch failed: local install mode never contacts a server");
}

/**
 * Do not leave mutations pending when connectivity disappears. Browsers can
 * keep a fetch promise open after Wi-Fi is disabled, so mutations need both an
 * offline preflight and an abort tied to the browser's offline event.
 */
async function fetchMutation(
  url: string,
  options: RequestInit
): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new TypeError("fetch failed: browser is offline");
  }

  if (typeof window === "undefined") {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const abortWhenOffline = () => controller.abort();
  window.addEventListener("offline", abortWhenOffline, { once: true });

  try {
    // Some WebViews keep navigator.onLine=true after Wi-Fi disappears. Probe a
    // read-only endpoint first so a stalled connection never receives the
    // business mutation and cannot later duplicate a queued stock operation.
    if (navigator.onLine === true) {
      const timeout = setTimeout(
        () => controller.abort(),
        API_REACHABILITY_TIMEOUT_MS
      );
      try {
        await fetch("/api/auth/me", {
          method: "HEAD",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
    }

    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    window.removeEventListener("offline", abortWhenOffline);
  }
}

/**
 * Adjusts one product's (or variant's) cached stock quantity by `delta` and
 * appends a matching movement record, mirroring what SalesService.create /
 * ProductsRepository.adjustStock do transactionally on the real backend.
 * Shared by both stock_entry/stock_exit (applyLocalStockAdjustment) and sale
 * creation (applyLocalSaleStockDeductions) below - the product's displayed
 * stock quantity lives on the cached *product* entity's `stocks.quantity`
 * field (see Products.tsx's getStockLevel), and stock history lives in a
 * separate per-product/per-variant `/api/stock/.../movements` list (see
 * StockHistoryModal.tsx) - two different cached lists entirely that nothing
 * else keeps in sync.
 */
async function adjustLocalProductStock(
  tenantId: string,
  productId: string,
  variantId: string | null,
  delta: number,
  movement: {
    type: "entry" | "exit";
    reason: string | null;
    unitPrice: string | null;
    userId: string | null;
  }
): Promise<void> {
  const products = (await getCachedResponse(
    listCacheKeyFor("products", tenantId),
    "products"
  )) as Record<string, unknown>[] | null;
  const product = products?.find((p) => p.id === productId);
  if (!product) return;

  const updated: Record<string, unknown> = { ...product };
  let previousQuantity = 0;
  let newQuantity = 0;
  if (variantId && Array.isArray(updated.variants)) {
    updated.variants = (updated.variants as Record<string, unknown>[]).map(
      (variant) => {
        if (variant.id !== variantId) return variant;
        previousQuantity = (variant.quantity as number) || 0;
        newQuantity = Math.max(0, previousQuantity + delta);
        return { ...variant, quantity: newQuantity };
      }
    );
  } else {
    const stocks = (updated.stocks as Record<string, unknown>) || {
      reservedQuantity: 0,
    };
    previousQuantity = (stocks.quantity as number) || 0;
    newQuantity = Math.max(0, previousQuantity + delta);
    updated.stocks = {
      ...stocks,
      quantity: newQuantity,
      lastUpdated: new Date().toISOString(),
    };
  }

  await upsertCachedEntity("products", updated, false);

  const movementsListKey = variantId
    ? `/api/stock/variant/${variantId}/movements`
    : `/api/stock/${productId}/movements`;
  await upsertCachedEntity(
    "stock",
    {
      id: crypto.randomUUID(),
      productId,
      variantId: variantId ?? null,
      type: movement.type,
      quantity: Math.abs(delta),
      previousQuantity,
      newQuantity,
      reason: movement.reason,
      priceType: null,
      unitPrice: movement.unitPrice,
      purchaseId: null,
      userId: movement.userId,
      tenantId,
      createdAt: new Date().toISOString(),
    },
    true,
    movementsListKey
  );
}

/**
 * ProductPricing.tsx's create/update mutations cache the new rule under its
 * own sub-resource list (/api/products/pricing/:productId, via `listKey`) -
 * that's enough for the pricing tab's own list to show it, but the backend
 * actually stores pricingRules embedded on the product document itself
 * (see products.repository.ts's addPricingRule/updatePricingRule), and
 * that's what resolveProductPrice.ts reads when computing a sale item's
 * price offline. Without this, a pricing rule created/edited offline shows
 * up in the pricing tab but is silently ignored when actually pricing a
 * sale - the product's cached copy never learns about it.
 */
async function syncLocalProductPricingRule(
  tenantId: string,
  productId: string,
  rule: Record<string, unknown>
): Promise<void> {
  const products = (await getCachedResponse(
    listCacheKeyFor("products", tenantId),
    "products"
  )) as Record<string, unknown>[] | null;
  const product = products?.find((p) => p.id === productId);
  if (!product) return;

  const existingRules = Array.isArray(product.pricingRules)
    ? (product.pricingRules as Record<string, unknown>[])
    : [];
  const index = existingRules.findIndex((r) => r.id === rule.id);
  const pricingRules =
    index >= 0
      ? existingRules.map((r, i) => (i === index ? { ...r, ...rule } : r))
      : [...existingRules, rule];

  await upsertCachedEntity("products", { ...product, pricingRules }, false);
}

async function applyLocalStockAdjustment(
  collection: "stock_entry" | "stock_exit",
  payload: Record<string, unknown>
): Promise<void> {
  const productId = payload.productId as string | undefined;
  const tenantId = payload.tenantId as string | undefined;
  const variantId = (payload.variantId as string | undefined) ?? null;
  const quantity = Number(payload.quantity);
  if (!productId || !tenantId || !Number.isFinite(quantity) || quantity <= 0) {
    return;
  }

  await adjustLocalProductStock(
    tenantId,
    productId,
    variantId,
    collection === "stock_entry" ? quantity : -quantity,
    {
      type: collection === "stock_entry" ? "entry" : "exit",
      reason: (payload.reason as string) ?? null,
      unitPrice: null,
      userId: (payload.userId as string) ?? null,
    }
  );
}

/**
 * A sale queued offline still needs its stock effect applied locally - the
 * real backend deducts each item's quantity from the product/variant it
 * sold and records an "exit" movement per item as part of the same create()
 * saga (see sales.service.ts's create doc comment); left alone, a local
 * install's stock and history never reflect what was actually sold.
 */
async function applyLocalSaleStockDeductions(
  saleId: string,
  tenantId: string,
  userId: string | null,
  items: unknown
): Promise<void> {
  if (!Array.isArray(items)) return;

  for (const rawItem of items as Record<string, unknown>[]) {
    const productId = rawItem.productId as string | undefined;
    const variantId = (rawItem.variantId as string | undefined) ?? null;
    const quantity = Number(rawItem.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) continue;

    await adjustLocalProductStock(tenantId, productId, variantId, -quantity, {
      type: "exit",
      reason: `Sale-${saleId}`,
      unitPrice:
        rawItem.unitPrice !== undefined && rawItem.unitPrice !== null
          ? String(rawItem.unitPrice)
          : null,
      userId,
    });
  }
}

/**
 * Looks up a product by barcode - used by Products.tsx, Dashboard.tsx, and
 * SaleModal.tsx's barcode-scan flows. The single-item GET this normally
 * hits (`/api/products/barcode/:tenantId/:barcode`) is never cacheable on
 * its own (each barcode is its own unique URL, never pre-populated), so a
 * local install - or a temporarily offline connected one - would otherwise
 * always report "not found". Falls back to searching the products list
 * that's already correctly cached instead. Shared here once rather than
 * duplicated in each of the three callers.
 */
export async function findProductByBarcode(
  tenantId: string,
  barcode: string
): Promise<Record<string, unknown> | null> {
  try {
    const response = await offlineApiRequest(
      "GET",
      `/api/products/barcode/${tenantId}/${barcode}`,
      undefined,
      { collection: "products" }
    );
    return response.ok ? await response.json() : null;
  } catch {
    const products = (await getCachedResponse(
      listCacheKeyFor("products", tenantId),
      "products"
    )) as Record<string, unknown>[] | null;
    return products?.find((product) => product.barcode === barcode) ?? null;
  }
}

/**
 * Offline-aware API request that automatically saves to PouchDB when network fails
 *
 * @param method - HTTP method (GET, POST, PUT, DELETE)
 * @param url - API endpoint URL
 * @param data - Request body data
 * @param options - Additional options (collection type for offline storage)
 * @returns Response object (real or synthetic)
 *
 * @example
 * const response = await offlineApiRequest('POST', '/api/sales', saleData, {
 *   collection: 'sales'
 * });
 */
export async function offlineApiRequest(
  method: string,
  url: string,
  data?: unknown,
  options?: OfflineRequestOptions
): Promise<Response | SavedResponse> {
  const collection = options?.collection || extractCollectionFromUrl(url);
  const normalizedMethod = method.toUpperCase();

  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(normalizedMethod)) {
    throw new Error(`Unsupported offline request method: ${normalizedMethod}`);
  }

  const fetchOptions = buildFetchOptions(normalizedMethod, data);

  // === Handle GET requests with caching ===
  if (normalizedMethod === "GET") {
    try {
      if (getInstallMode() === "local") throw localInstallNetworkError();

      // Try network first (when online)
      const response = await fetch(url, fetchOptions);

      if (response.ok) {
        // Success - cache the response for future offline use
        const responseData = await response.clone().json();
        await cacheGetResponse(url, responseData, collection);
        return response;
      }

      // HTTP failures reached the server and must remain distinguishable from
      // offline/network failures (especially authorization responses).
      throw response;
    } catch (error) {
      if (error instanceof Response) throw error;

      // Network failed or returned error - try cache
      const cachedData = await getCachedResponse(url, collection);

      if (cachedData) {
        return createCachedResponse(cachedData);
      }

      if (getInstallMode() === "local" && collection === "settings") {
        return createCachedResponse([]);
      }

      // Unlike a plain list, there's no raw "dashboard" data to ever have
      // queued/cached - it's a computed aggregate. Derive it from the
      // products/sales lists that are already correctly cached instead of
      // always reporting empty.
      if (getInstallMode() === "local" && collection === "dashboard") {
        const tenantId = new URL(url, "http://offline.local").pathname.replace(
          /^\/api\/dashboard\/?/,
          ""
        );
        if (tenantId) {
          const metrics = await getLocalDashboardMetrics(tenantId);
          return createCachedResponse(metrics);
        }
      }

      // ProductSales.tsx's per-product analytics tab - same computed-
      // aggregate story as dashboard/sales analytics above, just filtered
      // to one product's sale items. Tagged "products" (not "sales") by
      // its caller, and carries tenantId as a query param, not a path
      // segment - a third URL shape distinct from both.
      if (getInstallMode() === "local" && collection === "products") {
        const parsedUrl = new URL(url, "http://offline.local");
        const segments = parsedUrl.pathname
          .replace(/^\/api\/products\/?/, "")
          .split("/")
          .filter(Boolean);

        if (segments[0] === "analytics" && segments.length === 2) {
          const tenantId = parsedUrl.searchParams.get("tenantId");
          const dateRange = parsedUrl.searchParams.get("dateRange") ?? "7d";
          if (tenantId) {
            const analytics = await getLocalProductAnalytics(
              tenantId,
              segments[1],
              dateRange
            );
            return createCachedResponse(analytics);
          }
        }
      }

      // Same idea for the two computed sales views (day-grouped analytics,
      // date-ranged report) - both tagged "sales" like the plain sales list
      // itself, so they're distinguished by URL shape, not by collection.
      if (getInstallMode() === "local" && collection === "sales") {
        const parsedUrl = new URL(url, "http://offline.local");
        const segments = parsedUrl.pathname
          .replace(/^\/api\/sales\/?/, "")
          .split("/")
          .filter(Boolean);

        if (segments[0] === "analytics" && segments.length === 2) {
          const dateRange = parsedUrl.searchParams.get("dateRange") ?? "7d";
          const analytics = await getLocalSalesAnalytics(segments[1], dateRange);
          return createCachedResponse(analytics);
        }

        if (segments.length === 4 && segments[1] === "report") {
          const [tenantId, , startDate, endDate] = segments;
          const report = await getLocalSalesReport(
            tenantId,
            new Date(startDate),
            new Date(endDate)
          );
          return createCachedResponse(report);
        }

        if (segments[0] === "product" && segments.length === 2) {
          const tenantId = parsedUrl.searchParams.get("tenantId");
          if (tenantId) {
            const sales = await getLocalSalesByProduct(tenantId, segments[1]);
            return createCachedResponse(sales);
          }
        }
      }

      // No cache available - re-throw error
      console.error("No cached data available for:", url);
      throw error;
    }
  }

  // === Handle POST/PUT/DELETE requests (existing logic) ===
  try {
    if (getInstallMode() === "local") throw localInstallNetworkError();

    // Try network request first
    const response = await fetchMutation(url, fetchOptions);

    // If successful, return the response
    if (response.ok) {
      return response;
    }

    // If not OK but not a network error (e.g., 400, 403), throw to show validation errors
    // Don't check status codes here - let the calling code handle validation errors
    throw response;
  } catch (error) {
    // A real HTTP response reached the server. It must be surfaced to the
    // caller even when navigator.onLine is stale or reports offline.
    if (error instanceof Response) {
      throw error;
    }

    // Only save to offline storage if it's a network error
    if (
      (isNetworkError(error) ||
        (typeof navigator !== "undefined" && !navigator.onLine)) &&
      saveToOfflineStorage
    ) {
      try {
        const operation = createOfflineOperation(
          normalizedMethod as OfflineMethod,
          url,
          collection,
          data,
          options?.entityId
        );
        await saveToOfflineStorage(operation);

        if (normalizedMethod === "DELETE" && operation.entityId) {
          await removeCachedEntity(collection, operation.entityId);
        }

        const payloadRecord =
          operation.payload &&
          typeof operation.payload === "object" &&
          !Array.isArray(operation.payload)
            ? (operation.payload as Record<string, unknown>)
            : null;

        if (
          (collection === "stock_entry" || collection === "stock_exit") &&
          payloadRecord
        ) {
          await applyLocalStockAdjustment(collection, payloadRecord);
        }

        const saleRecord =
          collection === "sales" &&
          payloadRecord?.sale &&
          typeof payloadRecord.sale === "object" &&
          !Array.isArray(payloadRecord.sale)
            ? (payloadRecord.sale as Record<string, unknown>)
            : null;

        if (saleRecord && operation.entityId && saleRecord.tenantId) {
          await applyLocalSaleStockDeductions(
            operation.entityId,
            saleRecord.tenantId as string,
            (saleRecord.userId as string) ?? null,
            payloadRecord?.items
          );
        }

        const entityRecord = saleRecord ?? payloadRecord;
        const optimisticEntity =
          entityRecord && operation.entityId
            ? {
                ...entityRecord,
                id: operation.entityId,
                ...(saleRecord
                  ? {
                      items: Array.isArray(payloadRecord?.items)
                        ? payloadRecord.items
                        : [],
                      // Mirrors SalesService.create's own `SALE-${Date.now()}`
                      // format - this is user-facing (receipts, sale lists),
                      // so it must not leak the offline-queue implementation
                      // detail the way an "OFFLINE-" prefix would.
                      saleNumber: saleRecord.saleNumber ?? `SALE-${Date.now()}`,
                      createdAt:
                        saleRecord.createdAt ?? new Date().toISOString(),
                      profit: saleRecord.profit ?? 0,
                    }
                  : {}),
                _savedOffline: true,
                _offlinePending: true,
              }
            : null;

        if (
          optimisticEntity &&
          ["POST", "PUT", "PATCH"].includes(normalizedMethod)
        ) {
          await upsertCachedEntity(
            collection,
            optimisticEntity,
            normalizedMethod === "POST",
            ...(options?.listKey ? [options.listKey] : [])
          );
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent(OFFLINE_MUTATION_SAVED_EVENT, {
                detail: {
                  collection,
                  method: normalizedMethod,
                  entity: optimisticEntity,
                },
              })
            );
          }

          const pricingRuleEntity = optimisticEntity as Record<string, unknown>;
          if (
            collection === "products" &&
            options?.listKey?.startsWith("/api/products/pricing/") &&
            typeof pricingRuleEntity.productId === "string" &&
            typeof pricingRuleEntity.tenantId === "string"
          ) {
            await syncLocalProductPricingRule(
              pricingRuleEntity.tenantId,
              pricingRuleEntity.productId,
              pricingRuleEntity
            );
          }
        }

        if (options?.showToast) {
          toast({
            title: t("savedOffline"),
            description: t("changesSyncWhenOnline"),
          });
        }

        // Return synthetic success response
        return createSyntheticResponse(optimisticEntity ?? operation.payload ?? {});
      } catch (offlineError) {
        console.error("Failed to save to offline storage:", offlineError);
        // Re-throw the original error
        throw error;
      }
    }

    // For all other errors (validation errors, etc.), re-throw
    throw error;
  }
}

function buildFetchOptions(method: string, data?: unknown): RequestInit {
  const hasBody = data !== undefined && data !== null;
  return {
    method,
    ...(hasBody
      ? { headers: { "Content-Type": "application/json" } as Record<string, string>, body: JSON.stringify(data) }
      : {}),
    credentials: "include",
  };
}

/**
 * Extract collection name from URL
 */
function extractCollectionFromUrl(url: string): string {
  // Map common API endpoints to collection types
  if (url.includes("/api/sales")) return "sales";
  if (url.includes("/api/products")) return "products";
  if (url.includes("/api/stock") && url.includes("/entry"))
    return "stock_entry";
  if (url.includes("/api/stock") && url.includes("/exit")) return "stock_exit";
  if (url.includes("/api/customers")) return "customers";
  if (url.includes("/api/staff")) return "staff";
  if (url.includes("/api/categories")) return "categories";
  if (url.includes("/api/dashboard")) return "dashboard";

  // Default fallback
  const match = url.match(/\/api\/(\w+)/);
  return match ? match[1] : "unknown";
}
