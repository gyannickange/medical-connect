import { ConflictException, NotFoundException } from "@nestjs/common";
import { RayonsRepository } from "./rayons.repository";

describe("RayonsRepository", () => {
  describe("create", () => {
    it("reserves the trimmed rayon name, then creates and returns the rayon", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-res" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new RayonsRepository(couchDBService as any);

      const result = await repository.create({
        id: "123e4567-e89b-42d3-a456-426614174000",
        name: "  Boissons  ",
        tenantId: "tenant-1",
      } as any);

      expect(db.insert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: "rayon_name_reservation",
          tenantId: "tenant-1",
          name: "Boissons",
          rayonId: "123e4567-e89b-42d3-a456-426614174000",
        })
      );
      expect(db.insert).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          _id: "rayon:123e4567-e89b-42d3-a456-426614174000",
          id: "123e4567-e89b-42d3-a456-426614174000",
          type: "rayon",
          name: "Boissons",
          tenantId: "tenant-1",
        })
      );
      expect(result.name).toBe("Boissons");
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("rejects creation with a ConflictException when the name is already reserved", async () => {
      const db = { insert: jest.fn().mockRejectedValue({ statusCode: 409 }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new RayonsRepository(couchDBService as any);

      await expect(
        repository.create({ name: "Boissons", tenantId: "tenant-1" } as any)
      ).rejects.toThrow(ConflictException);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("rolls back the name reservation when the rayon document insert fails", async () => {
      const db = {
        insert: jest
          .fn()
          .mockResolvedValueOnce({ ok: true, rev: "1-res" })
          .mockRejectedValueOnce(new Error("CouchDB unreachable")),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new RayonsRepository(couchDBService as any);

      await expect(
        repository.create({ name: "Boissons", tenantId: "tenant-1" } as any)
      ).rejects.toThrow("CouchDB is unavailable");

      expect(db.destroy).toHaveBeenCalledWith(expect.any(String), "1-res");
    });
  });

  describe("update", () => {
    function existingRayon(overrides: Record<string, unknown> = {}) {
      return {
        _id: "rayon:rayon-1",
        _rev: "2-a",
        id: "rayon-1",
        type: "rayon",
        name: "Boissons",
        description: null,
        tenantId: "tenant-1",
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        ...overrides,
      };
    }

    it("patches description without touching the name reservation", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingRayon()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new RayonsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      const result = await repository.update("rayon-1", "tenant-1", {
        description: "Sodas et jus",
      });

      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ _rev: "2-a", description: "Sodas et jus" })
      );
      expect(result.description).toBe("Sodas et jus");
    });

    it("reserves the new name and releases the old one when renaming to a different name", async () => {
      const db = {
        get: jest
          .fn()
          .mockResolvedValueOnce(existingRayon())
          .mockResolvedValueOnce({ _id: "old-reservation", _rev: "1-old", rayonId: "rayon-1" }),
        insert: jest
          .fn()
          .mockResolvedValueOnce({ ok: true, rev: "1-new" })
          .mockResolvedValueOnce({ ok: true }),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new RayonsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      const result = await repository.update("rayon-1", "tenant-1", {
        name: "Épicerie",
      });

      expect(db.insert).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          type: "rayon_name_reservation",
          name: "Épicerie",
          rayonId: "rayon-1",
        })
      );
      expect(db.destroy).toHaveBeenCalledWith("old-reservation", "1-old");
      expect(result.name).toBe("Épicerie");
    });

    it("does not attempt a new reservation for a case-only rename of the same rayon", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingRayon()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
        destroy: jest.fn(),
      };
      const repository = new RayonsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      const result = await repository.update("rayon-1", "tenant-1", {
        name: "BOISSONS",
      });

      // Only the main document insert happens - no reservation insert/swap.
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ name: "BOISSONS" }));
      expect(db.destroy).not.toHaveBeenCalled();
      expect(result.name).toBe("BOISSONS");
    });

    it("throws ConflictException when renaming to a name already used by another rayon", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingRayon()),
        insert: jest.fn().mockRejectedValue({ statusCode: 409 }),
      };
      const repository = new RayonsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.update("rayon-1", "tenant-1", { name: "Épicerie" })
      ).rejects.toThrow(ConflictException);
    });

    it("throws NotFoundException when the rayon does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new RayonsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.update("missing", "tenant-1", { name: "X" })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("queries rayons for the tenant sorted by name, mapping _id onto id", async () => {
      const docs = [{ _id: "rayon-1", type: "rayon", name: "Boissons" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const repository = new RayonsRepository(couchDBService as any);

      const result = await repository.findByTenant("tenant-1");

      expect(couchDBService.ensureIndex).toHaveBeenCalledWith(
        "medicalconnect_tenant-1",
        "rayons_by_tenant_name",
        ["tenantId", "type", "name"]
      );
      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "rayon", tenantId: "tenant-1" },
        sort: [{ name: "asc" }],
        limit: 100,
        skip: 0,
      });
      expect(result).toEqual([
        { _id: "rayon-1", type: "rayon", name: "Boissons", id: "rayon-1" },
      ]);
    });

    it("computes skip from page * limit when offset is not provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const repository = new RayonsRepository(couchDBService as any);

      await repository.findByTenant("tenant-1", { limit: 20, page: 2 });

      expect(db.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, skip: 40 }));
    });
  });
});
