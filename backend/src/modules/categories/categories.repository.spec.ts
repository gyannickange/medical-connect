import { NotFoundException } from "@nestjs/common";
import { CategoriesRepository } from "./categories.repository";
import type { Category } from "@shared/schema";

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: "category-1",
    name: "Electronics",
    description: "Electronic devices",
    tenantId: "tenant-1",
    parentCategoryId: null,
    taxRate: "10.00",
    isDefault: false,
    createdAt: new Date("2026-08-12T10:00:00.000Z"),
    ...overrides,
  } as Category;
}

describe("CategoriesRepository", () => {
  describe("authoritative CRUD", () => {
    it("creates and returns a category without swallowing the CouchDB write", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new CategoriesRepository(couchDBService as any);

      const result = await repository.create({
        id: "123e4567-e89b-42d3-a456-426614174000",
        name: "Beverages",
        tenantId: "tenant-1",
      } as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "category:123e4567-e89b-42d3-a456-426614174000",
          id: "123e4567-e89b-42d3-a456-426614174000",
          type: "category",
          tenantId: "tenant-1",
          createdAt: expect.any(String),
        })
      );
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("patches an existing category using its current revision", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "category-1",
          _rev: "2-a",
          type: "category",
          tenantId: "tenant-1",
          name: "Old",
          description: null,
          parentCategoryId: null,
          taxRate: null,
          isDefault: false,
          createdAt: "2026-08-13T00:00:00.000Z",
        }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new CategoriesRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("category-1", "tenant-1", { name: "New" });

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ _rev: "2-a", name: "New" }));
      expect(result.name).toBe("New");
    });

    it("rejects deletion when the category does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }), destroy: jest.fn() };
      const repository = new CategoriesRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.delete("missing", "tenant-1")).rejects.toThrow(NotFoundException);
      expect(db.destroy).not.toHaveBeenCalled();
    });
  });

  describe("upsert", () => {
    it("creates a new document when none exists, keyed by the category's own id", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CategoriesRepository(couchDBService as any);

      const result = await service.upsert(category());

      expect(result).toBe(true);
      expect(couchDBService.getDatabase).toHaveBeenCalledWith("businessconnect_tenant-1");
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted).toMatchObject({
        _id: "category:category-1",
        type: "category",
        name: "Electronics",
        tenantId: "tenant-1",
      });
      expect(inserted).not.toHaveProperty("_rev");
    });

    it("includes the existing _rev when updating an already-mirrored category", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ _id: "category-1", _rev: "2-abc" }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CategoriesRepository(couchDBService as any);

      await service.upsert(category({ name: "Electronics & Gadgets" }));

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted._rev).toBe("2-abc");
      expect(inserted.name).toBe("Electronics & Gadgets");
    });

    it("swallows errors and returns false instead of throwing", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
      };
      const service = new CategoriesRepository(couchDBService as any);

      await expect(service.upsert(category())).resolves.toBe(false);
    });
  });

  describe("remove", () => {
    it("destroys the mirrored document when it exists", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ _id: "category-1", _rev: "3-def" }),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CategoriesRepository(couchDBService as any);

      await service.remove("category-1", "tenant-1");

      expect(db.destroy).toHaveBeenCalledWith("category-1", "3-def");
    });

    it("does nothing when no mirrored document exists", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        destroy: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CategoriesRepository(couchDBService as any);

      await service.remove("category-1", "tenant-1");

      expect(db.destroy).not.toHaveBeenCalled();
    });

    it("swallows errors instead of throwing", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
      };
      const service = new CategoriesRepository(couchDBService as any);

      await expect(service.remove("category-1", "tenant-1")).resolves.toBeUndefined();
    });
  });

  describe("findByTenant", () => {
    it("queries categories for the tenant, sorted by name", async () => {
      const docs = [{ _id: "category-1", type: "category", name: "Beverages" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new CategoriesRepository(couchDBService as any);

      const result = await service.findByTenant("tenant-1");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("businessconnect_tenant-1");
      expect(couchDBService.ensureIndex).toHaveBeenCalledWith(
        "businessconnect_tenant-1",
        "categories_by_tenant_name",
        ["tenantId", "type", "name"]
      );
      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "category", tenantId: "tenant-1" },
        sort: [{ name: "asc" }],
        limit: 100,
        skip: 0,
      });
      expect(result).toEqual([
        { _id: "category-1", type: "category", name: "Beverages", id: "category-1" },
      ]);
    });

    it("computes skip from an explicit offset", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new CategoriesRepository(couchDBService as any);

      await service.findByTenant("tenant-1", { limit: 20, offset: 40 });

      expect(db.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, skip: 40 }));
    });

    it("computes skip from page * limit when offset is not provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new CategoriesRepository(couchDBService as any);

      await service.findByTenant("tenant-1", { limit: 20, page: 2 });

      expect(db.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, skip: 40 }));
    });

    it("maps _id onto an id field on every returned document", async () => {
      const docs = [
        { _id: "category-1", type: "category", name: "Beverages" },
        { _id: "category-2", type: "category", name: "Snacks" },
      ];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new CategoriesRepository(couchDBService as any);

      const result = await service.findByTenant("tenant-1");

      expect(result).toEqual([
        { _id: "category-1", type: "category", name: "Beverages", id: "category-1" },
        { _id: "category-2", type: "category", name: "Snacks", id: "category-2" },
      ]);
    });
  });
});
