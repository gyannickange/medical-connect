import { StockService } from "./stock.service";

function repositories() {
  const stockRepository = {
    recordRequired: jest.fn().mockResolvedValue(undefined),
    findByProduct: jest.fn().mockResolvedValue([]),
    findByVariant: jest.fn().mockResolvedValue([]),
    findProjectedQuantities: jest.fn().mockResolvedValue({}),
  };
  const productsRepository = {
    adjustStock: jest.fn().mockResolvedValue({ previousQuantity: 10, newQuantity: 15 }),
    findById: jest.fn().mockResolvedValue({
      _id: "product-1",
      tenantId: "tenant-1",
      stocks: { quantity: 15, reservedQuantity: 2, lastUpdated: "2026-08-13T10:00:00.000Z" },
      variants: [{ id: "variant-1", productId: "product-1", tenantId: "tenant-1", quantity: 8 }],
    }),
    findWithStock: jest.fn().mockResolvedValue([]),
    findLowStock: jest.fn().mockResolvedValue([]),
  };
  return { stockRepository, productsRepository };
}

describe("StockService CouchDB ledger", () => {
  it("uses the ledger projection instead of the product stock cache", async () => {
    const { stockRepository, productsRepository } = repositories();
    stockRepository.findProjectedQuantities.mockResolvedValue({
      "product-1": 7,
      "product-1::variant-1": -2,
    });
    productsRepository.findWithStock.mockResolvedValue([
      {
        id: "product-1",
        productId: "product-1",
        quantity: 99,
        product: {
          id: "product-1",
          minStockAlert: 5,
          variants: [{ id: "variant-1", quantity: 99 }],
        },
      },
    ]);
    const service = new StockService(stockRepository as any, productsRepository as any);

    const result = await service.findByTenant("tenant-1");

    expect(result[0]).toMatchObject({ quantity: 7 });
    expect(result[0].product.variants[0]).toMatchObject({ quantity: -2 });
  });

  it("detects low stock from the ledger projection rather than the cache", async () => {
    const { stockRepository, productsRepository } = repositories();
    stockRepository.findProjectedQuantities.mockResolvedValue({
      "product-low": 2,
      "product-high": 20,
    });
    productsRepository.findWithStock.mockResolvedValue([
      {
        id: "product-low",
        productId: "product-low",
        quantity: 99,
        product: { id: "product-low", minStockAlert: 5, variants: [] },
      },
      {
        id: "product-high",
        productId: "product-high",
        quantity: 1,
        product: { id: "product-high", minStockAlert: 5, variants: [] },
      },
    ]);
    const service = new StockService(stockRepository as any, productsRepository as any);

    const result = await service.findLowStock("tenant-1", { limit: 10 });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ productId: "product-low", quantity: 2 });
  });

  it("delegates stock reads and movement reads to repositories", async () => {
    const { stockRepository, productsRepository } = repositories();
    const service = new StockService(stockRepository as any, productsRepository as any);

    await service.findByTenant("tenant-1", { limit: 20 });
    await service.findLowStock("tenant-1", { limit: 10 });
    await service.getMovementsByProduct("product-1", "tenant-1");
    await service.getMovementsByVariant("variant-1", "tenant-1");

    expect(productsRepository.findWithStock).toHaveBeenCalledWith("tenant-1", { limit: 20 });
    expect(productsRepository.findWithStock).toHaveBeenCalledWith("tenant-1", {
      limit: 100_000,
      offset: 0,
    });
    expect(stockRepository.findProjectedQuantities).toHaveBeenCalledWith("tenant-1");
    expect(stockRepository.findByProduct).toHaveBeenCalledWith("product-1", "tenant-1");
    expect(stockRepository.findByVariant).toHaveBeenCalledWith("variant-1", "tenant-1");
  });

  it("applies a product entry and awaits its immutable movement", async () => {
    const { stockRepository, productsRepository } = repositories();
    const service = new StockService(stockRepository as any, productsRepository as any);

    const result = await service.stockEntry(
      "product-1",
      5,
      "restock",
      "user-1",
      "tenant-1"
    );

    expect(productsRepository.adjustStock).toHaveBeenCalledWith(
      "product-1",
      "tenant-1",
      5,
      null
    );
    expect(stockRepository.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        type: "entry",
        quantity: 5,
        previousQuantity: 10,
        newQuantity: 15,
        tenantId: "tenant-1",
      })
    );
    expect(result).toMatchObject({ productId: "product-1", quantity: 15 });
  });

  it("applies a product exit as a signed CouchDB adjustment", async () => {
    const { stockRepository, productsRepository } = repositories();
    productsRepository.adjustStock.mockResolvedValue({ previousQuantity: 10, newQuantity: 7 });
    productsRepository.findById.mockResolvedValue({
      _id: "product-1",
      stocks: { quantity: 7, reservedQuantity: 0, lastUpdated: "2026-08-13T10:00:00.000Z" },
    });
    const service = new StockService(stockRepository as any, productsRepository as any);

    await service.stockExit("product-1", 3, "sale", "user-1", "tenant-1");

    expect(productsRepository.adjustStock).toHaveBeenCalledWith(
      "product-1",
      "tenant-1",
      -3,
      null
    );
    expect(stockRepository.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({ type: "exit", previousQuantity: 10, newQuantity: 7 })
    );
  });

  it("adjusts embedded variant stock and returns the updated variant", async () => {
    const { stockRepository, productsRepository } = repositories();
    productsRepository.adjustStock.mockResolvedValue({ previousQuantity: 5, newQuantity: 8 });
    const service = new StockService(stockRepository as any, productsRepository as any);

    const result = await service.variantStockEntry(
      "variant-1",
      3,
      "restock",
      "user-1",
      "tenant-1",
      "product-1"
    );

    expect(productsRepository.adjustStock).toHaveBeenCalledWith(
      "product-1",
      "tenant-1",
      3,
      "variant-1"
    );
    expect(stockRepository.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: "variant-1", type: "entry" })
    );
    expect(result).toMatchObject({ id: "variant-1", quantity: 8 });
  });
});
