import { NotFoundException } from "@nestjs/common";
import { RoomsRepository } from "./rooms.repository";

describe("RoomsRepository", () => {
  describe("create", () => {
    it("creates a room document with default status disponible", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new RoomsRepository(couchDBService as any);

      const result = await repository.create({
        number: "101",
        type: "Cardiologie",
        capacity: 2,
        tenantId: "tenant-1",
      } as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "room",
          tenantId: "tenant-1",
          number: "101",
        })
      );
      expect(result.status).toBe("disponible");
      expect(result.equipment).toEqual([]);
    });
  });

  describe("update", () => {
    function existingRoom(overrides: Record<string, unknown> = {}) {
      return {
        _id: "room:room-1",
        _rev: "2-a",
        id: "room-1",
        type: "room",
        number: "101",
        roomType: "Cardiologie",
        floor: null,
        capacity: 2,
        equipment: [],
        notes: null,
        status: "disponible",
        tenantId: "tenant-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        ...overrides,
      };
    }

    it("patches the stored status", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingRoom()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new RoomsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("room-1", "tenant-1", { status: "en_maintenance" });

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "en_maintenance" }));
      expect(result.status).toBe("en_maintenance");
    });

    it("throws NotFoundException when the room does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new RoomsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.update("missing", "tenant-1", { status: "disponible" })).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the room belongs to a different tenant", async () => {
      const db = { get: jest.fn().mockResolvedValue(existingRoom({ tenantId: "tenant-2" })) };
      const repository = new RoomsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.update("room-1", "tenant-1", { status: "disponible" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("queries rooms by tenant sorted by number", async () => {
      const docs = [{ _id: "room:room-1", type: "room", number: "101", tenantId: "tenant-1", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new RoomsRepository(couchDBService as any);

      const result = await repository.findByTenant("tenant-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: { type: "room", tenantId: "tenant-1" }, sort: [{ number: "asc" }] })
      );
      expect(result[0].id).toBe("room-1");
    });
  });
});
