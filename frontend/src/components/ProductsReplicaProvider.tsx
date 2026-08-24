import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getInstallMode } from "../lib/installMode";
import {
  startProductsReplication,
  type ProductsReplicaHandle,
} from "../lib/productsReplica";

/**
 * Keeps a local, tenant-scoped product replica pulled live from the CouchDB
 * read proxy. Nothing reads from this replica yet - this only proves the
 * sync pipe stays populated for the UI wiring that comes next.
 */
export function ProductsReplicaProvider() {
  const { isAuthenticated, isLoading, tenant } = useAuth();

  useEffect(() => {
    // A "local" install never has a server to reach - ProductModal writes
    // straight into this replica database instead, so there is nothing to
    // pull, and attempting the proxy request anyway would just fail.
    if (isLoading || !isAuthenticated || !tenant || getInstallMode() === "local")
      return;

    let cancelled = false;
    let handle: ProductsReplicaHandle | null = null;

    startProductsReplication(tenant.id).then((started) => {
      if (cancelled) {
        started.cancel();
      } else {
        handle = started;
      }
    });

    return () => {
      cancelled = true;
      handle?.cancel();
    };
  }, [isAuthenticated, isLoading, tenant?.id]);

  return null;
}
