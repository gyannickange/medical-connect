import { NotFoundException } from "@nestjs/common";
import { ConsultationsRepository } from "./consultations.repository";

function patientsRepoStub(patient: any = { type: "patient", tenantId: "tenant-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(patient) };
}

describe("ConsultationsRepository", () => {
  describe("create", () => {
    it("validates the patient exists in the tenant, allocates a number, and creates the consultation", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const sequenceCounterService = { next: jest.fn().mockResolvedValue(904) };
      const patientsRepository = patientsRepoStub();
      const repository = new ConsultationsRepository(couchDBService as any, sequenceCounterService as any, patientsRepository as any);

      const result = await repository.create({
        id: "223e4567-e89b-42d3-a456-426614174000",
        patientId: "patient-1",
        scheduledAt: "2026-10-24T10:15:00.000Z",
        specialty: "Cardiologie",
        assignedDoctorId: "doctor-1",
        reason: "Suivi post-opératoire",
        tenantId: "tenant-1",
      } as any);

      expect(patientsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "patient-1");
      expect(sequenceCounterService.next).toHaveBeenCalledWith("tenant-1", expect.stringMatching(/^consultation:\d{4}$/));
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "consultation",
          status: "planifiee",
          priority: "normal",
          number: expect.stringMatching(/^C-\d{4}-0904$/),
        })
      );
      expect(result.status).toBe("planifiee");
    });

    it("throws NotFoundException when the patient does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const patientsRepository = patientsRepoStub(null);
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, patientsRepository as any);

      await expect(
        repository.create({ patientId: "missing", specialty: "Cardiologie", assignedDoctorId: "doctor-1", reason: "x", scheduledAt: "2026-10-24", tenantId: "tenant-1" } as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    it("patches status and clinical fields while preserving the number", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const result = await repository.update("c1", "tenant-1", { status: "terminee", diagnosis: "RAS" } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ number: "C-2026-0904", status: "terminee", diagnosis: "RAS" }));
      expect(result.status).toBe("terminee");
    });
  });

  describe("findByTenant", () => {
    it("filters by specialty, doctor, and date when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, patientsRepoStub() as any);

      await repository.findByTenant("tenant-1", { specialty: "Cardiologie", assignedDoctorId: "doctor-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({ type: "consultation", tenantId: "tenant-1", specialty: "Cardiologie", assignedDoctorId: "doctor-1" }),
        })
      );
    });
  });
});
