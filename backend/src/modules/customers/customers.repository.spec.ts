import { NotFoundException } from "@nestjs/common";
import { CustomersRepository } from "./customers.repository";
import type { Customer } from "@shared/schema";

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "customer-1",
    firstName: "Jane",
    lastName: "Doe",
    phone: "555-1234",
    email: "jane@example.com",
    address: null,
    tenantId: "tenant-1",
    totalPurchases: "0.00",
    createdAt: new Date("2026-08-12T10:00:00.000Z"),
    ...overrides,
  } as Customer;
}

describe("CustomersRepository", () => {
  describe("authoritative CRUD", () => {
    it("creates a customer with a zero purchase total", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new CustomersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.create({
        id: "123e4567-e89b-42d3-a456-426614174000",
        firstName: "Jane",
        lastName: "Doe",
        tenantId: "tenant-1",
      } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({
        _id: "customer:123e4567-e89b-42d3-a456-426614174000",
        id: "123e4567-e89b-42d3-a456-426614174000",
        totalPurchases: "0.00",
        type: "customer",
      }));
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    it("updates an existing customer and preserves its tenant", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "customer-1", _rev: "1-a", type: "customer", tenantId: "tenant-1",
          firstName: "Jane", lastName: "Doe", phone: null, email: null, address: null,
          totalPurchases: "0.00", createdAt: "2026-08-13T00:00:00.000Z",
        }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new CustomersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("customer-1", "tenant-1", { firstName: "Janet" });

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", firstName: "Janet" }));
      expect(result.firstName).toBe("Janet");
    });

    it("rejects deletion when the customer does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }), destroy: jest.fn() };
      const repository = new CustomersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.delete("missing", "tenant-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("upsert", () => {
    it("creates a new document when none exists, keyed by the customer's own id", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      const result = await service.upsert(customer());

      expect(result).toBe(true);
      expect(couchDBService.getDatabase).toHaveBeenCalledWith("businessconnect_tenant-1");
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted).toMatchObject({
        _id: "customer:customer-1",
        type: "customer",
        firstName: "Jane",
        lastName: "Doe",
        tenantId: "tenant-1",
      });
      expect(inserted).not.toHaveProperty("_rev");
    });

    it("includes the existing _rev when updating an already-mirrored customer", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ _id: "customer-1", _rev: "2-abc" }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      await service.upsert(customer({ totalPurchases: "42.50" }));

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted._rev).toBe("2-abc");
      expect(inserted.totalPurchases).toBe("42.50");
    });

    it("swallows errors and returns false instead of throwing", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
      };
      const service = new CustomersRepository(couchDBService as any);

      await expect(service.upsert(customer())).resolves.toBe(false);
    });
  });

  describe("remove", () => {
    it("destroys the mirrored document when it exists", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({ _id: "customer-1", _rev: "3-def" }),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      await service.remove("customer-1", "tenant-1");

      expect(db.destroy).toHaveBeenCalledWith("customer-1", "3-def");
    });

    it("does nothing when no mirrored document exists", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        destroy: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      await service.remove("customer-1", "tenant-1");

      expect(db.destroy).not.toHaveBeenCalled();
    });

    it("swallows errors instead of throwing", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
      };
      const service = new CustomersRepository(couchDBService as any);

      await expect(service.remove("customer-1", "tenant-1")).resolves.toBeUndefined();
    });
  });

  describe("findById", () => {
    it("returns the raw mirrored document", async () => {
      const doc = { _id: "customer-1", _rev: "1-a", type: "customer", firstName: "Jane" };
      const db = { get: jest.fn().mockResolvedValue(doc) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      const result = await service.findById("customer-1", "tenant-1");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("businessconnect_tenant-1");
      expect(result).toEqual(doc);
    });

    it("returns undefined when the customer has never been mirrored", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      const result = await service.findById("missing-customer", "tenant-1");

      expect(result).toBeUndefined();
    });
  });

  describe("findByTenant", () => {
    it("queries customers for the tenant, sorted by last then first name", async () => {
      const docs = [{ _id: "customer-1", type: "customer", firstName: "Jane", lastName: "Doe" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new CustomersRepository(couchDBService as any);

      const result = await service.findByTenant("tenant-1");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("businessconnect_tenant-1");
      expect(couchDBService.ensureIndex).toHaveBeenCalledWith(
        "businessconnect_tenant-1",
        "customers_by_tenant_name",
        ["tenantId", "type", "lastName", "firstName"]
      );
      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "customer", tenantId: "tenant-1" },
        sort: [{ lastName: "asc" }, { firstName: "asc" }],
        limit: 100,
        skip: 0,
      });
      expect(result).toEqual([{ ...docs[0], id: "customer-1" }]);
    });

    it("computes skip from an explicit offset", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new CustomersRepository(couchDBService as any);

      await service.findByTenant("tenant-1", { limit: 20, offset: 40 });

      expect(db.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, skip: 40 }));
    });
  });

  describe("search", () => {
    it("matches customers whose first name, last name, email, or phone contains the query", async () => {
      const docs = [{ _id: "customer-1", type: "customer", firstName: "Jane", lastName: "Doe" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      const result = await service.search("Doe", "tenant-1");

      expect(db.find).toHaveBeenCalledWith({
        selector: {
          type: "customer",
          tenantId: "tenant-1",
          $or: [
            { firstName: { $regex: "Doe" } },
            { lastName: { $regex: "Doe" } },
            { email: { $regex: "Doe" } },
            { phone: { $regex: "Doe" } },
          ],
        },
        limit: 100,
        skip: 0,
      });
      expect(result).toEqual([{ ...docs[0], id: "customer-1" }]);
    });

    it("escapes regex special characters in the query", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new CustomersRepository(couchDBService as any);

      await service.search("j.doe+1", "tenant-1");

      const call = db.find.mock.calls[0][0];
      expect(call.selector.$or[0].firstName.$regex).toBe("j\\.doe\\+1");
    });
  });
});
