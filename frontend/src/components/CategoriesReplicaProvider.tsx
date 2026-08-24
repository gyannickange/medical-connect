import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getInstallMode } from "../lib/installMode";
import {
  startCategoriesReplication,
  type CategoriesReplicaHandle,
} from "../lib/categoriesReplica";

/**
 * Keeps a local, tenant-scoped categories replica pulled live from the
 * CouchDB read proxy. Nothing reads from this replica yet - matches
 * ProductsReplicaProvider's scope boundary.
 */
export function CategoriesReplicaProvider() {
  const { isAuthenticated, isLoading, tenant } = useAuth();

  useEffect(() => {
    // A "local" install never has a server to reach - CategoryModal writes
    // straight into this replica database instead, so there is nothing to
    // pull, and attempting the proxy request anyway would just fail.
    if (isLoading || !isAuthenticated || !tenant || getInstallMode() === "local")
      return;

    let cancelled = false;
    let handle: CategoriesReplicaHandle | null = null;

    startCategoriesReplication(tenant.id).then((started) => {
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
