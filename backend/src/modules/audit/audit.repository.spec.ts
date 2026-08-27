import { AuditRepository } from "./audit.repository";

describe("AuditRepository", () => {
  it("sorts by creation date in CouchDB before applying pagination", async () => {
    const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
    const couch = {
      getDatabase: jest.fn().mockResolvedValue(db),
      ensureIndex: jest.fn().mockResolvedValue(undefined),
    };
    const repository = new AuditRepository(couch as any);

    await repository.find("tenant-1", { limit: 10 });

    expect(db.find).toHaveBeenCalledWith({
      selector: { type: "audit_log", tenantId: "tenant-1" },
      sort: [{ createdAt: "desc" }],
      limit: 10,
      skip: 0,
    });
  });

  it("writes immutable audit documents to the tenant database", async () => {
    const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
    const couch = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new AuditRepository(couch as any);

    const result = await repository.create({
      id: "audit-1",
      tenantId: "tenant-1",
      userId: "user-1",
      action: "CREATE",
      entityType: "settings",
      metadata: {},
      status: "SUCCESS",
    } as any);

    expect(couch.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "audit_log:audit-1", type: "audit_log" })
    );
    expect(result.createdAt).toBeInstanceOf(Date);
  });
});
