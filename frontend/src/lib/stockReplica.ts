import { createPouchDB } from "./pouchdb";

export interface StockReplicaHandle {
  cancel: () => void;
}

export function stockReplicaDatabaseName(tenantId: string): string {
  return `medicalconnect_${tenantId}`;
}

export function stockReplicaSourceUrl(tenantId: string): string {
  // PouchDB only recognizes a replication source as remote/HTTP when the
  // string is an absolute URL. A relative path like "/api/couch-proxy/..."
  // gets silently treated as a *local* database name instead - replication
  // then "completes" instantly with 0 docs and never makes a network
  // request at all. window is undefined in the (Node) unit test
  // environment, where this distinction doesn't matter.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/couch-proxy/${stockReplicaDatabaseName(tenantId)}`;
}

export async function startStockReplication(
  tenantId: string
): Promise<StockReplicaHandle> {
  const db = await createPouchDB(stockReplicaDatabaseName(tenantId));
  const replication = (db as any).replicate.from(
    stockReplicaSourceUrl(tenantId),
    {
      live: true,
      retry: true,
      // The CouchDB proxy is read-only - see the identical note in
      // productsReplica.ts.
      checkpoint: "target",
      fetch: (url: string, opts: RequestInit) =>
        fetch(url, { ...opts, credentials: "same-origin" }),
    }
  );

  return {
    cancel: () => replication.cancel(),
  };
}
