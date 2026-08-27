import { SequenceCounterService } from "./sequence-counter.service";

describe("SequenceCounterService", () => {
  it("starts a new counter at 1 when no counter document exists yet", async () => {
    const db = {
      get: jest.fn().mockRejectedValue({ statusCode: 404 }),
      insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }),
    };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new SequenceCounterService(couchDBService as any);

    const result = await service.next("tenant-1", "patient:2026");

    expect(result).toBe(1);
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "counter:patient:2026:tenant-1",
        type: "counter",
        tenantId: "tenant-1",
        value: 1,
      })
    );
  });

  it("increments an existing counter", async () => {
    const db = {
      get: jest.fn().mockResolvedValue({ _id: "counter:patient:2026:tenant-1", _rev: "3-x", type: "counter", tenantId: "tenant-1", value: 41 }),
      insert: jest.fn().mockResolvedValue({ ok: true, rev: "4-x" }),
    };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new SequenceCounterService(couchDBService as any);

    const result = await service.next("tenant-1", "patient:2026");

    expect(result).toBe(42);
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ _rev: "3-x", value: 42 }));
  });

  it("retries on a 409 conflict from a concurrent increment", async () => {
    const db = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ _id: "counter:patient:2026:tenant-1", _rev: "3-x", type: "counter", tenantId: "tenant-1", value: 41 })
        .mockResolvedValueOnce({ _id: "counter:patient:2026:tenant-1", _rev: "4-y", type: "counter", tenantId: "tenant-1", value: 42 }),
      insert: jest
        .fn()
        .mockRejectedValueOnce({ statusCode: 409 })
        .mockResolvedValueOnce({ ok: true, rev: "5-y" }),
    };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new SequenceCounterService(couchDBService as any);

    const result = await service.next("tenant-1", "patient:2026");

    expect(result).toBe(43);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });
});
