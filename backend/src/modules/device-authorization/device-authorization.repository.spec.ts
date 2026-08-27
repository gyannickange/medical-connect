import { DeviceAuthorizationRepository } from "./device-authorization.repository";

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    get: jest.fn(),
    insert: jest.fn().mockResolvedValue({ ok: true }),
    find: jest.fn().mockResolvedValue({ docs: [] }),
    ...overrides,
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
    ensureIndex: jest.fn().mockResolvedValue(undefined),
  };
  return {
    db,
    couchDBService,
    repository: new DeviceAuthorizationRepository(couchDBService as any),
  };
}

describe("DeviceAuthorizationRepository", () => {
  it("creates a pending authorization with a deterministic id", async () => {
    const { repository, db, couchDBService } = harness();

    const created = await repository.create({
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "base64-x25519-pubkey",
    });

    expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_identity");
    expect(created.status).toBe("pending");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "device-authorization:tenant-1:device-a",
        type: "device_authorization",
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: "base64-x25519-pubkey",
        status: "pending",
      })
    );
  });

  it("finds an existing authorization by tenant and device", async () => {
    const doc = {
      _id: "device-authorization:tenant-1:device-a",
      _rev: "1-a",
      type: "device_authorization",
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "key",
      status: "approved",
      requestedAt: "2026-08-16T00:00:00.000Z",
      decidedAt: "2026-08-16T00:01:00.000Z",
      decidedByUserId: "user-1",
    };
    const { repository } = harness({ get: jest.fn().mockResolvedValue(doc) });

    const found = await repository.findByDevice("tenant-1", "device-a");

    expect(found?.status).toBe("approved");
    expect(found).not.toHaveProperty("_rev");
  });

  it("returns undefined when no authorization exists yet", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const { repository } = harness({ get: jest.fn().mockRejectedValue(notFound) });

    expect(await repository.findByDevice("tenant-1", "device-a")).toBeUndefined();
  });

  it("approves a pending authorization", async () => {
    const doc = {
      _id: "device-authorization:tenant-1:device-a",
      _rev: "1-a",
      type: "device_authorization",
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "key",
      status: "pending",
      requestedAt: "2026-08-16T00:00:00.000Z",
      decidedAt: null,
      decidedByUserId: null,
    };
    const { repository, db } = harness({ get: jest.fn().mockResolvedValue(doc) });

    const approved = await repository.approve("tenant-1", "device-a", "user-1");

    expect(approved.status).toBe("approved");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", decidedByUserId: "user-1" })
    );
  });

  it("revokes an approved authorization", async () => {
    const doc = {
      _id: "device-authorization:tenant-1:device-a",
      _rev: "2-b",
      type: "device_authorization",
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "key",
      status: "approved",
      requestedAt: "2026-08-16T00:00:00.000Z",
      decidedAt: "2026-08-16T00:01:00.000Z",
      decidedByUserId: "user-1",
    };
    const { repository, db } = harness({ get: jest.fn().mockResolvedValue(doc) });

    const revoked = await repository.revoke("tenant-1", "device-a", "user-2");

    expect(revoked.status).toBe("revoked");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "revoked", decidedByUserId: "user-2" })
    );
  });

  it("lists every authorization for a tenant", async () => {
    const { repository, db } = harness({
      find: jest.fn().mockResolvedValue({
        docs: [
          {
            _id: "device-authorization:tenant-1:device-a",
            type: "device_authorization",
            tenantId: "tenant-1",
            deviceId: "device-a",
            devicePublicKey: "key",
            status: "approved",
            requestedAt: "2026-08-16T00:00:00.000Z",
            decidedAt: "2026-08-16T00:01:00.000Z",
            decidedByUserId: "user-1",
          },
        ],
      }),
    });

    const list = await repository.listByTenant("tenant-1");

    expect(db.find).toHaveBeenCalledWith({
      selector: { type: "device_authorization", tenantId: "tenant-1" },
      limit: 1000,
    });
    expect(list).toHaveLength(1);
  });
});
