import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./pouchdb", () => ({
  createPouchDB: vi.fn(),
}));

import { createPouchDB } from "./pouchdb";
import {
  categoriesReplicaDatabaseName,
  categoriesReplicaSourceUrl,
  startCategoriesReplication,
} from "./categoriesReplica";

describe("categoriesReplicaDatabaseName", () => {
  it("uses the unified tenant database", () => {
    expect(categoriesReplicaDatabaseName("tenant-1")).toBe("businessconnect_tenant-1");
  });
});

describe("categoriesReplicaSourceUrl", () => {
  it("points at the authenticated CouchDB proxy for that tenant's categories database", () => {
    expect(categoriesReplicaSourceUrl("tenant-1")).toBe(
      "/api/couch-proxy/businessconnect_tenant-1"
    );
  });
});

describe("startCategoriesReplication", () => {
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

    await startCategoriesReplication("tenant-1");

    expect(createPouchDB).toHaveBeenCalledWith("businessconnect_tenant-1");
    expect(db.replicate.from).toHaveBeenCalledWith(
      "/api/couch-proxy/businessconnect_tenant-1",
      expect.objectContaining({ live: true, retry: true, checkpoint: "target" })
    );
    const options = db.replicate.from.mock.calls[0][1];
    expect(typeof options.fetch).toBe("function");
  });

  it("sends cookies with replication requests, since the proxy authenticates via cookie", async () => {
    const { db } = mockDb();

    await startCategoriesReplication("tenant-1");

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

    const handle = await startCategoriesReplication("tenant-1");
    handle.cancel();

    expect(replication.cancel).toHaveBeenCalled();
  });

  it("reports status changes through the onChange callback", async () => {
    const { replication } = mockDb();
    const onChange = vi.fn();

    await startCategoriesReplication("tenant-1", onChange);

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
