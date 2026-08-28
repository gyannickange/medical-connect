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

  describe("resolvePatientName", () => {
    it("resolves via entityId for a consultations UPDATE", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ patientId: "patient-1", firstName: "Aissatou", lastName: "Diallo" }),
      };
      const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const name = await repository.resolvePatientName("tenant-1", "consultations", "c-1", null);

      expect(db.get).toHaveBeenNthCalledWith(1, "consultation:c-1");
      expect(name).toBe("Aissatou Diallo");
    });

    it("falls back to changes.patientId for a consultations CREATE (no entityId yet)", async () => {
      const db = { get: jest.fn().mockResolvedValue({ firstName: "Aissatou", lastName: "Diallo" }) };
      const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const name = await repository.resolvePatientName("tenant-1", "consultations", null, { patientId: "patient-1" });

      expect(db.get).toHaveBeenCalledWith("patient:patient-1");
      expect(name).toBe("Aissatou Diallo");
    });

    it("resolves a lab-orders UPDATE directly from the lab_order document", async () => {
      const db = {
        get: jest.fn((id: string) => {
          if (id === "lab_order:lo-1") return Promise.resolve({ patientId: "patient-1" });
          if (id === "patient:patient-1") return Promise.resolve({ firstName: "Marc", lastName: "Etoa" });
          return Promise.reject({ statusCode: 404 });
        }),
      };
      const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const name = await repository.resolvePatientName("tenant-1", "lab-orders", "lo-1", null);

      expect(name).toBe("Marc Etoa");
    });

    it("resolves a prescriptions CREATE via changes.consultationId (no direct patientId in the body)", async () => {
      const db = {
        get: jest.fn((id: string) => {
          if (id === "consultation:c-1") return Promise.resolve({ patientId: "patient-1" });
          if (id === "patient:patient-1") return Promise.resolve({ firstName: "Marc", lastName: "Etoa" });
          return Promise.reject({ statusCode: 404 });
        }),
      };
      const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const name = await repository.resolvePatientName("tenant-1", "prescriptions", null, { consultationId: "c-1" });

      expect(name).toBe("Marc Etoa");
    });

    it("returns null for an unrelated entityType without erroring", async () => {
      const repository = new AuditRepository({ getDatabase: jest.fn() } as any);

      const name = await repository.resolvePatientName("tenant-1", "staff", "user-1", null);

      expect(name).toBeNull();
    });

    it("returns null when nothing resolves", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const name = await repository.resolvePatientName("tenant-1", "consultations", null, {});

      expect(name).toBeNull();
    });
  });
});
