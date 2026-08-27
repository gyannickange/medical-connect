import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pouchdb", () => ({
  createPouchDB: vi.fn(),
}));

import { createPouchDB } from "./pouchdb";
import {
  stockReplicaDatabaseName,
  stockReplicaSourceUrl,
  startStockReplication,
} from "./stockReplica";

describe("stockReplicaDatabaseName", () => {
  it("uses the unified tenant database", () => {
    expect(stockReplicaDatabaseName("tenant-1")).toBe("medicalconnect_tenant-1");
  });
});

describe("stockReplicaSourceUrl", () => {
  it("points at the authenticated CouchDB proxy for that tenant's stock database", () => {
    expect(stockReplicaSourceUrl("tenant-1")).toBe(
      "/api/couch-proxy/medicalconnect_tenant-1"
    );
  });
});

describe("startStockReplication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockDb() {
    const replication = { on: vi.fn(), cancel: vi.fn() };
    const db = { replicate: { from: vi.fn().mockReturnValue(replication) } };
    vi.mocked(createPouchDB).mockResolvedValue(db as any);
    return { db, replication };
  }

  it("opens the tenant's local stock database and starts a live, retrying pull from the proxy", async () => {
    const { db } = mockDb();

    await startStockReplication("tenant-1");

    expect(createPouchDB).toHaveBeenCalledWith("medicalconnect_tenant-1");
    expect(db.replicate.from).toHaveBeenCalledWith(
      "/api/couch-proxy/medicalconnect_tenant-1",
      expect.objectContaining({ live: true, retry: true, checkpoint: "target" })
    );
    const options = db.replicate.from.mock.calls[0][1];
    expect(typeof options.fetch).toBe("function");
  });

  it("sends cookies with replication requests, since the proxy authenticates via cookie", async () => {
    const { db } = mockDb();

    await startStockReplication("tenant-1");

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

    const handle = await startStockReplication("tenant-1");
    handle.cancel();

    expect(replication.cancel).toHaveBeenCalled();
  });
});
