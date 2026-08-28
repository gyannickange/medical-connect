import { NotFoundException } from "@nestjs/common";
import { LabOrdersRepository } from "./lab-orders.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1", patientId: "patient-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

describe("LabOrdersRepository", () => {
  describe("create", () => {
    it("validates the consultation exists in the tenant and creates the lab order", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepository as any);

      const result = await repository.create({
        tenantId: "tenant-1",
        consultationId: "c1",
        examLines: [{ examName: "NFS" }, { examName: "Créatinine" }],
        priority: "urgent",
        clinicalContext: "Suspicion d'anémie",
        requestedByUserId: "doctor-1",
      });

      expect(consultationsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "c1");
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lab_order",
          status: "demande",
          patientId: "patient-1",
          priority: "urgent",
          examLines: [{ examName: "NFS", resultText: null }, { examName: "Créatinine", resultText: null }],
        })
      );
      expect(result.status).toBe("demande");
      expect(result.patientId).toBe("patient-1");
    });

    it("throws NotFoundException when the consultation does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const consultationsRepository = consultationsRepoStub(null);
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepository as any);

      await expect(
        repository.create({ tenantId: "tenant-1", consultationId: "missing", examLines: [{ examName: "NFS" }], requestedByUserId: "doctor-1" })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    function existingLabOrder(overrides: Record<string, unknown> = {}) {
      return {
        _id: "lab_order:lo1",
        _rev: "2-a",
        id: "lo1",
        type: "lab_order",
        tenantId: "tenant-1",
        consultationId: "c1",
        patientId: "patient-1",
        examLines: [{ examName: "NFS", resultText: null }],
        requestedByUserId: "doctor-1",
        requestedAt: "2026-08-27T09:00:00.000Z",
        priority: "normal",
        status: "demande",
        takenInChargeByUserId: null,
        takenInChargeAt: null,
        validatedByUserId: null,
        validatedAt: null,
        problemReport: null,
        createdAt: "2026-08-27T09:00:00.000Z",
        ...overrides,
      };
    }

    it("sets takenInChargeByUserId/At when status transitions to en_cours", async () => {
      const existing = existingLabOrder();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const result = await repository.update("lo1", "tenant-1", { status: "en_cours" }, "labtech-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: expect.any(String) })
      );
      expect(result.takenInChargeAt).toBeInstanceOf(Date);
    });

    it("sets validatedByUserId/At and stores results when status transitions to termine", async () => {
      const existing = existingLabOrder({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" });
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const examLines = [{ examName: "NFS", resultText: "Hémoglobine 13.2 g/dL, normale" }];
      const result = await repository.update("lo1", "tenant-1", { status: "termine", examLines }, "labtech-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "termine", examLines, validatedByUserId: "labtech-1", validatedAt: expect.any(String) })
      );
      expect(result.validatedAt).toBeInstanceOf(Date);
    });

    it("does not re-stamp takenInChargeAt when already en_cours", async () => {
      const existing = existingLabOrder({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" });
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await repository.update("lo1", "tenant-1", { status: "en_cours" }, "labtech-2");

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" }));
    });

    it("throws NotFoundException when the lab order does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await expect(repository.update("missing", "tenant-1", { status: "en_cours" }, "labtech-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("recordFollowUp", () => {
    it("sets followUpAction/Note/RecordedAt on the existing lab order", async () => {
      const existing = {
        _id: "lab_order:lo1",
        _rev: "2-a",
        id: "lo1",
        type: "lab_order",
        tenantId: "tenant-1",
        consultationId: "c1",
        patientId: "patient-1",
        examLines: [{ examName: "Ionogramme", resultText: "Na+ 139 mmol/L" }],
        status: "termine",
        followUpAction: null,
        followUpNote: null,
        followUpRecordedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const result = await repository.recordFollowUp("lo1", "tenant-1", { followUpAction: "contacter_patient", followUpNote: "Rappeler demain" });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ followUpAction: "contacter_patient", followUpNote: "Rappeler demain", followUpRecordedAt: expect.any(String) })
      );
      expect(result.followUpRecordedAt).toBeInstanceOf(Date);
    });

    it("throws NotFoundException when the lab order does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await expect(repository.recordFollowUp("missing", "tenant-1", { followUpAction: "aucune_action" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("filters by consultationId, status, and priority when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { consultationId: "c1", status: "demande", priority: "urgent" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({ type: "lab_order", tenantId: "tenant-1", consultationId: "c1", status: "demande", priority: "urgent" }),
        })
      );
    });

    it("filters by patientId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { patientId: "patient-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "lab_order", tenantId: "tenant-1", patientId: "patient-1" }) })
      );
    });
  });
});
