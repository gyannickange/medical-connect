import { SyncRepository } from "./sync.repository";

describe("SyncRepository", () => {
  it("upserts one status document per tenant and device in the unified tenant db", async () => {
    const db = {
      get: jest.fn().mockRejectedValue({ statusCode: 404 }),
      insert: jest.fn().mockResolvedValue({ ok: true }),
    };
    const couch = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new SyncRepository(couch as any);

    const result = await repository.upsert({
      tenantId: "tenant-1",
      deviceId: "device-1",
      status: "online",
      pendingChanges: 0,
      lastSync: new Date("2026-08-13T00:00:00Z"),
    } as any);

    expect(couch.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "sync_status:device-1",
        type: "sync_status",
        tenantId: "tenant-1",
      })
    );
    expect(result.lastSync).toBeInstanceOf(Date);
  });
});
