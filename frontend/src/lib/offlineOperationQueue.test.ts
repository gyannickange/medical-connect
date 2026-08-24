import { describe, expect, it, vi } from "vitest";
import {
  OFFLINE_OPERATION_SCHEMA_VERSION,
  quarantineLegacyOperation,
  replayOfflineOperations,
  type OfflineOperationDocument,
} from "./offlineOperationQueue";

function operation(
  overrides: Partial<OfflineOperationDocument> = {}
): OfflineOperationDocument {
  return {
    _id: "offline_operation_op-1",
    schemaVersion: OFFLINE_OPERATION_SCHEMA_VERSION,
    operationId: "op-1",
    method: "POST",
    url: "/api/products",
    collection: "products",
    entityId: null,
    payload: { name: "Queued product" },
    tenantId: "tenant-1",
    deviceId: "device-1",
    createdAt: "2026-08-07T10:00:00.000Z",
    retryCount: 0,
    lastError: null,
    state: "pending",
    ...overrides,
  };
}

describe("offline operation replay", () => {
  it("replays offline create, update, and delete in created order after reconnect", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const request = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: String(init?.method), url: String(url) });
      return new Response(null, { status: 204 });
    });
    const operations = [
      operation({
        _id: "offline_operation_delete",
        operationId: "delete",
        method: "DELETE",
        url: "/api/products/product-1",
        entityId: "product-1",
        payload: null,
        createdAt: "2026-08-07T10:00:03.000Z",
      }),
      operation({
        _id: "offline_operation_update",
        operationId: "update",
        method: "PUT",
        url: "/api/products/product-1",
        entityId: "product-1",
        payload: { name: "Updated product" },
        createdAt: "2026-08-07T10:00:02.000Z",
      }),
      operation({
        _id: "offline_operation_create",
        operationId: "create",
        method: "POST",
        url: "/api/products",
        createdAt: "2026-08-07T10:00:01.000Z",
      }),
    ];

    await replayOfflineOperations(operations, async () => undefined, request);

    expect(calls).toEqual([
      { method: "POST", url: "/api/products" },
      { method: "PUT", url: "/api/products/product-1" },
      { method: "DELETE", url: "/api/products/product-1" },
    ]);
  });

  it("replay uses the original method, URL, and payload", async () => {
    const request = vi.fn(async () => new Response(null, { status: 204 }));
    const queued = operation({
      method: "PUT",
      url: "/api/products/product-7",
      entityId: "product-7",
      payload: { name: "Replacement" },
    });

    await replayOfflineOperations([queued], async () => undefined, request);

    expect(request).toHaveBeenCalledWith(
      "/api/products/product-7",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ name: "Replacement" }),
        headers: expect.objectContaining({
          "Idempotency-Key": "op-1",
          "X-Operation-Id": "op-1",
        }),
      })
    );
  });

  it("marks successful replay synced exactly once", async () => {
    const queued = operation();
    const persist = vi.fn(async () => undefined);
    const request = vi.fn(async () => new Response(null, { status: 204 }));

    await replayOfflineOperations([queued], persist, request);
    await replayOfflineOperations([queued], persist, request);

    expect(queued.state).toBe("synced");
    expect(request).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("treats replayed DELETE 404 as already applied", async () => {
    const queued = operation({
      method: "DELETE",
      url: "/api/products/product-7",
      entityId: "product-7",
      payload: null,
    });

    const summary = await replayOfflineOperations(
      [queued],
      async () => undefined,
      vi.fn(async () => new Response("missing", { status: 404 }))
    );

    expect(queued.state).toBe("synced");
    expect(summary.synced).toBe(1);
  });

  it("keeps 409 in a visible conflict state", async () => {
    const queued = operation();

    const summary = await replayOfflineOperations(
      [queued],
      async () => undefined,
      vi.fn(async () => new Response("version conflict", { status: 409 }))
    );

    expect(queued).toMatchObject({
      state: "conflict",
      retryCount: 1,
      lastError: "version conflict",
    });
    expect(summary.conflicts).toBe(1);
  });

  it("does not duplicate a create with the same operationId", async () => {
    const first = operation({ _id: "offline_operation_first" });
    const duplicate = operation({ _id: "offline_operation_duplicate" });
    const request = vi.fn(async () => new Response(null, { status: 201 }));

    await replayOfflineOperations(
      [first, duplicate],
      async () => undefined,
      request
    );

    expect(request).toHaveBeenCalledTimes(1);
    expect(first.state).toBe("synced");
    expect(duplicate.state).toBe("synced");
  });

  it("quarantines legacy records without losing their data", () => {
    const legacy = {
      _id: "pending_products_legacy",
      _rev: "1-a",
      type: "products",
      data: { name: "Legacy product" },
      timestamp: 1_700_000_000_000,
      synced: false,
      tenantId: "tenant-1",
      deviceId: "device-1",
    };

    const migrated = quarantineLegacyOperation(legacy);

    expect(migrated).toMatchObject({
      _id: legacy._id,
      _rev: legacy._rev,
      collection: "products",
      payload: legacy.data,
      state: "quarantined",
      legacyRecord: legacy,
    });
  });

  it("accepts a 204 response without parsing JSON", async () => {
    const response = {
      ok: true,
      status: 204,
      json: vi.fn(() => {
        throw new Error("JSON must not be read");
      }),
    } as unknown as Response;

    await expect(
      replayOfflineOperations(
        [operation()],
        async () => undefined,
        vi.fn(async () => response)
      )
    ).resolves.toMatchObject({ synced: 1 });
    expect(response.json).not.toHaveBeenCalled();
  });
});
