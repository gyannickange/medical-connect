import { RoomsService } from "./rooms.service";

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    tenantId: "tenant-1",
    number: "101",
    type: "Cardiologie",
    floor: null,
    capacity: 2,
    equipment: [],
    notes: null,
    status: "disponible",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    roomId: "room-1",
    status: "en_cours",
    scheduledAt: new Date(),
    ...overrides,
  };
}

describe("RoomsService", () => {
  describe("findByTenant", () => {
    it("groups consultations by roomId and attaches computed status per room", async () => {
      const roomsRepository = { findByTenant: jest.fn().mockResolvedValue([room({ id: "room-1" }), room({ id: "room-2", status: "disponible" })]) };
      const occupied = consultation({ roomId: "room-1", status: "en_cours" });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([occupied]) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any);

      const result = await service.findByTenant("tenant-1");

      expect(consultationsRepository.findByTenant).toHaveBeenCalledWith("tenant-1", {});
      expect(result.find((r) => r.id === "room-1")?.effectiveStatus).toBe("occupee");
      expect(result.find((r) => r.id === "room-2")?.effectiveStatus).toBe("disponible");
    });
  });

  describe("findById", () => {
    it("scopes the consultations query to this room and includes recent history", async () => {
      const roomsRepository = { findById: jest.fn().mockResolvedValue(room()) };
      const terminee = consultation({ id: "c-old", status: "terminee", scheduledAt: new Date("2026-08-01") });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([terminee]) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any);

      const result = await service.findById("room-1", "tenant-1");

      expect(consultationsRepository.findByTenant).toHaveBeenCalledWith("tenant-1", { roomId: "room-1" });
      expect(result.recentHistory).toEqual([terminee]);
      expect(result.effectiveStatus).toBe("disponible");
    });
  });

  describe("create/update", () => {
    it("delegates to RoomsRepository", async () => {
      const roomsRepository = { create: jest.fn().mockResolvedValue(room()), update: jest.fn().mockResolvedValue(room()) };
      const service = new RoomsService(roomsRepository as any, { findByTenant: jest.fn() } as any);

      await service.create({ number: "101", type: "Cardiologie", capacity: 2, tenantId: "tenant-1" } as any);
      await service.update("room-1", "tenant-1", { status: "en_maintenance" });

      expect(roomsRepository.create).toHaveBeenCalledWith({ number: "101", type: "Cardiologie", capacity: 2, tenantId: "tenant-1" });
      expect(roomsRepository.update).toHaveBeenCalledWith("room-1", "tenant-1", { status: "en_maintenance" });
    });
  });
});
