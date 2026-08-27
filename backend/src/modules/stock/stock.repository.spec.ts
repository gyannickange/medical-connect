import { StockRepository } from "./stock.repository";
import type { StockMovement } from "@shared/schema";

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    id: "movement-1",
    productId: "product-1",
    variantId: null,
    type: "entry",
    quantity: 5,
    previousQuantity: 10,
    newQuantity: 15,
    reason: "restock",
    priceType: null,
    unitPrice: null,
    userId: "user-1",
    tenantId: "tenant-1",
    createdAt: new Date("2026-08-12T10:00:00.000Z"),
    ...overrides,
  } as StockMovement;
}

describe("StockRepository", () => {
  it("derives product and variant quantities from the stock ledger view", async () => {
    const db = {
      view: jest.fn().mockResolvedValue({
        rows: [
          { key: ["product-1", null], value: 7 },
          { key: ["product-1", "variant-1"], value: -2 },
        ],
      }),
    };
    const couchDBService = {
      getDatabase: jest.fn().mockResolvedValue(db),
      ensureDesignDocument: jest.fn().mockResolvedValue(undefined),
    };
    const repository = new StockRepository(couchDBService as any);

    const quantities = await repository.findProjectedQuantities("tenant-1");

    expect(quantities).toEqual({
      "product-1": 7,
      "product-1::variant-1": -2,
    });
    expect(db.view).toHaveBeenCalledWith("stock", "by_product_variant", {
      group: true,
    });
  });

  it("records a movement into the tenant's stock database, keyed by the movement's own id", async () => {
    const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new StockRepository(couchDBService as any);

    const result = await service.record(movement());

    expect(result).toBe(true);
    expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
    const inserted = db.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({
      _id: "stock_movement:movement-1",
      id: "movement-1",
      type: "stock_movement",
      productId: "product-1",
      movementType: "entry",
      quantity: 5,
      previousQuantity: 10,
      newQuantity: 15,
      reason: "restock",
      tenantId: "tenant-1",
    });
  });

  it("records a variant movement with its variantId", async () => {
    const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new StockRepository(couchDBService as any);

    await service.record(movement({ id: "movement-2", variantId: "variant-1" }));

    const inserted = db.insert.mock.calls[0][0];
    expect(inserted.variantId).toBe("variant-1");
  });

  it("persists purchaseId as null when absent and preserves it when present", async () => {
    const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new StockRepository(couchDBService as any);

    await service.record(movement({ id: "movement-null" }));
    await service.record(movement({ id: "movement-with-purchase", purchaseId: "purchase-1" }));

    const [withoutPurchase, withPurchase] = db.insert.mock.calls.map((c) => c[0]);
    expect(withoutPurchase.purchaseId).toBeNull();
    expect(withPurchase.purchaseId).toBe("purchase-1");
  });

  it("swallows errors and returns false instead of throwing", async () => {
    const couchDBService = {
      getDatabase: jest.fn().mockRejectedValue(new Error("CouchDB unreachable")),
    };
    const service = new StockRepository(couchDBService as any);

    await expect(service.record(movement())).resolves.toBe(false);
  });

  describe("findByProduct", () => {
    it("matches movements for the given product, sorted by createdAt descending", async () => {
      const older = { _id: "movement-1", type: "stock_movement", productId: "product-1", createdAt: "2026-08-01T00:00:00.000Z" };
      const newer = { _id: "movement-2", type: "stock_movement", productId: "product-1", createdAt: "2026-08-05T00:00:00.000Z" };
      const db = { find: jest.fn().mockResolvedValue({ docs: [older, newer] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new StockRepository(couchDBService as any);

      const result = await service.findByProduct("product-1", "tenant-1");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("medicalconnect_tenant-1");
      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "stock_movement", tenantId: "tenant-1", productId: "product-1" },
      });
      expect(result).toEqual([newer, older]);
    });
  });

  describe("findByVariant", () => {
    it("matches movements for the given variant, sorted by createdAt descending", async () => {
      const older = { _id: "movement-1", type: "stock_movement", variantId: "variant-1", createdAt: "2026-08-01T00:00:00.000Z" };
      const newer = { _id: "movement-2", type: "stock_movement", variantId: "variant-1", createdAt: "2026-08-05T00:00:00.000Z" };
      const db = { find: jest.fn().mockResolvedValue({ docs: [older, newer] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new StockRepository(couchDBService as any);

      const result = await service.findByVariant("variant-1", "tenant-1");

      expect(db.find).toHaveBeenCalledWith({
        selector: { type: "stock_movement", tenantId: "tenant-1", variantId: "variant-1" },
      });
      expect(result).toEqual([newer, older]);
    });
  });
});
