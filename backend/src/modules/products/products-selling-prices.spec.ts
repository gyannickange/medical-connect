import { ProductsService } from "./products.service";

describe("ProductsService selling prices", () => {
  const tenantId = "tenant-a";

  function setup() {
    const entry = { id: "sp-1", variantId: null, price: "12.00", createdByUserId: "user-1" };
    const embedded = {
      getSellingPrices: jest.fn().mockResolvedValue([entry]),
      addSellingPrice: jest.fn().mockResolvedValue(entry),
    };
    const products = {};
    return {
      service: new ProductsService(embedded as any, products as any),
      embedded,
      entry,
    };
  }

  it("delegates read to the repository with the requested variantId", async () => {
    const { service, embedded } = setup();
    await service.getSellingPrices("product-1", tenantId, "variant-1");
    expect(embedded.getSellingPrices).toHaveBeenCalledWith("product-1", tenantId, "variant-1");
  });

  it("defaults the read variantId to null when omitted", async () => {
    const { service, embedded } = setup();
    await service.getSellingPrices("product-1", tenantId);
    expect(embedded.getSellingPrices).toHaveBeenCalledWith("product-1", tenantId, null);
  });

  it("stamps the authenticated user as createdByUserId when adding an entry", async () => {
    const { service, embedded } = setup();
    await service.addSellingPrice(
      "product-1",
      tenantId,
      { price: 12 } as any,
      "user-42"
    );
    expect(embedded.addSellingPrice).toHaveBeenCalledWith("product-1", tenantId, {
      price: 12,
      createdByUserId: "user-42",
    });
  });
});
