import { ConflictException, NotFoundException } from "@nestjs/common";
import { ProductsService } from "./products.service";

function repositories() {
  const product = {
    _id: "product-1",
    id: "product-1",
    tenantId: "tenant-1",
    name: "Tea",
    price: "10.00",
    cost: "5.00",
    minStockAlert: 10,
    variants: [],
  };
  const embedded = {
    getVariants: jest.fn().mockResolvedValue([]),
    getVariant: jest.fn(),
    createVariant: jest.fn(),
    updateVariant: jest.fn(),
    archiveVariant: jest.fn().mockResolvedValue(undefined),
    getProductAnalytics: jest.fn().mockResolvedValue([]),
    calculateProductPrice: jest.fn().mockResolvedValue({ price: "10.00" }),
    getPricing: jest.fn().mockResolvedValue([]),
    getPricingById: jest.fn(),
    createPricing: jest.fn(),
    updatePricing: jest.fn(),
    deletePricing: jest.fn().mockResolvedValue(undefined),
  };
  const products = {
    findByTenant: jest.fn().mockResolvedValue([]),
    search: jest.fn().mockResolvedValue([]),
    findByBarcode: jest.fn().mockResolvedValue(product),
    findById: jest.fn().mockResolvedValue(product),
    create: jest.fn().mockResolvedValue(product),
    update: jest.fn().mockResolvedValue(product),
    archiveRequired: jest.fn().mockResolvedValue(undefined),
  };
  return { embedded, products, product };
}

describe("ProductsService CouchDB", () => {
  it("delegates catalog reads and writes to ProductsRepository", async () => {
    const { embedded, products, product } = repositories();
    const service = new ProductsService(embedded as any, products as any);

    await service.findByTenant("tenant-1", { limit: 20 });
    await service.search("Tea", "tenant-1");
    await service.findByBarcode("ABC", "tenant-1");
    await service.create({ tenantId: "tenant-1", name: "Tea", price: "10", cost: "5" } as any);
    await service.update("product-1", "tenant-1", { name: "Green tea" });
    await service.delete("product-1", "tenant-1");

    expect(products.create).toHaveBeenCalled();
    expect(products.update).toHaveBeenCalledWith("product-1", "tenant-1", { name: "Green tea" });
    expect(products.archiveRequired).toHaveBeenCalledWith("product-1", "tenant-1");
    expect(await service.findByBarcode("ABC", "tenant-1")).toBe(product);
  });

  it("checks the device lock before an update", async () => {
    const { embedded, products } = repositories();
    const locks = { assertHeldByDevice: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductsService(embedded as any, products as any, locks as any);

    await service.update("product-1", "tenant-1", { name: "New" }, "device-1");

    expect(locks.assertHeldByDevice).toHaveBeenCalledWith(
      "product-1",
      "tenant-1",
      "device-1"
    );
  });

  it("propagates lock conflicts without writing", async () => {
    const { embedded, products } = repositories();
    const locks = {
      assertHeldByDevice: jest.fn().mockRejectedValue(new ConflictException("locked")),
    };
    const service = new ProductsService(embedded as any, products as any, locks as any);

    await expect(
      service.update("product-1", "tenant-1", { name: "New" }, "device-2")
    ).rejects.toThrow(ConflictException);
    expect(products.update).not.toHaveBeenCalled();
  });

  it("creates an embedded variant without duplicating its initial ledger quantity", async () => {
    const { embedded, products } = repositories();
    const variant = { id: "variant-1", productId: "product-1", quantity: 5 };
    embedded.createVariant.mockResolvedValue(variant);
    const stock = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductsService(embedded as any, products as any, undefined, stock as any);

    await expect(
      service.createVariant(
        { productId: "product-1", tenantId: "tenant-1", attributes: [], quantity: 5 } as any,
        "user-1",
        "tenant-1"
      )
    ).resolves.toEqual(variant);

    expect(embedded.createVariant).toHaveBeenCalledWith(
      expect.objectContaining({ productId: "product-1", minStockAlert: 10 }),
      "tenant-1"
    );
    expect(stock.recordRequired).not.toHaveBeenCalled();
  });

  it("delegates embedded variant reads, updates, and archive", async () => {
    const { embedded, products } = repositories();
    embedded.getVariant.mockResolvedValue({ id: "variant-1" });
    embedded.updateVariant.mockResolvedValue({ id: "variant-1", quantity: 3 });
    const service = new ProductsService(embedded as any, products as any);

    await service.getVariants("product-1", "tenant-1");
    await service.getVariant("variant-1", "tenant-1");
    await service.updateVariant("variant-1", "tenant-1", { quantity: 3 } as any);
    await service.deleteVariant("variant-1", "tenant-1");

    expect(embedded.updateVariant).toHaveBeenCalledWith(
      "variant-1",
      "tenant-1",
      { quantity: 3 }
    );
    expect(embedded.archiveVariant).toHaveBeenCalledWith("variant-1", "tenant-1");
  });

  it("records a stock movement when a variant quantity is edited", async () => {
    const { embedded, products } = repositories();
    embedded.getVariant.mockResolvedValue({
      id: "variant-1",
      productId: "product-1",
      quantity: 5,
    });
    embedded.updateVariant.mockResolvedValue({
      id: "variant-1",
      productId: "product-1",
      quantity: 3,
    });
    const stock = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductsService(
      embedded as any,
      products as any,
      undefined,
      stock as any
    );

    await service.updateVariant("variant-1", "tenant-1", { quantity: 3 } as any);

    expect(stock.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        variantId: "variant-1",
        type: "exit",
        quantity: 2,
        previousQuantity: 5,
        newQuantity: 3,
      })
    );
  });

  it("returns not found when a barcode is unknown", async () => {
    const { embedded, products } = repositories();
    products.findByBarcode.mockResolvedValue(undefined);
    const service = new ProductsService(embedded as any, products as any);
    await expect(service.findByBarcode("missing", "tenant-1")).rejects.toThrow(
      NotFoundException
    );
  });
});
