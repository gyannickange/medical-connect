import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pouchdb", () => ({
  createPouchDB: vi.fn(),
}));

import { createPouchDB } from "./pouchdb";
import {
  isActiveProductDoc,
  mapReplicaDocToProduct,
  productsReplicaDatabaseName,
  productsReplicaSourceUrl,
  startProductsReplication,
  writeLocalProductDoc,
} from "./productsReplica";

describe("mapReplicaDocToProduct", () => {
  it("maps a mirrored product document to the shape Products.tsx expects", () => {
    const doc = {
      _id: "product:product-1",
      id: "product-1",
      type: "product",
      name: "Widget",
      description: "A widget",
      price: "10.00",
      cost: "5.00",
      barcode: "BARCODE1",
      qrCode: null,
      categoryId: "category-1",
      supplierId: null,
      tenantId: "tenant-1",
      minStockAlert: 10,
      isActive: true,
      createdAt: "2026-08-12T09:00:00.000Z",
      updatedAt: "2026-08-12T09:00:00.000Z",
      stocks: { quantity: 15, reservedQuantity: 1, lastUpdated: "2026-08-12T10:00:00.000Z" },
      variants: [
        { id: "variant-1", sku: "SKU-1", price: "12.00", cost: "6.00", quantity: 3, minStockAlert: 5 },
      ],
    };

    const result = mapReplicaDocToProduct(doc);

    expect(result).toMatchObject({
      id: "product-1",
      name: "Widget",
      price: "10.00",
      categoryId: "category-1",
      stocks: { quantity: 15, reservedQuantity: 1 },
      variants: [{ id: "variant-1", quantity: 3 }],
    });
  });

  it("returns null stocks and an empty variants array when the document has none yet", () => {
    const doc = {
      _id: "product-1",
      type: "product",
      name: "Widget",
      tenantId: "tenant-1",
      stocks: null,
      variants: [],
    };

    const result = mapReplicaDocToProduct(doc as any);

    expect(result.stocks).toBeNull();
    expect(result.variants).toEqual([]);
  });
});

describe("isActiveProductDoc", () => {
  const base = {
    _id: "product-1",
    type: "product",
    name: "Widget",
    tenantId: "tenant-1",
    stocks: null,
    variants: [],
  };

  it("includes active products and defaults missing isActive to active", () => {
    expect(isActiveProductDoc(base as any)).toBe(true);
    expect(isActiveProductDoc({ ...base, isActive: true } as any)).toBe(true);
  });

  it("excludes archived (inactive) products", () => {
    expect(isActiveProductDoc({ ...base, isActive: false } as any)).toBe(false);
  });

  it("excludes non-product documents such as lock docs", () => {
    expect(isActiveProductDoc({ ...base, type: "lock_product-1" } as any)).toBe(false);
  });
});

describe("productsReplicaDatabaseName", () => {
  it("uses the unified tenant database", () => {
    expect(productsReplicaDatabaseName("tenant-1")).toBe("businessconnect_tenant-1");
  });
});

describe("productsReplicaSourceUrl", () => {
  it("points at the authenticated CouchDB proxy for that tenant's database", () => {
    expect(productsReplicaSourceUrl("tenant-1")).toBe(
      "/api/couch-proxy/businessconnect_tenant-1"
    );
  });
});

describe("startProductsReplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDb() {
    const replication = { on: vi.fn(), cancel: vi.fn() };
    const db = { replicate: { from: vi.fn().mockReturnValue(replication) } };
    vi.mocked(createPouchDB).mockResolvedValue(db as any);
    return { db, replication };
  }

  it("opens the tenant's local database and starts a live, retrying pull from the proxy", async () => {
    const { db } = mockDb();

    await startProductsReplication("tenant-1");

    expect(createPouchDB).toHaveBeenCalledWith("businessconnect_tenant-1");
    expect(db.replicate.from).toHaveBeenCalledWith(
      "/api/couch-proxy/businessconnect_tenant-1",
      expect.objectContaining({ live: true, retry: true })
    );
    const options = db.replicate.from.mock.calls[0][1];
    expect(typeof options.fetch).toBe("function");
  });

  it("never writes the replication checkpoint to the read-only proxy", async () => {
    const { db } = mockDb();

    await startProductsReplication("tenant-1");

    const options = db.replicate.from.mock.calls[0][1];
    expect(options.checkpoint).toBe("target");
  });

  it("sends cookies with replication requests, since the proxy authenticates via cookie", async () => {
    const { db } = mockDb();

    await startProductsReplication("tenant-1");

    const options = db.replicate.from.mock.calls[0][1];
    const fetchSpy = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchSpy);

    await options.fetch("/some-url", { method: "GET" });

    expect(fetchSpy).toHaveBeenCalledWith(
      "/some-url",
      expect.objectContaining({ method: "GET", credentials: "same-origin" })
    );
    vi.unstubAllGlobals();
  });

  it("returns a handle that cancels the underlying replication", async () => {
    const { replication } = mockDb();

    const handle = await startProductsReplication("tenant-1");
    handle.cancel();

    expect(replication.cancel).toHaveBeenCalled();
  });

  it("reports status changes through the onChange callback", async () => {
    const { replication } = mockDb();
    const onChange = vi.fn();

    await startProductsReplication("tenant-1", onChange);

    const handlerFor = (event: string) =>
      replication.on.mock.calls.find(([name]: [string]) => name === event)?.[1];

    handlerFor("active")?.();
    expect(onChange).toHaveBeenLastCalledWith("syncing");
    handlerFor("paused")?.();
    expect(onChange).toHaveBeenLastCalledWith("paused");
    handlerFor("error")?.();
    expect(onChange).toHaveBeenLastCalledWith("error");
  });
});

describe("writeLocalProductDoc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDb(existing: any = null) {
    const store = new Map<string, any>();
    if (existing) store.set(existing._id, existing);
    const db = {
      get: vi.fn(async (id: string) => {
        const doc = store.get(id);
        if (!doc) throw { name: "not_found", status: 404 };
        return doc;
      }),
      put: vi.fn(async (doc: any) => {
        store.set(doc._id, doc);
        return { ok: true };
      }),
    };
    vi.mocked(createPouchDB).mockResolvedValue(db as any);
    return db;
  }

  it("writes a new product doc in the exact shape useProductsReplica expects", async () => {
    const db = mockDb();

    await writeLocalProductDoc({
      id: "prod-1",
      name: "Coca-Cola",
      price: 1.5,
      cost: 0.8,
      tenantId: "local",
    });

    expect(createPouchDB).toHaveBeenCalledWith("businessconnect_local");
    const written = db.put.mock.calls[0][0];
    expect(written).toMatchObject({
      _id: "product:prod-1",
      type: "product",
      id: "prod-1",
      name: "Coca-Cola",
      price: "1.50",
      cost: "0.80",
      tenantId: "local",
      isActive: true,
      minStockAlert: 10,
      variants: [],
    });
    expect(written.stocks).toEqual({
      quantity: 0,
      reservedQuantity: 0,
      lastUpdated: expect.any(String),
    });
  });

  it("preserves _rev, createdAt, stocks and existing variants when updating", async () => {
    const existing = {
      _id: "product:prod-1",
      _rev: "1-abc",
      createdAt: "2026-01-01T00:00:00.000Z",
      stocks: { quantity: 5, reservedQuantity: 1, lastUpdated: "2026-01-02T00:00:00.000Z" },
      variants: [{ id: "v1", sku: "S1" }],
    };
    const db = mockDb(existing);

    await writeLocalProductDoc({
      id: "prod-1",
      name: "Coca-Cola (renamed)",
      price: 2,
      cost: 1,
      tenantId: "local",
    });

    const written = db.put.mock.calls[0][0];
    expect(written._rev).toBe("1-abc");
    expect(written.createdAt).toBe("2026-01-01T00:00:00.000Z");
    expect(written.stocks).toEqual(existing.stocks);
    expect(written.variants).toMatchObject(existing.variants);
    expect(written.name).toBe("Coca-Cola (renamed)");
  });

  it("writes provided variants with generated ids and formatted prices", async () => {
    const db = mockDb();

    await writeLocalProductDoc({
      id: "prod-1",
      name: "Shirt",
      price: 20,
      cost: 10,
      tenantId: "local",
      variants: [{ sku: "S", price: "22.5", cost: "11", quantity: 3 }],
    });

    const written = db.put.mock.calls[0][0];
    expect(written.variants).toHaveLength(1);
    expect(written.variants[0]).toMatchObject({
      sku: "S",
      price: "22.50",
      cost: "11.00",
      quantity: 3,
    });
    expect(typeof written.variants[0].id).toBe("string");
  });
});
