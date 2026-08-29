// Offline cache management - permanent storage (no expiration)
import { createEncryptedLocalPouchDB } from "./encryptedPouchDB";
import { DeviceMasterKeyUnavailableError } from "./deviceMasterKey";
import {
  removeEntityFromValue,
  upsertEntityInValue,
} from "./offlineCacheTransforms";

// The browser/"connected" build has no OS keyring-backed device master key
// (see installMode.ts), so every attempt to open the encrypted cache DB
// throws this - expected there on every read/write, not a real failure.
// Logging it as console.error would spam the console on every successful
// API call; anything else is a genuine, unexpected cache failure worth
// surfacing.
function logCacheError(action: string, error: unknown): void {
  if (error instanceof DeviceMasterKeyUnavailableError) return;
  console.error(action, error);
}

let cacheDb: any = null;

// Get or create cache database instance
async function getCacheDB() {
  if (!cacheDb) {
    cacheDb = await createEncryptedLocalPouchDB("medicalconnect_cache");
  }
  return cacheDb;
}

// Simple hash for cache keys
function hashKey(key: string): string {
  return btoa(key).replace(/[^a-zA-Z0-9]/g, "_");
}

/**
 * Read-modify-write against a single cache doc, retrying on PouchDB's 409
 * conflict when two writes race (e.g. Settings saving several fields in
 * parallel all touch the one cached settings-list document). `buildDoc`
 * receives the latest doc on every attempt and returns `undefined` to skip
 * the write entirely (no-op update).
 */
export async function putWithConflictRetry(
  db: any,
  docId: string,
  buildDoc: (existing: any | null) => any | undefined,
  attempts = 5
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    let existing: any = null;
    try {
      existing = await db.get(docId);
    } catch {
      existing = null;
    }

    const doc = buildDoc(existing);
    if (doc === undefined) return;

    try {
      await db.put(doc);
      return;
    } catch (error: any) {
      if (error?.name === "conflict" && attempt < attempts - 1) continue;
      throw error;
    }
  }
}

// Most list endpoints scope the tenant as a path segment
// (`/api/products/:tenantId`), but `/api/settings` scopes it as a query
// param instead (`/api/settings?tenantId=`) - the seeded cache key must
// match the real request URL exactly, or a fresh local install's first
// offline write becomes permanently invisible to later reads.
export function listCacheKeyFor(
  collection: string,
  tenantId: string | null
): string {
  if (!tenantId) return `/api/${collection}`;
  if (collection === "settings") return `/api/${collection}?tenantId=${tenantId}`;
  return `/api/${collection}/${tenantId}`;
}

// Cache GET response permanently
export async function cacheGetResponse(
  cacheKey: string,
  data: any,
  collection: string
): Promise<void> {
  try {
    const db = await getCacheDB();
    const docId = `cache_${collection}_${hashKey(cacheKey)}`;

    await putWithConflictRetry(db, docId, (existing) => ({
      _id: docId,
      ...(existing?._rev ? { _rev: existing._rev } : {}),
      cacheKey,
      collection,
      data,
      cachedAt: Date.now(),
      type: "cache",
    }));
  } catch (error) {
    logCacheError("Failed to cache response:", error);
  }
}

// Retrieve cached GET response
export async function getCachedResponse(
  cacheKey: string,
  collection: string
): Promise<any | null> {
  try {
    const db = await getCacheDB();
    const docId = `cache_${collection}_${hashKey(cacheKey)}`;
    const doc = await db.get(docId);
    return doc.data;
  } catch (error) {
    return null;
  }
}

/** Remove an offline-deleted entity from every cached response in its collection. */
export async function removeCachedEntity(
  collection: string,
  entityId: string
): Promise<void> {
  try {
    const db = await getCacheDB();
    const result = await db.allDocs({ include_docs: true });

    for (const row of result.rows) {
      const document = row.doc;
      if (!document || document.type !== "cache" || document.collection !== collection) {
        continue;
      }

      await putWithConflictRetry(db, document._id, (existing) => {
        const base = existing ?? document;
        const updated = removeEntityFromValue(base.data, entityId);
        return updated.changed
          ? { ...base, data: updated.value, cachedAt: Date.now() }
          : undefined;
      });
    }
  } catch (error) {
    logCacheError("Failed to apply offline delete to cache:", error);
  }
}

/**
 * Add or merge an offline-created/updated entity into cached list responses.
 *
 * `collection` alone only identifies a tenant-wide list (`/api/{collection}/
 * {tenantId}`, e.g. the main products list). Parent-scoped sub-resources -
 * a product's variants, a product's pricing rules - live under a completely
 * different URL (`/api/products/{productId}/variants`) that can't be derived
 * from `collection` + `entity.tenantId` alone. Pass `listKey` (the exact URL
 * the matching GET reads from) for those; omit it for the tenant-wide case.
 */
export async function upsertCachedEntity(
  collection: string,
  entity: Record<string, unknown>,
  appendIfMissing: boolean,
  listKey?: string
): Promise<void> {
  try {
    const db = await getCacheDB();
    const result = await db.allDocs({ include_docs: true });
    const tenantId = typeof entity.tenantId === "string" ? entity.tenantId : null;
    // Matching against an *existing* cached doc only needs the pathname
    // (query-string-agnostic); seeding a brand-new one needs the exact key.
    const expectedSeedKey = listKey ?? listCacheKeyFor(collection, tenantId);
    const expectedPath = new URL(expectedSeedKey, "http://offline.local").pathname;
    let matchedExistingList = false;

    for (const row of result.rows) {
      const document = row.doc;
      if (!document || document.type !== "cache" || document.collection !== collection) {
        continue;
      }
      // A `listKey` already pins the exact target list by full URL - the
      // tenant-substring check below is only meaningful (and needed to keep
      // a tenant-wide list from matching an unrelated cached doc) when
      // falling back to tenant-derived scoping.
      if (!listKey && tenantId && !String(document.cacheKey).includes(tenantId)) {
        continue;
      }
      if (appendIfMissing) {
        const cacheUrl = new URL(String(document.cacheKey), "http://offline.local");
        if (cacheUrl.pathname !== expectedPath) continue;
        matchedExistingList = true;
      }

      await putWithConflictRetry(db, document._id, (existing) => {
        const base = existing ?? document;
        const updated = upsertEntityInValue(base.data, entity, appendIfMissing);
        return updated.changed
          ? { ...base, data: updated.value, cachedAt: Date.now() }
          : undefined;
      });
    }

    // A collection that was never successfully fetched over the network has
    // no cached list document to append into yet (e.g. the very first
    // offline-created item in a fresh local install). Seed one now so the
    // entity appears immediately instead of only after the next real sync.
    if (appendIfMissing && !matchedExistingList) {
      await cacheGetResponse(expectedSeedKey, [entity], collection);
    }
  } catch (error) {
    logCacheError("Failed to apply offline save to cache:", error);
  }
}

// Get cache timestamp (for UI display)
export async function getCacheTimestamp(
  cacheKey: string,
  collection: string
): Promise<number | null> {
  try {
    const db = await getCacheDB();
    const docId = `cache_${collection}_${hashKey(cacheKey)}`;
    const doc = await db.get(docId);
    return doc.cachedAt;
  } catch (error) {
    return null;
  }
}

// Get cache info (count of cached items)
export async function getCacheInfo(): Promise<{ docCount: number } | null> {
  try {
    const db = await getCacheDB();
    const info = await db.info();
    return { docCount: info.doc_count };
  } catch (error) {
    logCacheError("Failed to get cache info:", error);
    return null;
  }
}

// Manual cache clearing (user-initiated only)
export async function clearAllCache(): Promise<void> {
  try {
    const db = await getCacheDB();
    const allDocs = await db.allDocs({ include_docs: true });

    for (const row of allDocs.rows) {
      if (row.id.startsWith("cache_") && row.doc) {
        await db.remove(row.doc);
      }
    }
  } catch (error) {
    console.error("Failed to clear cache:", error);
    throw error;
  }
}
