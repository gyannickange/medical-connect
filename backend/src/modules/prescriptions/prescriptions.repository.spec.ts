import { NotFoundException } from "@nestjs/common";
import { PrescriptionsRepository } from "./prescriptions.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1", patientId: "patient-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

describe("PrescriptionsRepository", () => {
  describe("create", () => {
    it("validates the consultation exists in the tenant and creates the prescription", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepository as any);

      const result = await repository.create({
        tenantId: "tenant-1",
        consultationId: "c1",
        lines: [{ drugName: "Kardegic", dosage: "75 mg", frequency: "1 sachet par jour (midi)", durationDays: 30, quantity: "1 boîte" }],
        prescribedByUserId: "doctor-1",
      });

      expect(consultationsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "c1");
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "prescription",
          status: "en_attente",
          patientId: "patient-1",
          lines: [{ drugName: "Kardegic", dosage: "75 mg", frequency: "1 sachet par jour (midi)", durationDays: 30, quantity: "1 boîte", dispenseStatus: "en_attente" }],
        })
      );
      expect(result.status).toBe("en_attente");
    });

    it("throws NotFoundException when the consultation does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const consultationsRepository = consultationsRepoStub(null);
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepository as any);

      await expect(
        repository.create({ tenantId: "tenant-1", consultationId: "missing", lines: [{ drugName: "x", dosage: "x", frequency: "x" }], prescribedByUserId: "doctor-1" })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    function existingPrescription(overrides: Record<string, unknown> = {}) {
      return {
        _id: "prescription:p1",
        _rev: "2-a",
        id: "p1",
        type: "prescription",
        tenantId: "tenant-1",
        consultationId: "c1",
        patientId: "patient-1",
        lines: [
          { drugName: "Kardegic", dosage: "75 mg", frequency: "1/j", durationDays: 30, quantity: "1 boîte", dispenseStatus: "en_attente" },
          { drugName: "Tahor", dosage: "10 mg", frequency: "1/soir", durationDays: 30, quantity: "1 boîte", dispenseStatus: "en_attente" },
        ],
        prescribedByUserId: "doctor-1",
        prescribedAt: "2026-08-27T09:00:00.000Z",
        status: "en_attente",
        dispensedByUserId: null,
        dispensedAt: null,
        createdAt: "2026-08-27T09:00:00.000Z",
        ...overrides,
      };
    }

    it("sets status to delivre and stamps dispensedAt when every line is delivered", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const lines = existing.lines.map((line: any) => ({ ...line, dispenseStatus: "delivre" }));
      const result = await repository.update("p1", "tenant-1", { lines }, "pharmacist-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "delivre", dispensedByUserId: "pharmacist-1", dispensedAt: expect.any(String) })
      );
      expect(result.status).toBe("delivre");
    });

    it("sets status to delivre_partiel when only some lines are delivered", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const lines = [
        { ...existing.lines[0], dispenseStatus: "delivre" },
        { ...existing.lines[1], dispenseStatus: "indisponible" },
      ];
      const result = await repository.update("p1", "tenant-1", { lines } as any, "pharmacist-1");

      expect(result.status).toBe("delivre_partiel");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "delivre_partiel", dispensedByUserId: "pharmacist-1" }));
    });

    it("leaves status untouched and dispensedAt null when no line is delivered yet", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const lines = [
        { ...existing.lines[0], dispenseStatus: "indisponible" },
        { ...existing.lines[1] },
      ];
      const result = await repository.update("p1", "tenant-1", { lines } as any, "pharmacist-1");

      expect(result.status).toBe("en_attente");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ dispensedByUserId: null, dispensedAt: null }));
    });

    it("respects an explicit status override regardless of line state", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const result = await repository.update("p1", "tenant-1", { status: "annule" }, "pharmacist-1");

      expect(result.status).toBe("annule");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "annule", dispensedByUserId: null }));
    });

    it("throws NotFoundException when the prescription does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await expect(repository.update("missing", "tenant-1", { status: "delivre" }, "pharmacist-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("filters by consultationId and status when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { consultationId: "c1", status: "en_attente" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "prescription", tenantId: "tenant-1", consultationId: "c1", status: "en_attente" }) })
      );
    });

    it("filters by patientId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { patientId: "patient-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "prescription", tenantId: "tenant-1", patientId: "patient-1" }) })
      );
    });
  });
});
