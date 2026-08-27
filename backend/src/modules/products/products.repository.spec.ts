import { BadRequestException, ConflictException, Logger, NotFoundException } from "@nestjs/common";
import { ProductsRepository } from "./products.repository";
import {
  InsufficientStockException,
  VariantNotFoundException,
} from "../../lib/exceptions";
import type { Product } from "@shared/schema";

const product = (overrides: Record<string, unknown> = {}) => ({
  id: "product-1",
  name: "Tea",
  description: null,
  price: "10.00",
  cost: "5.00",
  barcode: "ABC-1",
  qrCode: null,
  categoryId: null,
  supplierId: null,
  tenantId: "tenant-1",
  minStockAlert: 10,
  isActive: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ...overrides,
});

describe("ProductsRepository", () => {
  describe("create", () => {
    it("creates the product and its initial stock snapshot in CouchDB", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
        destroy: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const result = await repository.create({
        id: "product-offline",
        name: "Tea",
        price: "10.00",
        cost: "5.00",
        tenantId: "tenant-1",
      } as any);

      expect(result).toMatchObject({
        id: "product-offline",
        tenantId: "tenant-1",
        barcode: null,
        isActive: true,
      });
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "product:product-offline",
          id: "product-offline",
          type: "product",
          initialQuantity: 0,
          stocks: expect.objectContaining({ quantity: 0, reservedQuantity: 0 }),
          variants: [],
          pricingRules: [],
        })
      );
    });

    it("rejects a category that does not belong to the tenant", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn(),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(
        repository.create({
          name: "Tea",
          price: "10.00",
          cost: "5.00",
          tenantId: "tenant-1",
          categoryId: "missing-category",
        } as any)
      ).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("rejects a rayon that does not belong to the tenant", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn(),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(
        repository.create({
          name: "Tea",
          price: "10.00",
          cost: "5.00",
          tenantId: "tenant-1",
          rayonId: "missing-rayon",
        } as any)
      ).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("denormalizes the rayon summary onto the created product document", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "rayon:rayon-1",
          type: "rayon",
          tenantId: "tenant-1",
          id: "rayon-1",
          name: "Boissons",
        }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
        destroy: jest.fn(),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await repository.create({
        name: "Tea",
        price: "10.00",
        cost: "5.00",
        tenantId: "tenant-1",
        rayonId: "rayon-1",
      } as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          rayonId: "rayon-1",
          rayon: { id: "rayon-1", name: "Boissons" },
        })
      );
    });

    it("reserves a normalized barcode and translates a concurrent duplicate", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockRejectedValue({ statusCode: 409 }),
        destroy: jest.fn(),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(
        repository.create({
          name: "Tea",
          price: "10.00",
          cost: "5.00",
          barcode: "  ABC-1  ",
          tenantId: "tenant-1",
        } as any)
      ).rejects.toThrow(ConflictException);
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "barcode_reservation",
          barcode: "ABC-1",
        })
      );
    });
  });

  describe("authoritative update and archive", () => {
    it("updates with the current revision and preserves nested projections", async () => {
      const existing = {
        ...product(),
        _id: "product:product-1",
        _rev: "2-current",
        type: "product",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
        stocks: { quantity: 4, reservedQuantity: 0 },
        variants: [{ id: "variant-1", quantity: 4 }],
        pricingRules: [],
      };
      const db = {
        get: jest.fn().mockResolvedValue(existing),
        insert: jest.fn().mockResolvedValue({ ok: true }),
        destroy: jest.fn(),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("product-1", "tenant-1", {
        name: "Green tea",
        cost: 6,
      } as any);

      expect(result).toMatchObject({ id: "product-1", name: "Green tea", cost: "6.00" });
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "product:product-1",
          _rev: "2-current",
          name: "Green tea",
          stocks: existing.stocks,
          variants: existing.variants,
        })
      );
    });

    it("throws not found when updating or archiving outside the tenant", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn(),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.update("missing", "tenant-1", { name: "Tea" } as any)).rejects.toThrow(
        NotFoundException
      );
      await expect(repository.archiveRequired("missing", "tenant-1")).rejects.toThrow(
        NotFoundException
      );
    });

    it("archives a product with an awaited CouchDB write", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "product:product-1",
          _rev: "3-current",
          type: "product",
          tenantId: "tenant-1",
          isActive: true,
        }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await repository.archiveRequired("product-1", "tenant-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ _rev: "3-current", isActive: false })
      );
    });

    it("reports a main document conflict as a concurrent modification", async () => {
      const existing = {
        ...product({ barcode: null }),
        _id: "product:product-1",
        _rev: "2-current",
        type: "product",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      };
      const db = {
        get: jest.fn().mockResolvedValue(existing),
        insert: jest.fn().mockRejectedValue({ statusCode: 409 }),
      };
      const repository = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.update("product-1", "tenant-1", { name: "Green tea" })
      ).rejects.toThrow("Product was modified concurrently");
    });

    it("assigns a rayon on update, denormalizing its summary", async () => {
      const db = {
        get: jest
          .fn()
          .mockResolvedValueOnce({
            _id: "product-1",
            _rev: "1-a",
            type: "product",
            tenantId: "tenant-1",
            categoryId: null,
            rayonId: null,
            rayon: null,
            variants: [],
            pricingRules: [],
            stocks: null,
            createdAt: "2026-08-13T00:00:00.000Z",
          })
          .mockResolvedValueOnce({
            _id: "rayon:rayon-1",
            type: "rayon",
            tenantId: "tenant-1",
            id: "rayon-1",
            name: "Boissons",
          }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("product-1", "tenant-1", { rayonId: "rayon-1" });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          rayonId: "rayon-1",
          rayon: { id: "rayon-1", name: "Boissons" },
        })
      );
      expect(result.rayonId).toBe("rayon-1");
    });

    it("clears an assigned rayon when rayonId is explicitly null", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "product-1",
          _rev: "1-a",
          type: "product",
          tenantId: "tenant-1",
          categoryId: null,
          rayonId: "rayon-1",
          rayon: { id: "rayon-1", name: "Boissons" },
          variants: [],
          pricingRules: [],
          stocks: null,
          createdAt: "2026-08-13T00:00:00.000Z",
        }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("product-1", "tenant-1", { rayonId: null });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ rayonId: null, rayon: null })
      );
      expect(result.rayonId).toBeNull();
    });

    it("preserves the current rayon when rayonId is omitted from the update", async () => {
      const db = {
        get: jest
          .fn()
          .mockResolvedValueOnce({
            _id: "product-1",
            _rev: "1-a",
            type: "product",
            tenantId: "tenant-1",
            categoryId: null,
            rayonId: "rayon-1",
            rayon: { id: "rayon-1", name: "Boissons" },
            variants: [],
            pricingRules: [],
            stocks: null,
            createdAt: "2026-08-13T00:00:00.000Z",
          })
          .mockResolvedValueOnce({
            _id: "rayon:rayon-1",
            type: "rayon",
            tenantId: "tenant-1",
            id: "rayon-1",
            name: "Boissons",
          }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new ProductsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await repository.update("product-1", "tenant-1", { name: "Tea (updated)" });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ rayonId: "rayon-1", rayon: { id: "rayon-1", name: "Boissons" } })
      );
    });
  });

  describe("upsert", () => {
    it("inserts a new document when none exists yet", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.upsert(product() as any);

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "product:product-1",
          type: "product",
          name: "Tea",
          tenantId: "tenant-1",
        })
      );
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted).not.toHaveProperty("_rev");
    });

    it("carries the current _rev when the document already exists", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ _id: "product-1", _rev: "3-abc" }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.upsert(product() as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "product:product-1", _rev: "3-abc" })
      );
    });

    it("does not throw when the CouchDB write fails, and reports the failure", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB is down")),
      };
      const service = new ProductsRepository(couchDBService as any);

      await expect(service.upsert(product() as any)).resolves.toBe(false);
    });

    it("serializes operations for the same product id in call order", async () => {
      const calls: string[] = [];
      let releaseInsert: () => void = () => {};
      const insertGate = new Promise<void>((resolve) => {
        releaseInsert = resolve;
      });
      let getCallCount = 0;

      const db = {
        get: jest.fn().mockImplementation(async () => {
          getCallCount += 1;
          calls.push(`get-${getCallCount}`);
          if (getCallCount === 1) {
            throw { statusCode: 404 };
          }
          return { _id: "product-1", _rev: "1-abc" };
        }),
        insert: jest.fn().mockImplementation(async () => {
          calls.push("insert-start");
          await insertGate;
          calls.push("insert-end");
          return { ok: true };
        }),
        destroy: jest.fn().mockImplementation(async () => {
          calls.push("destroy");
          return { ok: true };
        }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const upsertPromise = service.upsert(product() as any);
      const removePromise = service.remove("product-1", "tenant-1");

      await new Promise((resolve) => setTimeout(resolve, 10));
      releaseInsert();
      await Promise.all([upsertPromise, removePromise]);

      expect(calls).toEqual([
        "get-1",
        "insert-start",
        "insert-end",
        "get-2",
        "destroy",
      ]);
    });

    it("includes the category when provided", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.upsert(product() as any, { id: "cat-1", name: "Electronics" });

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.category).toEqual({ id: "cat-1", name: "Electronics" });
    });

    it("defaults category to null when not provided", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.upsert(product() as any);

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.category).toBeNull();
    });
  });

  describe("remove", () => {
    it("destroys the document using its current _rev", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ _id: "product-1", _rev: "2-xyz" }),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.remove("product-1", "tenant-1");

      expect(db.destroy).toHaveBeenCalledWith("product-1", "2-xyz");
    });

    it("does nothing when the document does not exist", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        destroy: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.remove("product-1", "tenant-1");

      expect(db.destroy).not.toHaveBeenCalled();
    });

    it("does not throw when the CouchDB delete fails", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB is down")),
      };
      const service = new ProductsRepository(couchDBService as any);

      await expect(service.remove("product-1", "tenant-1")).resolves.toBeUndefined();
    });
  });

  describe("stock and variant snapshot preservation", () => {
    it("preserves an existing mirrored document's stocks and variants when upsert is called again for a base-field update", async () => {
      const existingDoc = {
        _id: "product-1",
        _rev: "3-abc",
        type: "product",
        name: "Old name",
        tenantId: "tenant-1",
        stocks: { quantity: 42, reservedQuantity: 2, lastUpdated: "2026-08-12T09:00:00.000Z" },
        variants: [{ id: "variant-1", sku: "SKU-1", quantity: 5 }],
      };
      const db = {
        get: jest.fn().mockResolvedValue(existingDoc),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.upsert(
        product({ id: "product-1", tenantId: "tenant-1", name: "New name" }) as any
      );

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.name).toBe("New name");
      expect(inserted.stocks).toEqual(existingDoc.stocks);
      expect(inserted.variants).toEqual(existingDoc.variants);
    });

    it("defaults stocks to null and variants to an empty array on first mirror", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.upsert(product({ id: "product-1", tenantId: "tenant-1" }) as any);

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.stocks).toBeNull();
      expect(inserted.variants).toEqual([]);
    });
  });

  describe("updateStockSnapshot", () => {
    it("patches only the stocks field on an already-mirrored product", async () => {
      const existingDoc = {
        _id: "product-1",
        _rev: "3-abc",
        type: "product",
        name: "Widget",
        tenantId: "tenant-1",
        stocks: null,
        variants: [],
      };
      const db = {
        get: jest.fn().mockResolvedValue(existingDoc),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.updateStockSnapshot("product-1", "tenant-1", {
        quantity: 10,
        reservedQuantity: 1,
        lastUpdated: "2026-08-12T10:00:00.000Z",
      });

      expect(result).toBe(true);
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.name).toBe("Widget");
      expect(inserted.stocks).toEqual({
        quantity: 10,
        reservedQuantity: 1,
        lastUpdated: "2026-08-12T10:00:00.000Z",
      });
      expect(inserted._rev).toBe("3-abc");
    });

    it("does nothing and returns false when the product has never been mirrored", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.updateStockSnapshot("product-1", "tenant-1", {
        quantity: 10,
        reservedQuantity: 0,
        lastUpdated: "2026-08-12T10:00:00.000Z",
      });

      expect(result).toBe(false);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("swallows errors and returns false instead of throwing", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
      };
      const service = new ProductsRepository(couchDBService as any);

      await expect(
        service.updateStockSnapshot("product-1", "tenant-1", {
          quantity: 10,
          reservedQuantity: 0,
          lastUpdated: "2026-08-12T10:00:00.000Z",
        })
      ).resolves.toBe(false);
    });
  });

  describe("renameCategoryOnProducts", () => {
    it("patches category.name on every product document referencing the category", async () => {
      const docA = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Old" },
      };
      const docB = {
        _id: "product-2",
        _rev: "1-b",
        type: "product",
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Old" },
      };
      const db = {
        find: jest.fn().mockResolvedValue({ docs: [docA, docB] }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.renameCategoryOnProducts("tenant-1", "cat-1", "New name");

      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "product", tenantId: "tenant-1", categoryId: "cat-1" },
      });
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "product-1", category: { id: "cat-1", name: "New name" } })
      );
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ _id: "product-2", category: { id: "cat-1", name: "New name" } })
      );
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it("swallows a getDatabase failure instead of throwing", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
      };
      const service = new ProductsRepository(couchDBService as any);

      await expect(
        service.renameCategoryOnProducts("tenant-1", "cat-1", "New name")
      ).resolves.toBeUndefined();
    });

    it("logs a warning and does not crash when an individual insert fails", async () => {
      const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined as any);
      const docA = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Old" },
      };
      const db = {
        find: jest.fn().mockResolvedValue({ docs: [docA] }),
        insert: jest.fn().mockRejectedValue(new Error("conflict")),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await service.renameCategoryOnProducts("tenant-1", "cat-1", "New name");

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Failed to cascade category rename cat-1 to product product-1")
      );
      warnSpy.mockRestore();
    });

    it("continues patching remaining products when one insert fails", async () => {
      const docA = {
        _id: "product:product-1",
        _rev: "1-a",
        type: "product",
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Old" },
      };
      const docB = {
        _id: "product:product-2",
        _rev: "1-b",
        type: "product",
        categoryId: "cat-1",
        category: { id: "cat-1", name: "Old" },
      };
      const db = {
        find: jest.fn().mockResolvedValue({ docs: [docA, docB] }),
        insert: jest
          .fn()
          .mockRejectedValueOnce(new Error("conflict on product-1"))
          .mockResolvedValueOnce({ ok: true }),
      };
      const repository = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await repository.renameCategoryOnProducts("tenant-1", "cat-1", "New name");

      expect(db.insert).toHaveBeenCalledTimes(2);
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "product:product-2",
          category: { id: "cat-1", name: "New name" },
        })
      );
    });

  describe("hasProductsReferencing", () => {
    it("detects a product referencing a category", async () => {
      const db = {
        find: jest.fn().mockResolvedValue({ docs: [{ _id: "product:product-1" }] }),
      };
      const repository = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.hasProductsReferencing("tenant-1", "categoryId", "cat-1")
      ).resolves.toBe(true);
    });

    it("returns false when no product references a supplier", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const repository = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.hasProductsReferencing("tenant-1", "supplierId", "supplier-1")
      ).resolves.toBe(false);
    });
  });
  });

  describe("findByTenant", () => {
    it("queries active products for the tenant, sorted by name", async () => {
      const docs = [{ _id: "product-1", type: "product", name: "Tea" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findByTenant("tenant-1");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
      expect(couchDBService.ensureIndex).toHaveBeenCalledWith(
        "medicalconnect_tenant-1",
        "products_by_tenant_name",
        ["tenantId", "type", "isActive", "name"]
      );
      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "product", tenantId: "tenant-1", isActive: true },
        sort: [{ name: "asc" }],
        limit: 100,
        skip: 0,
      });
      expect(result).toEqual(docs);
    });

    it("computes skip from an explicit offset", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      await service.findByTenant("tenant-1", { limit: 20, offset: 40 });

      expect(db.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, skip: 40 }));
    });

    it("computes skip from page * limit when offset is not provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      await service.findByTenant("tenant-1", { limit: 20, page: 2 });

      expect(db.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, skip: 40 }));
    });
  });

  describe("search", () => {
    it("matches products whose name contains the query, case-sensitively", async () => {
      const docs = [{ _id: "product-1", type: "product", name: "Green Tea" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.search("Tea", "tenant-1");

      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "product", tenantId: "tenant-1", name: { $regex: "Tea" } },
        sort: [{ name: "asc" }],
        limit: 100,
        skip: 0,
      });
      expect(result).toEqual(docs);
    });

    it("escapes regex special characters in the query", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      await service.search("C++ (Pro)", "tenant-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({ name: { $regex: "C\\+\\+ \\(Pro\\)" } }),
        })
      );
    });
  });

  describe("findByBarcode", () => {
    it("returns the first product matching the barcode for the tenant", async () => {
      const doc = { _id: "product-1", type: "product", barcode: "ABC-1" };
      const db = { find: jest.fn().mockResolvedValue({ docs: [doc] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findByBarcode("ABC-1", "tenant-1");

      expect(couchDBService.ensureIndex).toHaveBeenCalledWith(
        "medicalconnect_tenant-1",
        "products_by_tenant_barcode",
        ["tenantId", "type", "barcode"]
      );
      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "product", tenantId: "tenant-1", barcode: "ABC-1" },
        limit: 1,
      });
      expect(result).toEqual(doc);
    });

    it("returns undefined when no product matches", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findByBarcode("MISSING", "tenant-1");

      expect(result).toBeUndefined();
    });
  });

  describe("adjustStock", () => {
    it("decrements product-level stock and returns the previous/new quantity", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 10, reservedQuantity: 1, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [],
      };
      const db = {
        get: jest.fn().mockResolvedValue(doc),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.adjustStock("product-1", "tenant-1", -3);

      expect(result).toEqual({ previousQuantity: 10, newQuantity: 7 });
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.stocks).toEqual(
        expect.objectContaining({ quantity: 7, reservedQuantity: 1 })
      );
      expect(inserted._rev).toBe("1-a");
    });

    it("increments product-level stock for a positive delta (e.g. a rollback)", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 7, reservedQuantity: 0, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [],
      };
      const db = {
        get: jest.fn().mockResolvedValue(doc),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.adjustStock("product-1", "tenant-1", 3);

      expect(result).toEqual({ previousQuantity: 7, newQuantity: 10 });
    });

    it("throws instead of letting product stock go negative", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 2, reservedQuantity: 0, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [],
      };
      const db = { get: jest.fn().mockResolvedValue(doc), insert: jest.fn() };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await expect(service.adjustStock("product-1", "tenant-1", -5)).rejects.toThrow(
        InsufficientStockException
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("throws NotFoundException when the product has never been mirrored", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await expect(service.adjustStock("product-1", "tenant-1", -1)).rejects.toThrow(
        NotFoundException
      );
    });

    it("decrements a variant's quantity and recomputes the product's aggregate stock from active variants", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 12, reservedQuantity: 0, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [
          { id: "variant-1", sku: "S", quantity: 5, isActive: true },
          { id: "variant-2", sku: "M", quantity: 7, isActive: true },
        ],
      };
      const db = {
        get: jest.fn().mockResolvedValue(doc),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.adjustStock("product-1", "tenant-1", -2, "variant-1");

      expect(result).toEqual({ previousQuantity: 5, newQuantity: 3 });
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.variants).toEqual([
        { id: "variant-1", sku: "S", quantity: 3, isActive: true },
        { id: "variant-2", sku: "M", quantity: 7, isActive: true },
      ]);
      // 3 (variant-1) + 7 (variant-2) = 10
      expect(inserted.stocks.quantity).toBe(10);
    });

    it("excludes archived variants from the recomputed aggregate stock", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 12, reservedQuantity: 0, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [
          { id: "variant-1", sku: "S", quantity: 5, isActive: true },
          { id: "variant-2", sku: "M", quantity: 7, isActive: false },
        ],
      };
      const db = {
        get: jest.fn().mockResolvedValue(doc),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.adjustStock("product-1", "tenant-1", -1, "variant-1");

      expect(result).toEqual({ previousQuantity: 5, newQuantity: 4 });
      const inserted = db.insert.mock.calls[0][0];
      // only variant-1 (active) counts: 4 + 0 = 4
      expect(inserted.stocks.quantity).toBe(4);
    });

    it("throws VariantNotFoundException when the variant isn't on the product", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: null,
        variants: [],
      };
      const db = { get: jest.fn().mockResolvedValue(doc), insert: jest.fn() };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await expect(
        service.adjustStock("product-1", "tenant-1", -1, "missing-variant")
      ).rejects.toThrow(VariantNotFoundException);
    });

    it("throws instead of letting variant stock go negative", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 5, reservedQuantity: 0, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [{ id: "variant-1", sku: "S", quantity: 2, isActive: true }],
      };
      const db = { get: jest.fn().mockResolvedValue(doc), insert: jest.fn() };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await expect(
        service.adjustStock("product-1", "tenant-1", -3, "variant-1")
      ).rejects.toThrow(InsufficientStockException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("allows an adjustment that brings product stock exactly to zero", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 2, reservedQuantity: 0 },
        variants: [],
      };
      const db = {
        get: jest.fn().mockResolvedValue(doc),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const service = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(service.adjustStock("product-1", "tenant-1", -2)).resolves.toEqual({
        previousQuantity: 2,
        newQuantity: 0,
      });
      expect(db.insert).toHaveBeenCalled();
    });

    it("retries with a freshly re-read document after a write conflict, then succeeds", async () => {
      const staleDoc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 10, reservedQuantity: 0, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [],
      };
      const freshDoc = { ...staleDoc, _rev: "2-b", stocks: { quantity: 8, reservedQuantity: 0, lastUpdated: "2026-08-01T00:01:00.000Z" } };
      const db = {
        get: jest
          .fn()
          .mockResolvedValueOnce(staleDoc)
          .mockResolvedValueOnce(freshDoc),
        insert: jest
          .fn()
          .mockRejectedValueOnce({ statusCode: 409 })
          .mockResolvedValueOnce({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.adjustStock("product-1", "tenant-1", -3);

      expect(result).toEqual({ previousQuantity: 8, newQuantity: 5 });
      expect(db.get).toHaveBeenCalledTimes(2);
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it("gives up and rethrows after exhausting retries on repeated conflicts", async () => {
      const doc = {
        _id: "product-1",
        _rev: "1-a",
        type: "product",
        stocks: { quantity: 10, reservedQuantity: 0, lastUpdated: "2026-08-01T00:00:00.000Z" },
        variants: [],
      };
      const db = {
        get: jest.fn().mockResolvedValue(doc),
        insert: jest.fn().mockRejectedValue({ statusCode: 409 }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      await expect(service.adjustStock("product-1", "tenant-1", -1)).rejects.toMatchObject({
        statusCode: 409,
      });
    });
  });

  describe("findById", () => {
    it("returns the raw mirrored document for the product", async () => {
      const doc = { _id: "product-1", _rev: "3-abc", type: "product", name: "Tea", variants: [] };
      const db = { get: jest.fn().mockResolvedValue(doc) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findById("product-1", "tenant-1");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
      expect(db.get).toHaveBeenCalledWith("product:product-1");
      expect(result).toEqual(doc);
    });

    it("returns undefined when the product has never been mirrored", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findById("missing-product", "tenant-1");

      expect(result).toBeUndefined();
    });
  });

  describe("variant barcode uniqueness", () => {
    it("stores the immutable initial variant quantity for stock reconstruction", async () => {
      const storedProduct = {
        _id: "product-1",
        _rev: "1-a",
        id: "product-1",
        type: "product",
        tenantId: "tenant-1",
        stocks: { quantity: 0, reservedQuantity: 0 },
        variants: [],
      };
      const inserted: any[] = [];
      const db = {
        get: jest.fn().mockResolvedValue(storedProduct),
        insert: jest.fn().mockImplementation(async (doc: any) => {
          inserted.push(doc);
          return { ok: true, rev: "2-b" };
        }),
        destroy: jest.fn(),
      };
      const repository = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await repository.createVariant(
        {
          id: "variant-1",
          productId: "product-1",
          attributes: [{ name: "Size", value: "L" }],
          quantity: 4,
        },
        "tenant-1"
      );

      expect(inserted[0].variants[0]).toMatchObject({
        id: "variant-1",
        quantity: 4,
        initialQuantity: 4,
      });
    });

    it("rejects a variant barcode already reserved in the tenant", async () => {
      const storedProduct = {
        _id: "product-1",
        _rev: "1-a",
        id: "product-1",
        type: "product",
        tenantId: "tenant-1",
        stocks: { quantity: 0, reservedQuantity: 0 },
        variants: [],
      };
      const db = {
        get: jest.fn().mockResolvedValue(storedProduct),
        insert: jest.fn().mockImplementation(async (doc: any) => {
          if (doc.type === "barcode_reservation") throw { statusCode: 409 };
          return { ok: true, rev: "2-b" };
        }),
        destroy: jest.fn(),
      };
      const repository = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.createVariant(
          {
            id: "variant-1",
            productId: "product-1",
            attributes: [{ name: "Size", value: "L" }],
            barcode: "  ABC-1  ",
          },
          "tenant-1"
        )
      ).rejects.toThrow(ConflictException);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "barcode_reservation",
          barcode: "ABC-1",
          productId: "product-1",
          variantId: "variant-1",
        })
      );
    });

    it("rejects a conflicting barcode when a variant barcode changes", async () => {
      const storedProduct = {
        _id: "product-1",
        _rev: "1-a",
        id: "product-1",
        type: "product",
        tenantId: "tenant-1",
        stocks: { quantity: 1, reservedQuantity: 0 },
        variants: [
          {
            id: "variant-1",
            productId: "product-1",
            tenantId: "tenant-1",
            barcode: "OLD-1",
            quantity: 1,
            isActive: true,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
          },
        ],
      };
      const db = {
        find: jest.fn().mockResolvedValue({ docs: [storedProduct] }),
        get: jest.fn().mockResolvedValue(storedProduct),
        insert: jest.fn().mockImplementation(async (doc: any) => {
          if (doc.type === "barcode_reservation") throw { statusCode: 409 };
          return { ok: true, rev: "2-b" };
        }),
        destroy: jest.fn(),
      };
      const repository = new ProductsRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.updateVariant("variant-1", "tenant-1", { barcode: " NEW-1 " })
      ).rejects.toThrow(ConflictException);
      expect(db.insert).toHaveBeenCalledTimes(1);
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "barcode_reservation",
          barcode: "NEW-1",
          productId: "product-1",
          variantId: "variant-1",
        })
      );
    });
  });

  describe("findWithStock", () => {
    it("maps active products into stock entries, defaulting an unmirrored stocks field to zero", async () => {
      const docs = [
        {
          _id: "product-1",
          type: "product",
          name: "Tea",
          description: "Green tea",
          price: "10.00",
          cost: "4.00",
          barcode: "ABC-1",
          categoryId: "cat-1",
          category: { id: "cat-1", name: "Drinks" },
          minStockAlert: 5,
          isActive: true,
          updatedAt: "2026-08-10T00:00:00.000Z",
          stocks: { quantity: 12, reservedQuantity: 1, lastUpdated: "2026-08-12T09:00:00.000Z" },
          variants: [{ id: "variant-1", sku: "TEA-L" }],
        },
        {
          _id: "product-2",
          type: "product",
          name: "Coffee",
          description: null,
          price: "12.00",
          cost: "5.00",
          barcode: null,
          categoryId: null,
          category: null,
          minStockAlert: 10,
          isActive: true,
          updatedAt: "2026-08-09T00:00:00.000Z",
          stocks: null,
          variants: [],
        },
      ];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findWithStock("tenant-1");

      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "product", tenantId: "tenant-1", isActive: true },
        sort: [{ name: "asc" }],
        limit: 100,
        skip: 0,
      });
      expect(result[0]).toEqual({
        id: "product-1",
        productId: "product-1",
        tenantId: "tenant-1",
        quantity: 12,
        reservedQuantity: 1,
        lastUpdated: "2026-08-12T09:00:00.000Z",
        product: {
          id: "product-1",
          name: "Tea",
          description: "Green tea",
          price: "10.00",
          cost: "4.00",
          barcode: "ABC-1",
          categoryId: "cat-1",
          category: { id: "cat-1", name: "Drinks" },
          rayonId: null,
          rayon: null,
          minStockAlert: 5,
          isActive: true,
          variants: [{ id: "variant-1", sku: "TEA-L" }],
        },
      });
      expect(result[1]).toMatchObject({
        productId: "product-2",
        quantity: 0,
        reservedQuantity: 0,
        lastUpdated: "2026-08-09T00:00:00.000Z",
      });
    });
  });

  describe("findLowStock", () => {
    it("returns only products whose stock quantity is at or below their minStockAlert", async () => {
      const docs = [
        {
          _id: "product-1",
          type: "product",
          name: "Tea",
          minStockAlert: 10,
          isActive: true,
          updatedAt: "2026-08-10T00:00:00.000Z",
          stocks: { quantity: 3, reservedQuantity: 0, lastUpdated: "2026-08-12T09:00:00.000Z" },
          variants: [],
        },
        {
          _id: "product-2",
          type: "product",
          name: "Coffee",
          minStockAlert: 10,
          isActive: true,
          updatedAt: "2026-08-10T00:00:00.000Z",
          stocks: { quantity: 50, reservedQuantity: 0, lastUpdated: "2026-08-12T09:00:00.000Z" },
          variants: [],
        },
        {
          _id: "product-3",
          type: "product",
          name: "Sugar",
          minStockAlert: 5,
          isActive: true,
          updatedAt: "2026-08-10T00:00:00.000Z",
          stocks: null,
          variants: [],
        },
      ];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findLowStock("tenant-1");

      expect(result.map((entry: any) => entry.productId)).toEqual(["product-1", "product-3"]);
    });

    it("paginates the filtered results in-memory", async () => {
      const docs = Array.from({ length: 5 }, (_, i) => ({
        _id: `product-${i}`,
        type: "product",
        name: `Product ${i}`,
        minStockAlert: 10,
        isActive: true,
        updatedAt: "2026-08-10T00:00:00.000Z",
        stocks: { quantity: 0, reservedQuantity: 0, lastUpdated: "2026-08-12T09:00:00.000Z" },
        variants: [],
      }));
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ProductsRepository(couchDBService as any);

      const result = await service.findLowStock("tenant-1", { limit: 2, offset: 1 });

      expect(result.map((entry: any) => entry.productId)).toEqual(["product-1", "product-2"]);
    });
  });

  describe("ProductsRepository rayon rename cascade", () => {
    describe("renameRayonOnProducts", () => {
      it("patches rayon.name on every product document referencing the rayon", async () => {
        const docA = {
          _id: "product-1",
          _rev: "1-a",
          type: "product",
          rayonId: "rayon-1",
          rayon: { id: "rayon-1", name: "Old" },
        };
        const db = {
          find: jest.fn().mockResolvedValue({ docs: [docA] }),
          insert: jest.fn().mockResolvedValue({ ok: true }),
        };
        const repository = new ProductsRepository({
          getDatabase: jest.fn().mockResolvedValue(db),
        } as any);

        await repository.renameRayonOnProducts("tenant-1", "rayon-1", "New name");

        expect(db.find).toHaveBeenCalledWith({
          selector: { type: "product", tenantId: "tenant-1", rayonId: "rayon-1" },
          limit: expect.any(Number),
        });
        expect(db.insert).toHaveBeenCalledWith(
          expect.objectContaining({ _id: "product-1", rayon: { id: "rayon-1", name: "New name" } })
        );
      });

      it("swallows a getDatabase failure instead of throwing", async () => {
        const repository = new ProductsRepository({
          getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
        } as any);

        await expect(
          repository.renameRayonOnProducts("tenant-1", "rayon-1", "New name")
        ).resolves.toBeUndefined();
      });

      it("requests every matching product, not CouchDB's default page size", async () => {
        const db = {
          find: jest.fn().mockResolvedValue({ docs: [] }),
          insert: jest.fn(),
        };
        const repository = new ProductsRepository({
          getDatabase: jest.fn().mockResolvedValue(db),
        } as any);

        await repository.renameRayonOnProducts("tenant-1", "rayon-1", "New name");

        expect(db.find).toHaveBeenCalledWith(
          expect.objectContaining({ limit: expect.any(Number) })
        );
        expect((db.find.mock.calls[0][0] as any).limit).toBeGreaterThan(25);
      });
    });
  });

  describe("calculateProductPrice", () => {
    it("prefers a dated selling price over the static product.price when no pricing rule matches", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "product:product-1",
          id: "product-1",
          tenantId: "tenant-1",
          price: "9.99",
          pricingRules: [],
          variants: [],
          sellingPrices: [
            {
              id: "sp-1",
              variantId: null,
              price: "12.50",
              effectiveAt: new Date("2026-08-01").toISOString(),
              createdByUserId: "user-1",
              createdAt: new Date("2026-08-01").toISOString(),
            },
          ],
        }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const result = await repository.calculateProductPrice("tenant-1", "product-1", 1);

      expect(result).toEqual({ price: "12.50" });
    });
  });

  describe("sellingPrices", () => {
    function dbWithProduct(product: Record<string, unknown>) {
      const state = { doc: { _rev: "1-a", ...product } };
      return {
        get: jest.fn().mockImplementation(() => Promise.resolve(state.doc)),
        insert: jest.fn().mockImplementation((doc: any) => {
          state.doc = { ...doc, _rev: `${Number(state.doc._rev.split("-")[0]) + 1}-b` };
          return Promise.resolve({ ok: true, rev: state.doc._rev });
        }),
      };
    }

    it("rejects a variantId on a product without variants", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        variants: [], sellingPrices: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      await expect(
        repository.addSellingPrice("p1", "tenant-1", {
          variantId: "variant-x", price: "10.00", createdByUserId: "user-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects a missing variantId on a product with variants", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        variants: [{ id: "variant-1", isActive: true }], sellingPrices: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      await expect(
        repository.addSellingPrice("p1", "tenant-1", { price: "10.00", createdByUserId: "user-1" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("rejects an unknown variantId with VariantNotFoundException", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        variants: [{ id: "variant-1", isActive: true }], sellingPrices: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      await expect(
        repository.addSellingPrice("p1", "tenant-1", {
          variantId: "variant-unknown", price: "10.00", createdByUserId: "user-1",
        })
      ).rejects.toBeInstanceOf(VariantNotFoundException);
    });

    it("appends a new selling price entry and returns it sorted on read", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        variants: [], sellingPrices: [
          { id: "sp-old", variantId: null, price: "9.00", effectiveAt: "2026-08-01T00:00:00.000Z", createdByUserId: "user-1", createdAt: "2026-08-01T00:00:00.000Z" },
        ],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const created = await repository.addSellingPrice("p1", "tenant-1", {
        price: "12.00", createdByUserId: "user-2", effectiveAt: "2026-08-10T00:00:00.000Z",
      });
      expect(created).toMatchObject({ variantId: null, price: "12.00", createdByUserId: "user-2" });

      const history = await repository.getSellingPrices("p1", "tenant-1", null);
      expect(history.map((e) => e.id)).toEqual([created.id, "sp-old"]);
    });

    it("replays the same client-supplied id idempotently instead of duplicating", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        variants: [], sellingPrices: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const first = await repository.addSellingPrice("p1", "tenant-1", {
        id: "sp-fixed", price: "10.00", createdByUserId: "user-1",
      });
      const second = await repository.addSellingPrice("p1", "tenant-1", {
        id: "sp-fixed", price: "999.00", createdByUserId: "user-1",
      });

      expect(second).toEqual(first);
      const history = await repository.getSellingPrices("p1", "tenant-1", null);
      expect(history).toHaveLength(1);
    });
  });

  describe("purchases", () => {
    function dbWithProduct(product: Record<string, unknown>) {
      const state = { doc: { _rev: "1-a", ...product } };
      return {
        get: jest.fn().mockImplementation(() => Promise.resolve(state.doc)),
        insert: jest.fn().mockImplementation((doc: any) => {
          state.doc = { ...doc, _rev: `${Number(state.doc._rev.split("-")[0]) + 1}-b` };
          return Promise.resolve({ ok: true, rev: state.doc._rev });
        }),
      };
    }

    it("computes CUMP against currentQuantity=0 as a straight passthrough", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        cost: "0.00", stocks: { quantity: 0, reservedQuantity: 0 },
        variants: [], purchases: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const result = await repository.addPurchase("p1", "tenant-1", {
        quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF",
        conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
      });

      expect(result.newCost).toBe("2000.00");
      expect(result.newQuantity).toBe(100);
      expect(result.previousQuantity).toBe(0);
      expect(result.previousCost).toBe("0.00");
    });

    it("computes the weighted average cost against existing stock", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        cost: "1000.00", stocks: { quantity: 10, reservedQuantity: 0 },
        variants: [], purchases: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const result = await repository.addPurchase("p1", "tenant-1", {
        quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF",
        conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
      });

      // (10*1000 + 100*2000) / 110 = 1909.09
      expect(result.newCost).toBe("1909.09");
      expect(result.previousCost).toBe("1000.00");
      expect(result.previousQuantity).toBe(10);
    });

    it("scopes CUMP to the targeted variant without touching sibling variants", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        variants: [
          { id: "variant-m", isActive: true, quantity: 10, cost: "1000.00" },
          { id: "variant-l", isActive: true, quantity: 5, cost: "1200.00" },
        ],
        purchases: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const result = await repository.addPurchase("p1", "tenant-1", {
        variantId: "variant-m", quantity: 100, unitPurchasePrice: 2000,
        purchaseCurrency: "XOF", conversionRate: 1, referenceCurrency: "XOF",
        createdByUserId: "user-1",
      });

      expect(result.newCost).toBe("1909.09");
      const untouched = await repository.findById("p1", "tenant-1");
      expect(untouched.variants.find((v: any) => v.id === "variant-l")).toMatchObject({
        cost: "1200.00", quantity: 5,
      });
    });

    it("rejects a purchase without variantId on a product with variants", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        variants: [{ id: "variant-1", isActive: true, quantity: 0, cost: "0.00" }],
        purchases: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      await expect(
        repository.addPurchase("p1", "tenant-1", {
          quantity: 10, unitPurchasePrice: 100, purchaseCurrency: "XOF",
          conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("replays the same client-supplied id idempotently instead of duplicating", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        cost: "1000.00", stocks: { quantity: 10, reservedQuantity: 0 },
        variants: [], purchases: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const first = await repository.addPurchase("p1", "tenant-1", {
        id: "purchase-fixed", quantity: 100, unitPurchasePrice: 2000,
        purchaseCurrency: "XOF", conversionRate: 1, referenceCurrency: "XOF",
        createdByUserId: "user-1",
      });
      const second = await repository.addPurchase("p1", "tenant-1", {
        id: "purchase-fixed", quantity: 999, unitPurchasePrice: 1, purchaseCurrency: "XOF",
        conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
      });

      expect(second.alreadyApplied).toBe(true);
      expect(second.purchase).toEqual(first.purchase);
      const product = await repository.findById("p1", "tenant-1");
      expect(product.purchases).toHaveLength(1);
      expect(product.stocks.quantity).toBe(110);
    });

    it("restores quantity and cost on revertPurchaseImpact, leaving purchases untouched", async () => {
      const db = dbWithProduct({
        _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
        cost: "1000.00", stocks: { quantity: 10, reservedQuantity: 0 },
        variants: [], purchases: [],
      });
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new ProductsRepository(couchDBService as any);

      const result = await repository.addPurchase("p1", "tenant-1", {
        quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF",
        conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
      });
      await repository.revertPurchaseImpact(
        "p1", "tenant-1", result.variantId, result.previousQuantity, result.previousCost
      );

      const product = await repository.findById("p1", "tenant-1");
      expect(product.cost).toBe("1000.00");
      expect(product.stocks.quantity).toBe(10);
      expect(product.purchases).toHaveLength(1); // l'achat reste dans l'historique
    });
  });
});
