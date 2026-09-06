import { NotFoundException } from "@nestjs/common";
import { RolesRepository } from "./roles.repository";

describe("RolesRepository", () => {
  describe("create", () => {
    it("creates a role document with isSystemRole defaulting to false", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new RolesRepository(couchDBService as any);

      const result = await repository.create({
        name: "Agent admission",
        permissions: { patients: { view: true } } as any,
        tenantId: "tenant-1",
      });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ type: "role", tenantId: "tenant-1", name: "Agent admission", isSystemRole: false })
      );
      expect(result.isSystemRole).toBe(false);
    });

    it("creates a system role when isSystemRole is passed explicitly", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new RolesRepository(couchDBService as any);

      const result = await repository.create({
        id: "admin",
        name: "Administrateur",
        permissions: {} as any,
        tenantId: "tenant-1",
        isSystemRole: true,
      });

      expect(result.isSystemRole).toBe(true);
      expect(result.id).toBe("admin");
    });
  });

  describe("update", () => {
    function existingRole(overrides: Record<string, unknown> = {}) {
      return {
        _id: "role:admin",
        _rev: "2-a",
        id: "admin",
        type: "role",
        name: "Administrateur",
        description: null,
        isSystemRole: true,
        permissions: { patients: { view: true } },
        tenantId: "tenant-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        ...overrides,
      };
    }

    it("patches the stored permissions", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingRole()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new RolesRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("admin", "tenant-1", { permissions: { patients: { view: false } } as any });

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ permissions: { patients: { view: false } } }));
      expect(result.permissions).toEqual({ patients: { view: false } });
    });

    it("throws NotFoundException when the role does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new RolesRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.update("missing", "tenant-1", { name: "x" })).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the role belongs to a different tenant", async () => {
      const db = { get: jest.fn().mockResolvedValue(existingRole({ tenantId: "tenant-2" })) };
      const repository = new RolesRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.update("admin", "tenant-1", { name: "x" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("queries roles by tenant sorted by name", async () => {
      const docs = [{ _id: "role:admin", type: "role", id: "admin", name: "Administrateur", tenantId: "tenant-1", isSystemRole: true, permissions: {}, description: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new RolesRepository(couchDBService as any);

      const result = await repository.findByTenant("tenant-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: { type: "role", tenantId: "tenant-1" }, sort: [{ name: "asc" }] })
      );
      expect(result[0].id).toBe("admin");
    });
  });

  describe("delete", () => {
    it("destroys the document by its current _rev", async () => {
      const doc = { _id: "role:custom-1", _rev: "3-b", id: "custom-1", type: "role", tenantId: "tenant-1", name: "Custom", isSystemRole: false, permissions: {}, description: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" };
      const db = { get: jest.fn().mockResolvedValue(doc), destroy: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new RolesRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await repository.delete("custom-1", "tenant-1");

      expect(db.destroy).toHaveBeenCalledWith("role:custom-1", "3-b");
    });
  });
});
