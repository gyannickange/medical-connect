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

      const result = await repository.update("c1", "tenant-1", { status: "terminee", diagnosisPrincipal: { label: "RAS", certainty: "confirme" } } as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ number: "C-2026-0904", status: "terminee", diagnosisPrincipal: { label: "RAS", certainty: "confirme" } })
      );
      expect(result.status).toBe("terminee");
    });

    it("sets vitalsRecordedAt when vitals is included in the update payload", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        vitalsRecordedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const vitals = { bloodPressureSystolic: 128, bloodPressureDiastolic: 82, heartRate: 72, temperature: 36.8, oxygenSaturation: 98, respiratoryRate: 16, weightKg: 78, heightCm: 179, bmi: 24.3, capillaryGlycemia: null, painScoreEva: 3, isPregnant: false };
      const result = await repository.update("c1", "tenant-1", { vitals } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ vitals, vitalsRecordedAt: expect.any(String) }));
      expect(result.vitalsRecordedAt).toBeInstanceOf(Date);
    });

    it("sets medicalConsultationSavedAt when physicalExam or diagnosisPrincipal is included", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        medicalConsultationSavedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const diagnosisPrincipal = { label: "Hypertension artérielle", certainty: "confirme" as const };
      const result = await repository.update("c1", "tenant-1", { diagnosisPrincipal } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ diagnosisPrincipal, medicalConsultationSavedAt: expect.any(String) }));
      expect(result.medicalConsultationSavedAt).toBeInstanceOf(Date);
    });

    it("leaves vitalsRecordedAt and medicalConsultationSavedAt untouched when neither vitals, physicalExam, nor diagnosisPrincipal is in the payload", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        vitalsRecordedAt: "2026-08-27T10:25:00.000Z",
        medicalConsultationSavedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      await repository.update("c1", "tenant-1", { roomId: "Salle 3" } as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: null })
      );
    });

    it("sets carePlanSavedAt when carePlan is included in the update payload", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        carePlanSavedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const carePlan = { orientation: "retour_domicile" as const, medicalRecommendations: "Repos 48h", patientInstructions: "Consulter si fièvre" };
      const result = await repository.update("c1", "tenant-1", { carePlan } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ carePlan, carePlanSavedAt: expect.any(String) }));
      expect(result.carePlanSavedAt).toBeInstanceOf(Date);
    });

    it("sets closedAt on the first transition to terminee but not on a later one", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        closedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const first = await repository.update("c1", "tenant-1", { status: "terminee" } as any);
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "terminee", closedAt: expect.any(String) }));
      expect(first.closedAt).toBeInstanceOf(Date);

      const alreadyClosed = { ...existing, status: "terminee", closedAt: "2026-08-27T09:00:00.000Z" };
      db.get.mockResolvedValue(alreadyClosed);
      const second = await repository.update("c1", "tenant-1", { status: "terminee" } as any);
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ closedAt: "2026-08-27T09:00:00.000Z" }));
      expect(second.closedAt).toEqual(new Date("2026-08-27T09:00:00.000Z"));
    });

    it("stamps closedAt on an explicit closure request even when status was already terminee (legacy Marquer terminée data)", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "terminee",
        closedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const result = await repository.update("c1", "tenant-1", { status: "terminee" } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ closedAt: expect.any(String) }));
      expect(result.closedAt).toBeInstanceOf(Date);
    });

    it("does not stamp closedAt as a side effect of an unrelated update on an already-terminee consultation", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "terminee",
        closedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const carePlan = { orientation: "retour_domicile" as const, medicalRecommendations: "Repos", patientInstructions: "RAS" };
      const result = await repository.update("c1", "tenant-1", { carePlan } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ closedAt: null }));
      expect(result.closedAt).toBeNull();
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

    it("filters by patientId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, patientsRepoStub() as any);

      await repository.findByTenant("tenant-1", { patientId: "patient-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "consultation", tenantId: "tenant-1", patientId: "patient-1" }) })
      );
    });
  });
});
