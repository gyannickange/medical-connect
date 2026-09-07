import { BadRequestException, ConflictException } from "@nestjs/common";
import { RoomsService } from "./rooms.service";

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    tenantId: "tenant-1",
    number: "101",
    roomType: "Cardiologie",
    floor: null,
    capacity: 2,
    equipment: [],
    notes: null,
    status: "disponible",
    assignments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    roomId: "room-1",
    patientId: "patient-1",
    assignedDoctorId: "doctor-1",
    status: "en_cours",
    scheduledAt: new Date(),
    closedAt: null,
    carePlan: null,
    ...overrides,
  };
}

function patient(overrides: Record<string, unknown> = {}) {
  return { id: "patient-1", firstName: "Jean", lastName: "Dupont", ...overrides };
}

function doctor(overrides: Record<string, unknown> = {}) {
  return { id: "doctor-1", firstName: "Aline", lastName: "Mbarga", ...overrides };
}

describe("RoomsService", () => {
  describe("findByTenant", () => {
    it("groups consultations by roomId and attaches computed status per room", async () => {
      const roomsRepository = { findByTenant: jest.fn().mockResolvedValue([room({ id: "room-1", capacity: 1 }), room({ id: "room-2" })]) };
      const occupied = consultation({ roomId: "room-1", status: "en_cours" });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([occupied]) };
      const patientsRepository = { findById: jest.fn().mockResolvedValue(patient()) };
      const usersRepository = { findById: jest.fn().mockResolvedValue(doctor()) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      const result = await service.findByTenant("tenant-1");

      expect(consultationsRepository.findByTenant).toHaveBeenCalledWith("tenant-1", {});
      expect(result.find((r) => r.id === "room-1")?.effectiveStatus).toBe("occupee");
      expect(result.find((r) => r.id === "room-2")?.effectiveStatus).toBe("disponible");
    });

    it("resolves assignedPatientNames for each assignment, and stays disponible with a free bed remaining", async () => {
      const roomsRepository = {
        findByTenant: jest.fn().mockResolvedValue([
          room({ id: "room-1", capacity: 2, assignments: [{ patientId: "patient-1", consultationId: "c-old" }] }),
        ]),
      };
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([]) };
      const patientsRepository = { findById: jest.fn().mockResolvedValue(patient()) };
      const usersRepository = { findById: jest.fn() };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      const result = await service.findByTenant("tenant-1");

      expect(patientsRepository.findById).toHaveBeenCalledWith("patient-1", "tenant-1");
      expect(result[0].assignedPatientNames).toEqual(["Jean Dupont"]);
      expect(result[0].effectiveStatus).toBe("disponible");
    });

    it("resolves the patient and doctor name for a room occupied by an active exam", async () => {
      const roomsRepository = { findByTenant: jest.fn().mockResolvedValue([room({ id: "room-1" })]) };
      const occupied = consultation({ roomId: "room-1", status: "en_cours", patientId: "patient-1", assignedDoctorId: "doctor-1" });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([occupied]) };
      const patientsRepository = { findById: jest.fn().mockResolvedValue(patient()) };
      const usersRepository = { findById: jest.fn().mockResolvedValue(doctor()) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      const result = await service.findByTenant("tenant-1");

      expect(patientsRepository.findById).toHaveBeenCalledWith("patient-1", "tenant-1");
      expect(usersRepository.findById).toHaveBeenCalledWith("doctor-1");
      expect(result[0].currentConsultationPatientName).toBe("Jean Dupont");
      expect(result[0].currentConsultationDoctorName).toBe("Aline Mbarga");
    });

    it("resolves the patient name for the nearest upcoming reservation", async () => {
      const roomsRepository = { findByTenant: jest.fn().mockResolvedValue([room({ id: "room-1" })]) };
      const upcoming = consultation({ roomId: "room-1", status: "planifiee", patientId: "patient-2", scheduledAt: new Date(Date.now() + 3600_000) });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([upcoming]) };
      const patientsRepository = { findById: jest.fn().mockResolvedValue(patient({ id: "patient-2", firstName: "Marc", lastName: "Dubois" })) };
      const usersRepository = { findById: jest.fn() };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      const result = await service.findByTenant("tenant-1");

      expect(result[0].effectiveStatus).toBe("reservee");
      expect(patientsRepository.findById).toHaveBeenCalledWith("patient-2", "tenant-1");
      expect(result[0].nextReservationPatientName).toBe("Marc Dubois");
    });

    it("leaves the resolved names empty/null when the room is simply disponible", async () => {
      const roomsRepository = { findByTenant: jest.fn().mockResolvedValue([room({ id: "room-1" })]) };
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([]) };
      const patientsRepository = { findById: jest.fn() };
      const usersRepository = { findById: jest.fn() };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      const result = await service.findByTenant("tenant-1");

      expect(result[0].assignedPatientNames).toEqual([]);
      expect(result[0].currentConsultationPatientName).toBeNull();
      expect(result[0].currentConsultationDoctorName).toBeNull();
      expect(result[0].nextReservationPatientName).toBeNull();
      expect(patientsRepository.findById).not.toHaveBeenCalled();
      expect(usersRepository.findById).not.toHaveBeenCalled();
    });
  });

  describe("findById", () => {
    it("scopes the consultations query to this room and includes recent history with patient names", async () => {
      const roomsRepository = { findById: jest.fn().mockResolvedValue(room()) };
      const terminee = consultation({ id: "c-old", status: "terminee", patientId: "patient-1", scheduledAt: new Date("2026-08-01") });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([terminee]) };
      const patientsRepository = { findById: jest.fn().mockResolvedValue(patient()) };
      const usersRepository = { findById: jest.fn() };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      const result = await service.findById("room-1", "tenant-1");

      expect(consultationsRepository.findByTenant).toHaveBeenCalledWith("tenant-1", { roomId: "room-1" });
      expect(result.recentHistory).toEqual([{ ...terminee, patientName: "Jean Dupont" }]);
      expect(result.effectiveStatus).toBe("disponible");
      expect(result.assignedPatientNames).toEqual([]);
    });
  });

  describe("create/update", () => {
    it("delegates create to RoomsRepository", async () => {
      const roomsRepository = { create: jest.fn().mockResolvedValue(room()) };
      const service = new RoomsService(roomsRepository as any, { findByTenant: jest.fn() } as any, {} as any, {} as any);

      await service.create({ number: "101", roomType: "Cardiologie", capacity: 2, tenantId: "tenant-1" } as any);

      expect(roomsRepository.create).toHaveBeenCalledWith({ number: "101", roomType: "Cardiologie", capacity: 2, tenantId: "tenant-1" });
    });

    it("delegates a non-maintenance update to RoomsRepository", async () => {
      const roomsRepository = { update: jest.fn().mockResolvedValue(room()) };
      const service = new RoomsService(roomsRepository as any, {} as any, {} as any, {} as any);

      await service.update("room-1", "tenant-1", { number: "102" });

      expect(roomsRepository.update).toHaveBeenCalledWith("room-1", "tenant-1", { number: "102" });
    });

    it("allows marking en_maintenance when no patient is assigned", async () => {
      const roomsRepository = { findById: jest.fn().mockResolvedValue(room({ assignments: [] })), update: jest.fn().mockResolvedValue(room({ status: "en_maintenance" })) };
      const service = new RoomsService(roomsRepository as any, {} as any, {} as any, {} as any);

      await service.update("room-1", "tenant-1", { status: "en_maintenance" });

      expect(roomsRepository.update).toHaveBeenCalledWith("room-1", "tenant-1", { status: "en_maintenance" });
    });

    it("rejects marking en_maintenance when at least one patient is currently assigned", async () => {
      const roomsRepository = { findById: jest.fn().mockResolvedValue(room({ assignments: [{ patientId: "patient-1", consultationId: "c-1" }] })), update: jest.fn() };
      const service = new RoomsService(roomsRepository as any, {} as any, {} as any, {} as any);

      await expect(service.update("room-1", "tenant-1", { status: "en_maintenance" })).rejects.toThrow(BadRequestException);
      expect(roomsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe("assign", () => {
    it("appends the assignment when the room has a free bed", async () => {
      const roomsRepository = {
        findById: jest.fn().mockResolvedValue(room({ capacity: 2, assignments: [{ patientId: "patient-existing", consultationId: "c-existing" }] })),
        update: jest.fn().mockResolvedValue(room()),
      };
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([]) };
      const patientsRepository = { findById: jest.fn().mockResolvedValue(patient()) };
      const usersRepository = { findById: jest.fn() };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      await service.assign("room-1", "tenant-1", { patientId: "patient-1", consultationId: "c-1" });

      expect(roomsRepository.update).toHaveBeenCalledWith("room-1", "tenant-1", {
        assignments: [
          { patientId: "patient-existing", consultationId: "c-existing" },
          { patientId: "patient-1", consultationId: "c-1" },
        ],
      });
    });

    it("assigns the sole patient when the room starts empty", async () => {
      const roomsRepository = {
        findById: jest.fn().mockResolvedValue(room({ capacity: 1, assignments: [] })),
        update: jest.fn().mockResolvedValue(room()),
      };
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([]) };
      const patientsRepository = { findById: jest.fn() };
      const usersRepository = { findById: jest.fn() };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, usersRepository as any);

      await service.assign("room-1", "tenant-1", { patientId: "patient-1", consultationId: "c-1" });

      expect(roomsRepository.update).toHaveBeenCalledWith("room-1", "tenant-1", {
        assignments: [{ patientId: "patient-1", consultationId: "c-1" }],
      });
    });

    it("rejects assigning a room whose beds are all taken", async () => {
      const roomsRepository = {
        findById: jest.fn().mockResolvedValue(room({ capacity: 1, assignments: [{ patientId: "patient-existing", consultationId: "c-existing" }] })),
        update: jest.fn(),
      };
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([]) };
      const patientsRepository = { findById: jest.fn().mockResolvedValue(patient()) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, {} as any);

      await expect(service.assign("room-1", "tenant-1", { patientId: "patient-1", consultationId: "c-1" })).rejects.toThrow(ConflictException);
      expect(roomsRepository.update).not.toHaveBeenCalled();
    });

    it("rejects assigning a room under maintenance", async () => {
      const roomsRepository = { findById: jest.fn().mockResolvedValue(room({ status: "en_maintenance", assignments: [] })), update: jest.fn() };
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([]) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, {} as any, {} as any);

      await expect(service.assign("room-1", "tenant-1", { patientId: "patient-1", consultationId: "c-1" })).rejects.toThrow(ConflictException);
      expect(roomsRepository.update).not.toHaveBeenCalled();
    });
  });

  describe("release", () => {
    it("removes only the matching assignment, keeping the rest", async () => {
      const roomsRepository = {
        findById: jest.fn().mockResolvedValue(
          room({
            assignments: [
              { patientId: "patient-1", consultationId: "c-1" },
              { patientId: "patient-2", consultationId: "c-2" },
            ],
          })
        ),
        update: jest.fn().mockResolvedValue(room()),
      };
      const service = new RoomsService(roomsRepository as any, {} as any, {} as any, {} as any);

      await service.release("room-1", "tenant-1", "c-1");

      expect(roomsRepository.update).toHaveBeenCalledWith("room-1", "tenant-1", {
        assignments: [{ patientId: "patient-2", consultationId: "c-2" }],
      });
    });
  });

  describe("findPendingHospitalisations", () => {
    it("lists closed hospitalisation consultations not yet assigned to a room, newest first", async () => {
      const older = consultation({
        id: "c-old", patientId: "patient-1", status: "terminee", closedAt: new Date("2026-09-01T10:00:00.000Z"),
        carePlan: { orientation: "hospitalisation", targetService: "Cardiologie", bedUrgentlyRequired: false },
      });
      const newer = consultation({
        id: "c-new", patientId: "patient-2", status: "terminee", closedAt: new Date("2026-09-05T10:00:00.000Z"),
        carePlan: { orientation: "hospitalisation", targetService: "Urgences", bedUrgentlyRequired: true },
      });
      const notHospitalisation = consultation({ id: "c-other", status: "terminee", carePlan: { orientation: "retour_domicile" } });
      const stillOpen = consultation({ id: "c-open", status: "en_cours", carePlan: { orientation: "hospitalisation", targetService: "X", bedUrgentlyRequired: false } });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([older, newer, notHospitalisation, stillOpen]) };
      const roomsRepository = { findByTenant: jest.fn().mockResolvedValue([room({ assignments: [] })]) };
      const patientsRepository = { findById: jest.fn().mockImplementation((id: string) => Promise.resolve(patient({ id, firstName: id, lastName: "X" }))) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, patientsRepository as any, {} as any);

      const result = await service.findPendingHospitalisations("tenant-1");

      expect(result.map((r) => r.consultationId)).toEqual(["c-new", "c-old"]);
      expect(result[0]).toEqual({
        consultationId: "c-new", patientId: "patient-2", patientName: "patient-2 X",
        targetService: "Urgences", bedUrgentlyRequired: true, closedAt: newer.closedAt,
      });
    });

    it("excludes a consultation already assigned to a room, even alongside another assignment in the same room", async () => {
      const alreadyAssigned = consultation({
        id: "c-assigned", status: "terminee", closedAt: new Date(),
        carePlan: { orientation: "hospitalisation", targetService: "Cardiologie", bedUrgentlyRequired: false },
      });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([alreadyAssigned]) };
      const roomsRepository = {
        findByTenant: jest.fn().mockResolvedValue([
          room({
            assignments: [
              { patientId: "patient-other", consultationId: "c-other" },
              { patientId: "patient-1", consultationId: "c-assigned" },
            ],
          }),
        ]),
      };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any, { findById: jest.fn() } as any, {} as any);

      const result = await service.findPendingHospitalisations("tenant-1");

      expect(result).toEqual([]);
    });
  });
});
