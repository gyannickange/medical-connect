import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./offlineCache", () => ({
  cacheGetResponse: vi.fn(),
  getCachedResponse: vi.fn(),
  removeCachedEntity: vi.fn(),
  upsertCachedEntity: vi.fn(),
  listCacheKeyFor: (collection: string, tenantId: string | null) =>
    tenantId ? `/api/${collection}/${tenantId}` : `/api/${collection}`,
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));
vi.mock("./i18n", () => ({ t: (key: string) => key }));

import { initOfflineStorage, offlineApiRequest } from "./offlineApiRequest";
import {
  getCachedResponse,
  removeCachedEntity,
  upsertCachedEntity,
} from "./offlineCache";
import { setInstallMode } from "./installMode";
import type { OfflineOperationDocument } from "./offlineOperationQueue";

describe("offlineApiRequest mutation queueing", () => {
  let saved: OfflineOperationDocument[];

  beforeEach(() => {
    saved = [];
    initOfflineStorage(async (operation) => {
      const document: OfflineOperationDocument = {
        ...operation,
        _id: `offline_operation_${operation.operationId}`,
        tenantId: "tenant-1",
        deviceId: "device-1",
      };
      saved.push(document);
      return document;
    });
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("queues a stock mutation immediately when the browser is already offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });

    const response = await offlineApiRequest(
      "POST",
      "/api/stock/product-1/entry",
      {
        productId: "product-1",
        quantity: 1,
        tenantId: "tenant-1",
        userId: "user-1",
      },
      { collection: "stock_entry" }
    );

    expect(fetch).not.toHaveBeenCalled();
    expect(saved[0]).toMatchObject({
      method: "POST",
      url: "/api/stock/product-1/entry",
      collection: "stock_entry",
      state: "pending",
    });
    await expect(response.json()).resolves.toMatchObject({
      productId: "product-1",
      quantity: 1,
      _savedOffline: true,
    });
  });

  it("aborts and queues a pending mutation when the browser goes offline", async () => {
    const browserEvents = new EventTarget();
    vi.stubGlobal("window", browserEvents);
    vi.stubGlobal("navigator", { onLine: true });
    vi.mocked(fetch).mockImplementationOnce(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Request aborted", "AbortError"));
          });
        })
    );

    const pendingResponse = offlineApiRequest(
      "POST",
      "/api/products",
      { name: "Interrupted offline product" },
      { collection: "products" }
    );
    browserEvents.dispatchEvent(new Event("offline"));

    const response = await pendingResponse;
    expect(saved).toHaveLength(1);
    await expect(response.json()).resolves.toMatchObject({
      name: "Interrupted offline product",
      _savedOffline: true,
    });
  });

  it("queues without sending the mutation when an online WebView cannot reach the API", async () => {
    vi.useFakeTimers();
    const browserEvents = new EventTarget();
    vi.stubGlobal("window", browserEvents);
    vi.stubGlobal("navigator", { onLine: true });
    vi.mocked(fetch).mockImplementationOnce(
      async (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          options?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Probe timed out", "AbortError"));
          });
        })
    );

    const pendingResponse = offlineApiRequest(
      "POST",
      "/api/stock/product-1/entry",
      { productId: "product-1", quantity: 1, tenantId: "tenant-1" },
      { collection: "stock_entry" }
    );
    await vi.advanceTimersByTimeAsync(3000);

    const response = await pendingResponse;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ method: "HEAD" })
    );
    expect(saved).toHaveLength(1);
    await expect(response.json()).resolves.toMatchObject({
      productId: "product-1",
      _savedOffline: true,
    });
  });

  it("network-failed POST queues method, URL, payload, tenant context, and operation ID", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    const response = await offlineApiRequest(
      "POST",
      "/api/products",
      { name: "Offline product" },
      { collection: "products" }
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      schemaVersion: 1,
      method: "POST",
      url: "/api/products",
      collection: "products",
      entityId: expect.any(String),
      payload: { name: "Offline product", id: expect.any(String) },
      state: "pending",
      retryCount: 0,
      tenantId: "tenant-1",
      deviceId: "device-1",
    });
    expect(saved[0].operationId).toEqual(expect.any(String));
    expect(saved[0].entityId).toBe(saved[0].operationId);
    await expect(response.json()).resolves.toMatchObject({
      id: saved[0].operationId,
      name: "Offline product",
      _savedOffline: true,
      _offlinePending: true,
    });
    expect(upsertCachedEntity).toHaveBeenCalledWith(
      "products",
      expect.objectContaining({ id: saved[0].operationId }),
      true
    );
  });

  it("forwards a caller-supplied listKey to upsertCachedEntity, for parent-scoped sub-resources like a product's variants", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    await offlineApiRequest(
      "POST",
      "/api/products/product-1/variants",
      { sku: "SKU-A" },
      { collection: "products", listKey: "/api/products/product-1/variants" }
    );

    expect(upsertCachedEntity).toHaveBeenCalledWith(
      "products",
      expect.objectContaining({ sku: "SKU-A" }),
      true,
      "/api/products/product-1/variants"
    );
  });

  it("returns a table-ready sale and preserves its client ID for offline replay", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    const response = await offlineApiRequest(
      "POST",
      "/api/sales",
      {
        sale: {
          tenantId: "tenant-1",
          subtotal: 100,
          tax: 0,
          total: 100,
          paymentMethod: "cash",
          status: "completed",
        },
        items: [
          {
            productId: "product-1",
            product: { id: "product-1", name: "Offline coffee" },
            quantity: 1,
            unitPrice: 100,
            totalPrice: 100,
          },
        ],
      },
      { collection: "sales" }
    );

    expect(saved).toHaveLength(1);
    expect(saved[0].entityId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(saved[0].payload).toMatchObject({
      sale: { id: saved[0].entityId, tenantId: "tenant-1", total: 100 },
      items: [
        {
          product: { name: "Offline coffee" },
          totalPrice: 100,
        },
      ],
    });

    await expect(response.json()).resolves.toMatchObject({
      id: saved[0].entityId,
      tenantId: "tenant-1",
      total: 100,
      saleNumber: expect.stringMatching(/^SALE-\d+$/),
      createdAt: expect.any(String),
      profit: 0,
      items: [{ product: { name: "Offline coffee" } }],
      _savedOffline: true,
      _offlinePending: true,
    });
    expect(upsertCachedEntity).toHaveBeenCalledWith(
      "sales",
      expect.objectContaining({
        id: saved[0].entityId,
        saleNumber: expect.stringMatching(/^SALE-\d+$/),
        items: [expect.objectContaining({ productId: "product-1" })],
      }),
      true
    );
  });

  it("deducts each sold item's quantity from cached product stock and records an exit movement", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.mocked(getCachedResponse).mockImplementation(async (key, collection) => {
      if (collection === "products" && key === "/api/products/tenant-1") {
        return [
          {
            id: "product-1",
            name: "Coffee",
            stocks: { quantity: 10, reservedQuantity: 0 },
            variants: [],
          },
        ];
      }
      return null;
    });

    await offlineApiRequest(
      "POST",
      "/api/sales",
      {
        sale: { tenantId: "tenant-1", userId: "user-1", total: 100, paymentMethod: "cash" },
        items: [
          {
            productId: "product-1",
            product: { id: "product-1", name: "Coffee" },
            quantity: 3,
            unitPrice: 100,
            totalPrice: 300,
          },
        ],
      },
      { collection: "sales" }
    );

    expect(upsertCachedEntity).toHaveBeenCalledWith(
      "products",
      expect.objectContaining({
        id: "product-1",
        stocks: expect.objectContaining({ quantity: 7 }),
      }),
      false
    );
    expect(upsertCachedEntity).toHaveBeenCalledWith(
      "stock",
      expect.objectContaining({
        productId: "product-1",
        type: "exit",
        quantity: 3,
        previousQuantity: 10,
        newQuantity: 7,
        unitPrice: "100",
        userId: "user-1",
      }),
      true,
      "/api/stock/product-1/movements"
    );
    vi.mocked(getCachedResponse).mockReset();
  });

  it("assigns a stable client ID to an offline-created setting", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    const response = await offlineApiRequest(
      "POST",
      "/api/settings",
      {
        tenantId: "tenant-1",
        key: "receiptFormat",
        value: "retail",
        category: "system",
        dataType: "string",
      },
      { collection: "settings" }
    );

    expect(saved[0]).toMatchObject({
      collection: "settings",
      entityId: expect.any(String),
      payload: {
        id: expect.any(String),
        tenantId: "tenant-1",
        key: "receiptFormat",
        value: "retail",
      },
    });
    expect((saved[0].payload as { id: string }).id).toBe(saved[0].entityId);
    await expect(response.json()).resolves.toMatchObject({
      id: saved[0].entityId,
      key: "receiptFormat",
      _savedOffline: true,
      _offlinePending: true,
    });
    expect(upsertCachedEntity).toHaveBeenCalledWith(
      "settings",
      expect.objectContaining({ id: saved[0].entityId }),
      true
    );
  });

  it("assigns a stable client ID to a queued audit log", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    const response = await offlineApiRequest(
      "POST",
      "/api/audit-logs",
      {
        tenantId: "tenant-1",
        userId: "user-1",
        action: "CREATE",
        entityType: "products",
        entityId: "product-1",
        metadata: {},
        status: "SUCCESS",
      },
      { collection: "audit-logs" }
    );

    expect(saved[0]).toMatchObject({
      collection: "audit-logs",
      entityId: expect.any(String),
      payload: {
        id: expect.any(String),
        tenantId: "tenant-1",
        action: "CREATE",
        entityType: "products",
      },
    });
    expect((saved[0].payload as { id: string }).id).toBe(saved[0].entityId);
    await expect(response.json()).resolves.toMatchObject({
      id: saved[0].entityId,
      action: "CREATE",
      _savedOffline: true,
      _offlinePending: true,
    });
    expect(upsertCachedEntity).toHaveBeenCalledWith(
      "audit-logs",
      expect.objectContaining({ id: saved[0].entityId }),
      true
    );
  });

  it("network-failed PUT queues the entity ID and replacement payload", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    await offlineApiRequest("PUT", "/api/products/product-7", {
      name: "Replacement",
    });

    expect(saved[0]).toMatchObject({
      method: "PUT",
      url: "/api/products/product-7",
      entityId: "product-7",
      payload: { name: "Replacement" },
    });
  });

  it("network-failed DELETE queues a tombstone even with no body", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    await offlineApiRequest("DELETE", "/api/categories/category-4");

    expect(saved[0]).toMatchObject({
      method: "DELETE",
      url: "/api/categories/category-4",
      entityId: "category-4",
      payload: null,
    });
    expect(removeCachedEntity).toHaveBeenCalledWith("categories", "category-4");
  });

  it("network-failed PATCH preserves partial update semantics", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    await offlineApiRequest(
      "PATCH",
      "/api/products/product-7",
      { minStockAlert: 4 },
      { collection: "products" }
    );

    expect(saved[0]).toMatchObject({
      method: "PATCH",
      url: "/api/products/product-7",
      entityId: "product-7",
      payload: { minStockAlert: 4 },
    });
  });

  it.each([
    ["products", "/api/products/product-1", "product-1"],
    ["categories", "/api/categories/category-1", "category-1"],
    ["customers", "/api/customers/customer-1", "customer-1"],
    ["suppliers", "/api/suppliers/supplier-1", "supplier-1"],
    ["staff", "/api/staff/staff-1", "staff-1"],
    ["settings", "/api/settings/setting-1", "setting-1"],
  ])("queues offline DELETE for %s", async (collection, url, entityId) => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));

    await offlineApiRequest("DELETE", url, undefined, { collection });

    expect(saved[0]).toMatchObject({
      method: "DELETE",
      url,
      collection,
      entityId,
      payload: null,
    });
  });

  it.each([
    ["reports", "/api/sales/tenant-1/report/start/end"],
    ["audit-logs", "/api/audit-logs/tenant-1"],
  ])("serves cached %s reads when offline", async (collection, url) => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
    vi.mocked(getCachedResponse).mockResolvedValueOnce([{ id: "cached-1" }]);

    const response = await offlineApiRequest("GET", url, undefined, {
      collection,
    });

    await expect(response.json()).resolves.toEqual([{ id: "cached-1" }]);
    expect(getCachedResponse).toHaveBeenCalledWith(url, collection);
  });

  it("returns an empty settings collection on the first local launch", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    setInstallMode("local");
    vi.mocked(getCachedResponse).mockResolvedValueOnce(null);

    const response = await offlineApiRequest(
      "GET",
      "/api/settings?tenantId=local",
      undefined,
      { collection: "settings" }
    );

    expect(fetch).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual([]);
  });

  it.each([400, 401, 403, 409])(
    "does not queue HTTP %s as a network failure",
    async (status) => {
      const response = new Response("server response", { status });
      vi.mocked(fetch).mockResolvedValueOnce(response);

      await expect(
        offlineApiRequest("POST", "/api/products", { name: "Rejected" })
      ).rejects.toBe(response);
      expect(saved).toHaveLength(0);
    }
  );

  describe("local stock adjustments patch the cached product", () => {
    const product = {
      id: "product-1",
      name: "Widget",
      stocks: { quantity: 5, reservedQuantity: 0, lastUpdated: "t0" },
      variants: [],
    };

    it("adds the queued quantity to the cached product on a stock entry", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.mocked(getCachedResponse).mockResolvedValueOnce([product]);

      await offlineApiRequest(
        "POST",
        "/api/stock/product-1/entry",
        { productId: "product-1", quantity: 3, tenantId: "tenant-1" },
        { collection: "stock_entry" }
      );

      expect(getCachedResponse).toHaveBeenCalledWith(
        "/api/products/tenant-1",
        "products"
      );
      expect(upsertCachedEntity).toHaveBeenCalledWith(
        "products",
        expect.objectContaining({
          id: "product-1",
          stocks: expect.objectContaining({ quantity: 8 }),
        }),
        false
      );
      expect(upsertCachedEntity).toHaveBeenCalledWith(
        "stock",
        expect.objectContaining({
          productId: "product-1",
          type: "entry",
          quantity: 3,
          previousQuantity: 5,
          newQuantity: 8,
        }),
        true,
        "/api/stock/product-1/movements"
      );
    });

    it("subtracts the queued quantity on a stock exit, never going below zero", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.mocked(getCachedResponse).mockResolvedValueOnce([product]);

      await offlineApiRequest(
        "POST",
        "/api/stock/product-1/exit",
        { productId: "product-1", quantity: 100, tenantId: "tenant-1" },
        { collection: "stock_exit" }
      );

      expect(upsertCachedEntity).toHaveBeenCalledWith(
        "products",
        expect.objectContaining({ stocks: expect.objectContaining({ quantity: 0 }) }),
        false
      );
    });

    it("adjusts the specific variant's quantity instead of the top-level stocks when variantId is set", async () => {
      const variantProduct = {
        id: "product-2",
        name: "Shirt",
        stocks: null,
        variants: [
          { id: "variant-1", quantity: 4 },
          { id: "variant-2", quantity: 10 },
        ],
      };
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.mocked(getCachedResponse).mockResolvedValueOnce([variantProduct]);

      await offlineApiRequest(
        "POST",
        "/api/stock/variant/variant-1/entry",
        {
          productId: "product-2",
          variantId: "variant-1",
          quantity: 2,
          tenantId: "tenant-1",
        },
        { collection: "stock_entry" }
      );

      expect(upsertCachedEntity).toHaveBeenCalledWith(
        "products",
        expect.objectContaining({
          variants: [
            { id: "variant-1", quantity: 6 },
            { id: "variant-2", quantity: 10 },
          ],
        }),
        false
      );
      expect(upsertCachedEntity).toHaveBeenCalledWith(
        "stock",
        expect.objectContaining({ variantId: "variant-1", quantity: 2 }),
        true,
        "/api/stock/variant/variant-1/movements"
      );
    });

    it("does nothing when the product isn't in the cached list yet", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.mocked(getCachedResponse).mockResolvedValueOnce([]);

      await offlineApiRequest(
        "POST",
        "/api/stock/product-missing/entry",
        { productId: "product-missing", quantity: 3, tenantId: "tenant-1" },
        { collection: "stock_entry" }
      );

      expect(upsertCachedEntity).not.toHaveBeenCalledWith(
        "products",
        expect.objectContaining({ id: "product-missing" }),
        expect.anything()
      );
    });
  });

  describe("local pricing rule mutations embed into the cached product", () => {
    it("appends a newly created rule to the product's embedded pricingRules array, not just the pricing sub-list", async () => {
      const product = { id: "product-1", name: "Widget", pricingRules: [] };
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.mocked(getCachedResponse).mockImplementation(async (key, collection) => {
        if (collection === "products" && key === "/api/products/tenant-1") {
          return [product];
        }
        return null;
      });

      await offlineApiRequest(
        "POST",
        "/api/products/product-1/pricing",
        {
          productId: "product-1",
          tenantId: "tenant-1",
          priceType: "wholesale",
          price: "900",
          minQuantity: 12,
          isActive: true,
        },
        { collection: "products", listKey: "/api/products/pricing/product-1" }
      );

      expect(upsertCachedEntity).toHaveBeenCalledWith(
        "products",
        expect.objectContaining({
          id: "product-1",
          pricingRules: [
            expect.objectContaining({
              productId: "product-1",
              priceType: "wholesale",
              price: "900",
              minQuantity: 12,
            }),
          ],
        }),
        false
      );
      vi.mocked(getCachedResponse).mockReset();
    });

    it("replaces the matching rule in place when editing an existing pricing rule", async () => {
      const product = {
        id: "product-1",
        name: "Widget",
        pricingRules: [
          { id: "rule-1", productId: "product-1", priceType: "wholesale", price: "900" },
        ],
      };
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.mocked(getCachedResponse).mockImplementation(async (key, collection) => {
        if (collection === "products" && key === "/api/products/tenant-1") {
          return [product];
        }
        return null;
      });

      await offlineApiRequest(
        "PUT",
        "/api/products/pricing/rule-1",
        { productId: "product-1", tenantId: "tenant-1", priceType: "wholesale", price: "850" },
        {
          collection: "products",
          entityId: "rule-1",
          listKey: "/api/products/pricing/product-1",
        }
      );

      expect(upsertCachedEntity).toHaveBeenCalledWith(
        "products",
        expect.objectContaining({
          id: "product-1",
          pricingRules: [expect.objectContaining({ id: "rule-1", price: "850" })],
        }),
        false
      );
      vi.mocked(getCachedResponse).mockReset();
    });

    it("does nothing when the product isn't in the cached list yet", async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError("fetch failed"));
      vi.mocked(getCachedResponse).mockResolvedValueOnce(null);

      await offlineApiRequest(
        "POST",
        "/api/products/product-missing/pricing",
        {
          productId: "product-missing",
          tenantId: "tenant-1",
          priceType: "wholesale",
          price: "900",
        },
        {
          collection: "products",
          listKey: "/api/products/pricing/product-missing",
        }
      );

      expect(upsertCachedEntity).not.toHaveBeenCalledWith(
        "products",
        expect.objectContaining({ id: "product-missing", pricingRules: expect.anything() }),
        false
      );
    });
  });
});
