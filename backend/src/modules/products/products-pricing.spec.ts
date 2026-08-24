import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ProductsService } from "./products.service";

describe("ProductsService embedded pricing", () => {
  const tenantId = "tenant-a";
  const product = { _id: "product-a", id: "product-a", tenantId, variants: [] };

  function setup() {
    const rule = {
      id: "pricing-a",
      productId: "product-a",
      tenantId,
      priceType: "bulk",
      price: "10.00",
      minQuantity: 5,
      maxQuantity: 10,
      validFrom: null,
      validTo: null,
      variantId: null,
      isActive: true,
    };
    const embedded = {
      getPricing: jest.fn().mockResolvedValue([rule]),
      getPricingById: jest.fn().mockResolvedValue(rule),
      createPricing: jest.fn().mockImplementation(async (_id, _tenant, data) => data),
      updatePricing: jest.fn().mockImplementation(async (_id, _tenant, data) => ({ ...rule, ...data })),
      deletePricing: jest.fn().mockResolvedValue(undefined),
      calculateProductPrice: jest.fn().mockResolvedValue({ price: "10.00" }),
    };
    const products = { findById: jest.fn().mockResolvedValue(product) };
    return { service: new ProductsService(embedded as any, products as any), embedded, products, rule };
  }

  it("rejects invalid quantity and date ranges", async () => {
    const { service } = setup();
    await expect(
      service.createProductPricing(
        { productId: "product-a", priceType: "bulk" as any, price: 10, minQuantity: 5, maxQuantity: 4 },
        tenantId
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createProductPricing(
        {
          productId: "product-a",
          priceType: "promotional" as any,
          price: 10,
          minQuantity: 1,
          validFrom: new Date("2026-08-08"),
          validTo: new Date("2026-08-07"),
        },
        tenantId
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates ownership and delegates CRUD to embedded pricing rules", async () => {
    const { service, embedded } = setup();
    await service.getProductPricing("product-a", tenantId);
    await service.createProductPricing(
      { productId: "product-a", priceType: "retail" as any, price: 10, minQuantity: 1 },
      tenantId
    );
    await service.updateProductPricing("pricing-a", { maxQuantity: null }, tenantId);
    await service.deleteProductPricing("pricing-a", tenantId);

    expect(embedded.createPricing).toHaveBeenCalled();
    expect(embedded.updatePricing).toHaveBeenCalledWith(
      "pricing-a",
      tenantId,
      { maxQuantity: null }
    );
    expect(embedded.deletePricing).toHaveBeenCalledWith("pricing-a", tenantId);
  });

  it("rejects a missing product", async () => {
    const { service, products } = setup();
    products.findById.mockResolvedValue(undefined);
    await expect(service.getProductPricing("missing", tenantId)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
