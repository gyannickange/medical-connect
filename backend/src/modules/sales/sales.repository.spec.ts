import { SalesRepository, type SaleItemSnapshot } from "./sales.repository";
import type { Sale } from "@shared/schema";

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: "sale-1",
    saleNumber: "SALE-1",
    customerId: null,
    userId: "user-1",
    subtotal: "100.00",
    tax: "0.00",
    total: "100.00",
    profit: "20.00",
    qrCode: null,
    paymentMethod: "cash",
    status: "completed",
    tenantId: "tenant-1",
    createdAt: new Date("2026-08-12T10:00:00.000Z"),
    ...overrides,
  } as Sale;
}

function items(): SaleItemSnapshot[] {
  return [
    {
      productId: "product-1",
      variantId: null,
      quantity: 2,
      unitPrice: "50.00",
      totalPrice: "100.00",
      priceType: null,
      pricingId: null,
      product: { id: "product-1", name: "Tea", description: null, cost: "20.00" },
      variant: null,
    },
  ];
}

describe("SalesRepository", () => {
  describe("record", () => {
    it("records a sale into the tenant's sales database, keyed by the sale's own id, with items nested", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new SalesRepository(couchDBService as any);

      const result = await service.record(sale(), items());

      expect(result).toBe(true);
      expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted).toMatchObject({
        _id: "sale:sale-1",
        id: "sale-1",
        type: "sale",
        saleNumber: "SALE-1",
        customerId: null,
        customer: null,
        userId: "user-1",
        subtotal: "100.00",
        tax: "0.00",
        total: "100.00",
        profit: "20.00",
        paymentMethod: "cash",
        status: "completed",
        tenantId: "tenant-1",
        items: [
          {
            productId: "product-1",
            variantId: null,
            quantity: 2,
            unitPrice: "50.00",
            totalPrice: "100.00",
            priceType: null,
            pricingId: null,
            product: { id: "product-1", name: "Tea", description: null, cost: "20.00" },
            variant: null,
          },
        ],
      });
    });

    it("carries a non-null customerId and a denormalized customer snapshot through to the document", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new SalesRepository(couchDBService as any);

      await service.record(sale({ customerId: "customer-1" }), items(), {
        id: "customer-1",
        name: "Jane Doe",
      });

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.customerId).toBe("customer-1");
      expect(inserted.customer).toEqual({ id: "customer-1", name: "Jane Doe" });
    });

    it("swallows errors and returns false instead of throwing", async () => {
      const couchDBService = {
        getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
      };
      const service = new SalesRepository(couchDBService as any);

      await expect(service.record(sale(), items())).resolves.toBe(false);
    });
  });

  describe("findByTenant", () => {
    it("queries sales for the tenant, sorted by createdAt descending", async () => {
      const docs = [{ _id: "sale-1", type: "sale" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new SalesRepository(couchDBService as any);

      const result = await service.findByTenant("tenant-1");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
      expect(couchDBService.ensureIndex).toHaveBeenCalledWith(
        "medicalconnect_tenant-1",
        "sales_by_tenant_createdAt",
        ["tenantId", "type", "createdAt"]
      );
      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "sale", tenantId: "tenant-1" },
        sort: [{ createdAt: "desc" }],
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
      const service = new SalesRepository(couchDBService as any);

      await service.findByTenant("tenant-1", { limit: 20, offset: 40 });

      expect(db.find).toHaveBeenCalledWith(expect.objectContaining({ limit: 20, skip: 40 }));
    });
  });

  describe("getTodaysSales", () => {
    it("queries sales created since the start of today, exclusive of tomorrow", async () => {
      jest.useFakeTimers().setSystemTime(new Date("2026-08-13T15:30:00.000Z"));
      const expectedStart = new Date();
      expectedStart.setHours(0, 0, 0, 0);
      const expectedEnd = new Date(expectedStart);
      expectedEnd.setDate(expectedEnd.getDate() + 1);
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new SalesRepository(couchDBService as any);

      await service.getTodaysSales("tenant-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({
            type: "sale",
            tenantId: "tenant-1",
            createdAt: {
              $gte: expectedStart.toISOString(),
              $lt: expectedEnd.toISOString(),
            },
          }),
        })
      );
      jest.useRealTimers();
    });
  });

  describe("findByDateRange", () => {
    it("queries sales within an inclusive date range, unbounded by the default page size", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const service = new SalesRepository(couchDBService as any);
      const start = new Date("2026-08-01T00:00:00.000Z");
      const end = new Date("2026-08-13T23:59:59.999Z");

      await service.findByDateRange("tenant-1", start, end);

      expect(db.find).toHaveBeenCalledWith({
        selector: {
          type: "sale",
          tenantId: "tenant-1",
          createdAt: { $gte: start.toISOString(), $lte: end.toISOString() },
        },
        sort: [{ createdAt: "desc" }],
        limit: expect.any(Number),
        skip: 0,
      });
      const call = db.find.mock.calls[0][0];
      expect(call.limit).toBeGreaterThan(100);
    });
  });

  describe("findByProduct", () => {
    it("matches sales that contain an item for the given product, sorted by createdAt descending", async () => {
      const older = { _id: "sale-1", type: "sale", createdAt: "2026-08-01T00:00:00.000Z" };
      const newer = { _id: "sale-2", type: "sale", createdAt: "2026-08-05T00:00:00.000Z" };
      const db = { find: jest.fn().mockResolvedValue({ docs: [older, newer] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new SalesRepository(couchDBService as any);

      const result = await service.findByProduct("product-1", "tenant-1");

      expect(db.find).toHaveBeenCalledWith({
        selector: {
          type: "sale",
          tenantId: "tenant-1",
          items: { $elemMatch: { productId: "product-1" } },
        },
      });
      expect(result).toEqual([newer, older]);
    });
  });

  describe("findByCustomer", () => {
    it("matches sales for the given customer, sorted by createdAt descending", async () => {
      const older = { _id: "sale-1", type: "sale", customerId: "customer-1", createdAt: "2026-08-01T00:00:00.000Z" };
      const newer = { _id: "sale-2", type: "sale", customerId: "customer-1", createdAt: "2026-08-05T00:00:00.000Z" };
      const db = { find: jest.fn().mockResolvedValue({ docs: [older, newer] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new SalesRepository(couchDBService as any);

      const result = await service.findByCustomer("customer-1", "tenant-1");

      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "sale", tenantId: "tenant-1", customerId: "customer-1" },
      });
      expect(result).toEqual([newer, older]);
    });
  });
});
