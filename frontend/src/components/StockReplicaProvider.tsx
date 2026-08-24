import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  startStockReplication,
  type StockReplicaHandle,
} from "../lib/stockReplica";

/**
 * Keeps a local, tenant-scoped stock-movements replica pulled live from the
 * CouchDB read proxy. Nothing reads from this replica yet - matches
 * ProductsReplicaProvider's scope boundary.
 */
export function StockReplicaProvider() {
  const { isAuthenticated, isLoading, tenant } = useAuth();

  useEffect(() => {
    if (isLoading || !isAuthenticated || !tenant) return;

    let cancelled = false;
    let handle: StockReplicaHandle | null = null;

    startStockReplication(tenant.id).then((started) => {
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
