import { Logger, NotFoundException } from "@nestjs/common";
import { SalesService } from "./sales.service";
import { InsufficientStockException, PriceMismatchException, VariantNotFoundException } from "../../lib/exceptions";

function stubSalesRepository() {
  return {
    findByTenant: jest.fn(),
    getTodaysSales: jest.fn(),
    findByDateRange: jest.fn(),
    findByProduct: jest.fn(),
    findByCustomer: jest.fn(),
    findById: jest.fn().mockResolvedValue(undefined),
    record: jest.fn().mockResolvedValue(true),
  };
}

function stubProductsRepository() {
  return {
    findById: jest.fn(),
    adjustStock: jest.fn(),
  };
}

function stubPricingRepository(price = "10.00") {
  return {
    calculateProductPrice: jest.fn().mockResolvedValue({ price }),
  };
}

function stubCustomersRepository() {
  return {
    findById: jest.fn().mockResolvedValue(undefined),
    upsert: jest.fn().mockResolvedValue(true),
  };
}

function product(overrides: Record<string, unknown> = {}) {
  return {
    _id: "product-1",
    name: "Tea",
    description: null,
    cost: "5.00",
    variants: [],
    ...overrides,
  };
}

describe("SalesService", () => {
  describe("price verification for non-variant items", () => {
    it("rejects a fabricated unit price instead of trusting the client", async () => {
      const pricingRepository = stubPricingRepository("10.00");
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product({ id: "product-1", price: "10.00" })),
      };
      const service = new SalesService(
        pricingRepository as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );

      await expect(
        (service as any).resolveAndVerify(
          { total: 0.1 },
          [{ productId: "product-1", quantity: 1, unitPrice: 0.1, totalPrice: 0.1 }],
          "tenant-1"
        )
      ).rejects.toThrow(PriceMismatchException);
      expect(pricingRepository.calculateProductPrice).toHaveBeenCalledWith(
        "tenant-1",
        "product-1",
        1,
        undefined,
        undefined
      );
    });
  });

  describe("findByTenant", () => {
    it("delegates to SalesRepository", async () => {
      const docs = [{ _id: "sale-1" }];
      const salesRepository = { ...stubSalesRepository(), findByTenant: jest.fn().mockResolvedValue(docs) };
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        stubProductsRepository() as any,
        stubCustomersRepository() as any
      );

      const result = await service.findByTenant("tenant-1", { limit: 20 });

      expect(salesRepository.findByTenant).toHaveBeenCalledWith("tenant-1", { limit: 20 });
      expect(result).toBe(docs);
    });
  });

  describe("getTodaysSales", () => {
    it("sums decimal sale totals and returns a formatted total", async () => {
      const salesRepository = {
        ...stubSalesRepository(),
        getTodaysSales: jest.fn().mockResolvedValue([
          { id: "sale-1", total: "10.50" },
          { id: "sale-2", total: "5.25" },
          { id: "sale-3", total: "0.30" },
        ]),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        stubProductsRepository() as any,
        stubCustomersRepository() as any
      );

      const result = await service.getTodaysSales("tenant-1");

      expect(result.count).toBe(3);
      expect(result.total).toBe("16.05");
      expect(result.sales).toHaveLength(3);
    });

    it("returns a zero total when there are no sales today", async () => {
      const salesRepository = { ...stubSalesRepository(), getTodaysSales: jest.fn().mockResolvedValue([]) };
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        stubProductsRepository() as any,
        stubCustomersRepository() as any
      );

      const result = await service.getTodaysSales("tenant-1");

      expect(result.count).toBe(0);
      expect(result.total).toBe("0.00");
    });
  });

  describe("getSalesReport", () => {
    it("delegates to SalesRepository.findByDateRange", async () => {
      const docs = [{ _id: "sale-1" }];
      const salesRepository = { ...stubSalesRepository(), findByDateRange: jest.fn().mockResolvedValue(docs) };
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        stubProductsRepository() as any,
        stubCustomersRepository() as any
      );
      const start = new Date("2026-08-01T00:00:00.000Z");
      const end = new Date("2026-08-13T23:59:59.999Z");

      const result = await service.getSalesReport("tenant-1", start, end);

      expect(salesRepository.findByDateRange).toHaveBeenCalledWith("tenant-1", start, end);
      expect(result).toBe(docs);
    });
  });

  describe("getSalesByProduct", () => {
    it("delegates to SalesRepository.findByProduct", async () => {
      const docs = [{ _id: "sale-1" }];
      const salesRepository = { ...stubSalesRepository(), findByProduct: jest.fn().mockResolvedValue(docs) };
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        stubProductsRepository() as any,
        stubCustomersRepository() as any
      );

      const result = await service.getSalesByProduct("product-1", "tenant-1");

      expect(salesRepository.findByProduct).toHaveBeenCalledWith("product-1", "tenant-1");
      expect(result).toBe(docs);
    });
  });

  describe("getSalesAnalytics", () => {
    it("groups sales within the range by day, using each item's frozen cost snapshot", async () => {
      const salesRepository = {
        ...stubSalesRepository(),
        findByDateRange: jest.fn().mockResolvedValue([
          {
            createdAt: "2026-08-10T09:00:00.000Z",
            items: [{ quantity: 2, unitPrice: "10.00", product: { cost: "4.00" }, variant: null }],
          },
        ]),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        stubProductsRepository() as any,
        stubCustomersRepository() as any
      );

      const result = await service.getSalesAnalytics("7d", "tenant-1");

      expect(result).toHaveLength(1);
      expect(result[0].sales).toBe(2);
      expect(result[0].revenue).toBe("20.00");
      expect(result[0].cost).toBe("8.00");
    });
  });

  describe("create", () => {
    function saleInput(overrides: Record<string, unknown> = {}) {
      return {
        userId: "user-1",
        tenantId: "tenant-1",
        total: 20,
        paymentMethod: "cash",
        ...overrides,
      } as any;
    }

    const basicItems = [
      { productId: "product-1", quantity: 2, unitPrice: 10, totalPrice: 20 },
    ] as any;

    it("resolves the product, decrements stock, and persists the sale document", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 8 }),
      };
      const salesRepository = stubSalesRepository();
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );

      const sale = await service.create(saleInput(), basicItems);

      expect(productsRepository.findById).toHaveBeenCalledWith("product-1", "tenant-1");
      expect(productsRepository.adjustStock).toHaveBeenCalledWith("product-1", "tenant-1", -2, null);
      expect(sale.subtotal).toBe("20.00");
      expect(sale.total).toBe("20.00");
      expect(sale.tenantId).toBe("tenant-1");
      expect(salesRepository.record).toHaveBeenCalledWith(
        expect.objectContaining({ id: sale.id }),
        [
          expect.objectContaining({
            productId: "product-1",
            quantity: 2,
            unitPrice: "10.00",
            totalPrice: "20.00",
            product: { id: "product-1", name: "Tea", description: null, cost: "5.00" },
            variant: null,
          }),
        ],
        null,
        [expect.objectContaining({ productId: "product-1", quantity: 2 })]
      );
    });

    it("uses a client-supplied id when provided", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 8 }),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );

      const sale = await service.create(saleInput({ id: "sale-fixed-id" }), basicItems);

      expect(sale.id).toBe("sale-fixed-id");
    });

    it("throws NotFoundException when a referenced product doesn't exist, without touching stock", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(undefined),
        adjustStock: jest.fn(),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );

      await expect(service.create(saleInput(), basicItems)).rejects.toThrow(NotFoundException);
      expect(productsRepository.adjustStock).not.toHaveBeenCalled();
    });

    it("throws VariantNotFoundException when the item's variant isn't on the product", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product({ variants: [] })),
        adjustStock: jest.fn(),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );
      const items = [
        { productId: "product-1", variantId: "variant-1", quantity: 1, unitPrice: 10, totalPrice: 10 },
      ] as any;

      await expect(service.create(saleInput(), items)).rejects.toThrow(VariantNotFoundException);
    });

    it("resolves the authoritative variant price via calculateProductPrice", async () => {
      const storage = {
        calculateProductPrice: jest.fn().mockResolvedValue({ price: "9.00" }),
      };
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(
          product({ variants: [{ id: "variant-1", sku: "S", attributes: [], price: "10.00", cost: "6.00" }] })
        ),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 5, newQuantity: 4 }),
      };
      const salesRepository = stubSalesRepository();
      const service = new SalesService(
        storage as any,
        salesRepository as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );
      const items = [
        { productId: "product-1", variantId: "variant-1", quantity: 1, unitPrice: 10, totalPrice: 10 },
      ] as any;

      const sale = await service.create(saleInput({ total: 9 }), items);

      expect(storage.calculateProductPrice).toHaveBeenCalledWith(
        "tenant-1",
        "product-1",
        1,
        "variant-1",
        undefined
      );
      expect(sale.total).toBe("9.00");
      expect(salesRepository.record).toHaveBeenCalledWith(
        expect.anything(),
        [expect.objectContaining({ unitPrice: "9.00", variant: expect.objectContaining({ id: "variant-1" }) })],
        null,
        [expect.objectContaining({ productId: "product-1", quantity: 1 })]
      );
    });

    it("throws PriceMismatchException when the client total doesn't match the server-computed total", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn(),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );

      await expect(
        service.create(saleInput({ total: 999 }), basicItems)
      ).rejects.toThrow(PriceMismatchException);
      expect(productsRepository.adjustStock).not.toHaveBeenCalled();
    });

    it("rolls back already-decremented items when a later item's stock decrement fails", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest
          .fn()
          .mockResolvedValueOnce({ previousQuantity: 10, newQuantity: 8 })
          .mockRejectedValueOnce(new InsufficientStockException("product-2", 1, 0))
          .mockResolvedValueOnce({ previousQuantity: 8, newQuantity: 10 }),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );
      const items = [
        { productId: "product-1", quantity: 2, unitPrice: 10, totalPrice: 20 },
        { productId: "product-2", quantity: 1, unitPrice: 10, totalPrice: 10 },
      ] as any;

      await expect(
        service.create(saleInput({ total: 30 }), items)
      ).rejects.toThrow(InsufficientStockException);

      expect(productsRepository.adjustStock).toHaveBeenNthCalledWith(3, "product-1", "tenant-1", 2, null);
    });

    it("logs an error instead of silently swallowing it when the rollback compensation itself fails", async () => {
      const rollbackError = new Error("CouchDB unreachable during rollback");
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest
          .fn()
          .mockResolvedValueOnce({ previousQuantity: 10, newQuantity: 8 })
          .mockRejectedValueOnce(new InsufficientStockException("product-2", 1, 0))
          .mockRejectedValueOnce(rollbackError),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );
      const items = [
        { productId: "product-1", quantity: 2, unitPrice: 10, totalPrice: 20 },
        { productId: "product-2", quantity: 1, unitPrice: 10, totalPrice: 10 },
      ] as any;
      const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

      await expect(
        service.create(saleInput({ total: 30 }), items)
      ).rejects.toThrow(InsufficientStockException);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("product-1"),
        expect.anything()
      );
      errorSpy.mockRestore();
    });

    it("rolls back stock and throws when persisting the sale document itself fails", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 8 }),
      };
      const salesRepository = { ...stubSalesRepository(), record: jest.fn().mockResolvedValue(false) };
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );

      await expect(service.create(saleInput(), basicItems)).rejects.toThrow();

      expect(productsRepository.adjustStock).toHaveBeenNthCalledWith(2, "product-1", "tenant-1", 2, null);
    });

    it("stores stock effects on the immutable sale document", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 8 }),
      };
      const stockRepository = { recordRequired: jest.fn().mockResolvedValue(undefined) };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any,
        stockRepository as any
      );

      await service.create(saleInput(), basicItems);
      await new Promise((resolve) => setImmediate(resolve));

      expect(stockRepository.recordRequired).not.toHaveBeenCalled();
      expect((service as any).salesRepository.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        null,
        [expect.objectContaining({ productId: "product-1", quantity: 2 })]
      );
    });

    it("still creates the sale when no StockRepository is configured", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 8 }),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        stubCustomersRepository() as any,
        undefined
      );

      await expect(service.create(saleInput(), basicItems)).resolves.toMatchObject({
        total: "20.00",
      });
    });

    it("freezes a customer name snapshot resolved from CustomersRepository", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 8 }),
      };
      const customersRepository = {
        findById: jest.fn().mockResolvedValue({
          _id: "customer:customer-1",
          id: "customer-1",
          firstName: "Jane",
          lastName: "Doe",
        }),
        upsert: jest.fn().mockResolvedValue(true),
      };
      const salesRepository = stubSalesRepository();
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        productsRepository as any,
        customersRepository as any
      );

      await service.create(saleInput({ customerId: "customer-1" }), basicItems);

      expect(customersRepository.findById).toHaveBeenCalledWith("customer-1", "tenant-1");
      expect(salesRepository.record).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { id: "customer-1", name: "Jane Doe" },
        [expect.objectContaining({ productId: "product-1", quantity: 2 })]
      );
    });

    it("returns an existing offline operation without decrementing stock again", async () => {
      const existing = { id: "sale-fixed-id", tenantId: "tenant-1", total: "20.00" };
      const salesRepository = {
        ...stubSalesRepository(),
        findById: jest.fn().mockResolvedValue(existing),
      };
      const productsRepository = stubProductsRepository();
      const service = new SalesService(
        stubPricingRepository() as any,
        salesRepository as any,
        productsRepository as any,
        stubCustomersRepository() as any
      );

      await expect(
        service.create(saleInput({ id: "sale-fixed-id" }), basicItems)
      ).resolves.toBe(existing);
      expect(productsRepository.adjustStock).not.toHaveBeenCalled();
      expect(salesRepository.record).not.toHaveBeenCalled();
    });

    it("does not maintain a mutable customer purchase total outside the sales ledger", async () => {
      const productsRepository = {
        findById: jest.fn().mockResolvedValue(product()),
        adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 8 }),
      };
      const customersRepository = {
        findById: jest.fn().mockResolvedValue(undefined),
        upsert: jest.fn().mockResolvedValue(true),
      };
      const service = new SalesService(
        stubPricingRepository() as any,
        stubSalesRepository() as any,
        productsRepository as any,
        customersRepository as any
      );

      await service.create(saleInput({ customerId: "customer-1" }), basicItems);
      expect(customersRepository.upsert).not.toHaveBeenCalled();
    });
  });
});
