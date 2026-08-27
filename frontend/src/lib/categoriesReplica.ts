import { createPouchDB } from "./pouchdb";

export type CategoriesReplicationStatus = "syncing" | "paused" | "error";

export interface CategoriesReplicaHandle {
  cancel: () => void;
}

export function categoriesReplicaDatabaseName(tenantId: string): string {
  return `medicalconnect_${tenantId}`;
}

export function categoriesReplicaSourceUrl(tenantId: string): string {
  // PouchDB only recognizes a replication source as remote/HTTP when the
  // string is an absolute URL. A relative path like "/api/couch-proxy/..."
  // gets silently treated as a *local* database name instead - replication
  // then "completes" instantly with 0 docs and never makes a network
  // request at all. window is undefined in the (Node) unit test
  // environment, where this distinction doesn't matter.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/api/couch-proxy/${categoriesReplicaDatabaseName(tenantId)}`;
}

export async function startCategoriesReplication(
  tenantId: string,
  onChange?: (status: CategoriesReplicationStatus) => void
): Promise<CategoriesReplicaHandle> {
  const db = await createPouchDB(categoriesReplicaDatabaseName(tenantId));
  const replication = (db as any).replicate.from(
    categoriesReplicaSourceUrl(tenantId),
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
