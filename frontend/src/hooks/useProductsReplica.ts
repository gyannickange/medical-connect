import { useEffect, useState } from "react";
import { createPouchDB } from "../lib/pouchdb";
import {
  isActiveProductDoc,
  mapReplicaDocToProduct,
  productsReplicaDatabaseName,
  replicaProductId,
  type ReplicaProduct,
  type ReplicaProductDoc,
} from "../lib/productsReplica";

export type { ReplicaProduct } from "../lib/productsReplica";

/**
 * Reads live from the tenant's local products replica (kept populated by
 * ProductsReplicaProvider, mounted once in App.tsx) instead of fetching via
 * REST. Reflects changes replicated from CouchDB - including edits made on
 * other devices - without a manual refresh. Excludes `lock_<productId>`
 * documents, which live in the same database.
 *
 * Returns `null` while the initial read is still in flight, distinct from
 * an empty array (no products yet) - callers can use this to distinguish
 * "still loading" from "genuinely empty".
 */
export function useProductsReplica(
  tenantId: string | undefined
): ReplicaProduct[] | null {
  const [products, setProducts] = useState<ReplicaProduct[] | null>(null);

  useEffect(() => {
    if (!tenantId) {
      setProducts(null);
      return;
    }

    let cancelled = false;
    let changesFeed: { cancel: () => void } | null = null;
    const byId = new Map<string, ReplicaProduct>();

    const applyDoc = (doc: ReplicaProductDoc) => {
      // Drop deleted docs and archived (inactive) products from the active
      // list. Deleting from `byId` is important here: when a live change
      // arrives flipping isActive to false, the product must be removed, not
      // just skipped on insert.
      if ((doc as any)._deleted || !isActiveProductDoc(doc)) {
        byId.delete(replicaProductId(doc));
        return;
      }
      byId.set(replicaProductId(doc), mapReplicaDocToProduct(doc));
    };

    const publish = () => {
      if (!cancelled) setProducts(Array.from(byId.values()));
    };

    createPouchDB(productsReplicaDatabaseName(tenantId)).then(async (db: any) => {
      if (cancelled) return;

      const initial = await db.allDocs({ include_docs: true });
      if (cancelled) return;
      for (const row of initial.rows) {
        applyDoc(row.doc);
      }
      publish();

      changesFeed = db
        .changes({ since: "now", live: true, include_docs: true })
        .on("change", (event: any) => {
          applyDoc(event.doc);
          publish();
        });
    });

    return () => {
      cancelled = true;
      changesFeed?.cancel();
    };
  }, [tenantId]);

  return products;
}
