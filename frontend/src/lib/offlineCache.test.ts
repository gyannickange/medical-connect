import { describe, expect, it, vi } from "vitest";
import {
  removeEntityFromValue,
  upsertEntityInValue,
} from "./offlineCacheTransforms";

// `offlineCache` transitively imports `pouchdb`, whose `pouchdbAuth` singleton
// reads `localStorage` at module load - stub it before importing (same
// workaround as deviceMasterKey.test.ts) so this pure-function test can run
// in Vitest's node environment.
vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
});

// Fake, in-memory replacement for the encrypted PouchDB the real cache uses,
// so upsertCachedEntity's list-matching/seeding logic can be exercised
// end-to-end without a browser IndexedDB.
function fakeCacheDb() {
  const store = new Map<string, any>();
  let rev = 0;
  return {
    store,
    async allDocs({ include_docs }: { include_docs: boolean }) {
      return {
        rows: Array.from(store.values()).map((doc) => ({
          id: doc._id,
          doc: include_docs ? doc : undefined,
        })),
      };
    },
    async get(id: string) {
      const doc = store.get(id);
      if (!doc) throw { name: "not_found", status: 404 };
      return doc;
    },
    async put(doc: any) {
      rev += 1;
      const stored = { ...doc, _rev: `${rev}-fake` };
      store.set(doc._id, stored);
      return { ok: true, rev: stored._rev };
    },
  };
}

vi.mock("./encryptedPouchDB", () => ({
  createEncryptedLocalPouchDB: vi.fn(async () => fakeCacheDb()),
}));

const {
  listCacheKeyFor,
  putWithConflictRetry,
  upsertCachedEntity,
  getCachedResponse,
} = await import("./offlineCache");

describe("offline cache tombstones", () => {
  it("removes a deleted entity from root and nested cached collections", () => {
    const cached = {
      items: [
        { id: "keep", name: "Keep" },
        { id: "delete-me", name: "Delete" },
      ],
      nested: {
        variants: [
          { id: "delete-me", name: "Nested delete" },
          { id: "nested-keep", name: "Nested keep" },
        ],
      },
    };

    const result = removeEntityFromValue(cached, "delete-me");

    expect(result.changed).toBe(true);
    expect(result.value).toEqual({
      items: [{ id: "keep", name: "Keep" }],
      nested: {
        variants: [{ id: "nested-keep", name: "Nested keep" }],
      },
    });
  });
});

describe("putWithConflictRetry", () => {
  it("re-reads and retries when a concurrent write causes a 409 conflict", async () => {
    // Simulates another caller committing a change to the doc in the gap
    // between our read and our write (e.g. two parallel Settings field
    // saves both touching the single cached settings-list document): the
    // first `get()` call hands back a stale snapshot but also applies that
    // concurrent write to `stored`, so the first `put()` lands on a stale
    // rev and must retry against the now-current doc instead of throwing.
    let stored: any = { _id: "doc-1", _rev: "1-x", count: 0 };
    let getCalls = 0;
    const db = {
      get: vi.fn(async () => {
        const snapshot = { ...stored };
        if (getCalls === 0) {
          stored = { ...stored, _rev: "2-x", count: stored.count + 100 };
        }
        getCalls++;
        return snapshot;
      }),
      put: vi.fn(async (doc: any) => {
        if (doc._rev !== stored._rev) {
          throw { name: "conflict", status: 409, message: "Document update conflict" };
        }
        stored = { ...doc, _rev: "3-x" };
        return { ok: true };
      }),
    };

    await putWithConflictRetry(db, "doc-1", (existing) => ({
      ...existing,
      count: (existing?.count ?? 0) + 1,
    }));

    expect(stored.count).toBe(101);
    expect(db.get).toHaveBeenCalledTimes(2);
    expect(db.put).toHaveBeenCalledTimes(2);
  });

  it("skips the write entirely when buildDoc returns undefined", async () => {
    const db = {
      get: vi.fn(async () => ({ _id: "doc-1", _rev: "1-x", count: 0 })),
      put: vi.fn(),
    };

    await putWithConflictRetry(db, "doc-1", () => undefined);

    expect(db.put).not.toHaveBeenCalled();
  });

  it("re-throws non-conflict errors without retrying", async () => {
    const db = {
      get: vi.fn(async () => ({ _id: "doc-1", _rev: "1-x" })),
      put: vi.fn().mockRejectedValueOnce({ name: "forbidden", status: 403 }),
    };

    await expect(
      putWithConflictRetry(db, "doc-1", (existing) => ({ ...existing, x: 1 }))
    ).rejects.toMatchObject({ name: "forbidden" });
    expect(db.put).toHaveBeenCalledTimes(1);
  });
});

describe("listCacheKeyFor", () => {
  it("scopes most collections by tenant path segment", () => {
    expect(listCacheKeyFor("products", "local")).toBe("/api/products/local");
    expect(listCacheKeyFor("customers", "t1")).toBe("/api/customers/t1");
  });

  it("scopes settings by tenant query param, matching SettingsContext's real request URL", () => {
    expect(listCacheKeyFor("settings", "local")).toBe(
      "/api/settings?tenantId=local"
    );
  });

  it("omits tenant scoping entirely when no tenant is known", () => {
    expect(listCacheKeyFor("settings", null)).toBe("/api/settings");
    expect(listCacheKeyFor("products", null)).toBe("/api/products");
  });
});

describe("offline cache optimistic saves", () => {
  it("appends an offline create to a cached list", () => {
    const result = upsertEntityInValue(
      [{ id: "existing", name: "Existing" }],
      { id: "offline-1", name: "Offline", _offlinePending: true },
      true
    );

    expect(result.changed).toBe(true);
    expect(result.value).toEqual([
      { id: "existing", name: "Existing" },
      { id: "offline-1", name: "Offline", _offlinePending: true },
    ]);
  });

  it("merges an offline update without duplicating the row", () => {
    const result = upsertEntityInValue(
      [{ id: "entity-1", name: "Before", phone: "123" }],
      { id: "entity-1", name: "After", _offlinePending: true },
      false
    );

    expect(result.value).toEqual([
      {
        id: "entity-1",
        name: "After",
        phone: "123",
        _offlinePending: true,
      },
    ]);
  });
});

describe("upsertCachedEntity with an explicit listKey (sub-resource lists)", () => {
  it("seeds a new sub-list at the exact listKey, not the tenant-wide list path", async () => {
    await upsertCachedEntity(
      "products",
      { id: "variant-1", sku: "SKU-A" },
      true,
      "/api/products/product-A/variants"
    );

    const seeded = await getCachedResponse(
      "/api/products/product-A/variants",
      "products"
    );
    expect(seeded).toEqual([{ id: "variant-1", sku: "SKU-A" }]);

    // Must not have leaked into the tenant-wide products list.
    const tenantList = await getCachedResponse(
      "/api/products/tenant-x",
      "products"
    );
    expect(tenantList).toBeNull();
  });

  it("appends to an already-cached sub-list found by listKey, without a tenantId on the entity", async () => {
    await upsertCachedEntity(
      "products",
      { id: "variant-2", sku: "SKU-B" },
      true,
      "/api/products/product-B/variants"
    );
    await upsertCachedEntity(
      "products",
      { id: "variant-3", sku: "SKU-C" },
      true,
      "/api/products/product-B/variants"
    );

    const list = await getCachedResponse(
      "/api/products/product-B/variants",
      "products"
    );
    expect(list).toEqual([
      { id: "variant-2", sku: "SKU-B" },
      { id: "variant-3", sku: "SKU-C" },
    ]);
  });

  it("keeps a sub-list separate from the tenant-wide list even when both are cached for the same collection", async () => {
    await upsertCachedEntity(
      "products",
      { id: "product-1", name: "Widget", tenantId: "tenant-y" },
      true
      // no listKey - tenant-wide list
    );
    await upsertCachedEntity(
      "products",
      { id: "variant-9", sku: "SKU-Z" },
      true,
      "/api/products/product-1/variants"
    );

    const tenantList = await getCachedResponse(
      "/api/products/tenant-y",
      "products"
    );
    const variantsList = await getCachedResponse(
      "/api/products/product-1/variants",
      "products"
    );
    expect(tenantList).toEqual([
      { id: "product-1", name: "Widget", tenantId: "tenant-y" },
    ]);
    expect(variantsList).toEqual([{ id: "variant-9", sku: "SKU-Z" }]);
  });
});
