import { createPouchDB } from "./pouchdb";
import { putWithConflictRetry } from "./offlineCache";

export type ProductsReplicationStatus = "syncing" | "paused" | "error";

export interface ReplicaVariant {
  id: string;
  sku: string | null;
  attributes?: unknown;
  price: string | null;
  cost: string | null;
  barcode?: string | null;
  quantity: number;
  minStockAlert: number;
  isActive?: boolean;
}

export interface ReplicaStocks {
  quantity: number;
  reservedQuantity: number;
  lastUpdated: string;
}

export interface ReplicaProductDoc {
  _id: string;
  _rev?: string;
  id?: string;
  type: string;
  name: string;
  description?: string | null;
  price?: string;
  cost?: string;
  barcode?: string | null;
  qrCode?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  tenantId: string;
  minStockAlert?: number;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  stocks: ReplicaStocks | null;
  variants: ReplicaVariant[];
}

export interface ReplicaProduct {
  id: string;
  name: string;
  description: string | null;
  price?: string;
  cost?: string;
  barcode: string | null;
  qrCode: string | null;
  categoryId: string | null;
  supplierId: string | null;
  tenantId: string;
  minStockAlert: number;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  stocks: ReplicaStocks | null;
  variants: ReplicaVariant[];
}

export function replicaProductId(doc: Pick<ReplicaProductDoc, "_id" | "id">): string {
  return doc.id ?? doc._id.replace(/^product:/, "");
}

/**
 * Maps a raw mirrored product document (as written by the backend's product
 * repository to CouchDB, or by `writeLocalProductDoc` for a local install)
 * to the shape Products.tsx's list view expects - minus category/supplier
 * objects, which callers resolve separately via their own categories query.
 */
export function mapReplicaDocToProduct(doc: ReplicaProductDoc): ReplicaProduct {
  return {
    id: replicaProductId(doc),
    name: doc.name,
    description: doc.description ?? null,
    price: doc.price,
    cost: doc.cost,
    barcode: doc.barcode ?? null,
    qrCode: doc.qrCode ?? null,
    categoryId: doc.categoryId ?? null,
    supplierId: doc.supplierId ?? null,
    tenantId: doc.tenantId,
    minStockAlert: doc.minStockAlert ?? 10,
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    stocks: doc.stocks ?? null,
    variants: doc.variants ?? [],
  };
}

/**
 * Whether a raw replica document should be shown in the active products list.
 * Excludes non-product docs (lock documents share the same database) and
 * archived products (`isActive: false`). Missing `isActive` defaults to active.
 */
export function isActiveProductDoc(doc: ReplicaProductDoc): boolean {
  return doc.type === "product" && doc.isActive !== false;
}

export interface LocalProductVariantWrite {
  id?: string;
  sku?: string | null;
  attributes?: unknown;
  price?: number | string | null;
  cost?: number | string | null;
  barcode?: string | null;
  quantity?: number;
  minStockAlert?: number;
  isActive?: boolean;
}

export interface LocalProductWrite {
  id: string;
  name: string;
  description?: string | null;
  price: number | string;
  cost: number | string;
  barcode?: string | null;
  qrCode?: string | null;
  categoryId?: string | null;
  supplierId?: string | null;
  rayonId?: string | null;
  tenantId: string;
  minStockAlert?: number;
  isActive?: boolean;
  variants?: LocalProductVariantWrite[];
}

export interface ProductsReplicaHandle {
  cancel: () => void;
}

export function productsReplicaDatabaseName(tenantId: string): string {
  return `businessconnect_${tenantId}`;
}

export function productsReplicaSourceUrl(tenantId: string): string {
  // PouchDB only recognizes a replication source as remote/HTTP when the
  // string is an absolute URL. A relative path like "/api/couch-proxy/..."
  // gets silently treated as a *local* database name instead - replication
  // then "completes" instantly with 0 docs and never makes a network
  // request at all. window is undefined in the (Node) unit test
  // environment, where this distinction doesn't matter.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/couch-proxy/${productsReplicaDatabaseName(tenantId)}`;
}

export async function startProductsReplication(
  tenantId: string,
  onChange?: (status: ProductsReplicationStatus) => void
): Promise<ProductsReplicaHandle> {
  const db = await createPouchDB(productsReplicaDatabaseName(tenantId));
  const replication = (db as any).replicate.from(
    productsReplicaSourceUrl(tenantId),
    {
      live: true,
      retry: true,
      // The CouchDB proxy is intentionally read-only (GET/HEAD only) - never
      // let PouchDB write its replication checkpoint to the remote source,
      // only to the local target. Without this, PouchDB's default behavior
      // (writing to both sides) gets a 403 from the proxy and replication
      // never progresses.
      checkpoint: "target",
      // PouchDB's HTTP adapter does not send cookies by default, so the
      // proxy's auth check (which reads the access_token cookie) would see
      // every request as unauthenticated without this.
      fetch: (url: string, opts: RequestInit) =>
        fetch(url, { ...opts, credentials: "same-origin" }),
    }
  );

  replication.on("active", () => onChange?.("syncing"));
  replication.on("paused", () => onChange?.("paused"));
  replication.on("error", () => onChange?.("error"));

  return {
    cancel: () => replication.cancel(),
  };
}

/**
 * Writes a product directly into the local products replica database,
 * matching the document shape `useProductsReplica` reads (mirroring
 * ProductsRepository.toDocument on the backend). A "local" install has no
 * CouchDB to replicate from - `startProductsReplication` never runs there -
 * so this is the only way a locally-created product becomes visible without
 * a server round-trip that local installs never make.
 */
function normalizeVariant(
  variant: LocalProductVariantWrite,
  fallbackMinStockAlert: number
): ReplicaVariant {
  return {
    id: variant.id ?? crypto.randomUUID(),
    sku: variant.sku ?? null,
    attributes: variant.attributes ?? [],
    price:
      variant.price === null || variant.price === undefined
        ? null
        : Number(variant.price).toFixed(2),
    cost:
      variant.cost === null || variant.cost === undefined
        ? null
        : Number(variant.cost).toFixed(2),
    barcode: variant.barcode ?? null,
    quantity: variant.quantity ?? 0,
    minStockAlert: variant.minStockAlert ?? fallbackMinStockAlert,
    isActive: variant.isActive ?? true,
  };
}

export async function writeLocalProductDoc(
  data: LocalProductWrite
): Promise<ReplicaProduct> {
  const db = await createPouchDB(productsReplicaDatabaseName(data.tenantId));
  const docId = `product:${data.id}`;
  let written: ReplicaProductDoc | null = null;

  await putWithConflictRetry(db, docId, (existing: ReplicaProductDoc | null) => {
    const now = new Date().toISOString();
    const variants = (data.variants ?? existing?.variants ?? []).map((variant) =>
      normalizeVariant(variant, data.minStockAlert ?? 10)
    );

    const doc = {
      _id: docId,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      type: "product" as const,
      id: data.id,
      name: data.name,
      description: data.description ?? null,
      price: Number(data.price).toFixed(2),
      cost: Number(data.cost).toFixed(2),
      barcode: data.barcode ?? null,
      qrCode: data.qrCode ?? null,
      categoryId: data.categoryId ?? null,
      supplierId: data.supplierId ?? null,
      rayonId: data.rayonId ?? null,
      tenantId: data.tenantId,
      minStockAlert: data.minStockAlert ?? 10,
      isActive: data.isActive ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      stocks:
        existing?.stocks ?? {
          quantity: 0,
          reservedQuantity: 0,
          lastUpdated: now,
        },
      variants,
    };
    written = doc;
    return doc;
  });

  return mapReplicaDocToProduct(written as unknown as ReplicaProductDoc);
}

/** Reads every active product from the tenant's local products replica. */
export async function readLocalProductDocs(
  tenantId: string
): Promise<ReplicaProduct[]> {
  const db = await createPouchDB(productsReplicaDatabaseName(tenantId));
  const result = await db.allDocs({ include_docs: true });
  const products: ReplicaProduct[] = [];
  for (const row of result.rows) {
    const doc = row.doc as ReplicaProductDoc | undefined;
    if (doc && isActiveProductDoc(doc)) products.push(mapReplicaDocToProduct(doc));
  }
  return products;
}

/** Finds an active product by barcode in the tenant's local products replica. */
export async function findLocalProductByBarcode(
  tenantId: string,
  barcode: string
): Promise<ReplicaProduct | null> {
  const products = await readLocalProductDocs(tenantId);
  return products.find((product) => product.barcode === barcode) ?? null;
}

/** Soft-deletes a product in the local replica, matching the backend's archive semantics. */
export async function archiveLocalProductDoc(
  tenantId: string,
  productId: string
): Promise<void> {
  const db = await createPouchDB(productsReplicaDatabaseName(tenantId));
  const docId = `product:${productId}`;
  await putWithConflictRetry(db, docId, (existing) =>
    existing
      ? { ...existing, isActive: false, updatedAt: new Date().toISOString() }
      : undefined
  );
}

/** Appends one variant to a product already in the local replica. */
export async function addLocalProductVariant(
  tenantId: string,
  productId: string,
  variant: LocalProductVariantWrite
): Promise<ReplicaVariant> {
  const db = await createPouchDB(productsReplicaDatabaseName(tenantId));
  const docId = `product:${productId}`;
  let created: ReplicaVariant | null = null;

  await putWithConflictRetry(db, docId, (existing: ReplicaProductDoc | null) => {
    if (!existing) return undefined;
    const normalized = normalizeVariant(variant, existing.minStockAlert ?? 10);
    created = normalized;
    return {
      ...existing,
      variants: [...(existing.variants ?? []), normalized],
      updatedAt: new Date().toISOString(),
    };
  });

  if (!created) throw new Error(`Product ${productId} not found in local replica`);
  return created;
}
