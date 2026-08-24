import { ForbiddenException } from "@nestjs/common";
import { StockController } from "./stock.controller";

describe("StockController tenant scope", () => {
  const request = { user: { tenantId: "tenant-1", userId: "user-jwt" } };

  it("uses JWT tenant and user for stock mutations", async () => {
    const service = {
      stockEntry: jest.fn().mockResolvedValue({}),
      stockExit: jest.fn().mockResolvedValue({}),
      variantStockEntry: jest.fn().mockResolvedValue({}),
    };
    const controller = new StockController(service as any);

    await controller.entry(
      "product-1",
      { quantity: 5, reason: "restock", tenantId: "tenant-1", userId: "legacy" } as any,
      request
    );
    await controller.variantEntry(
      "variant-1",
      { quantity: 2, productId: "product-1", tenantId: "tenant-1", userId: "legacy" },
      request
    );

    expect(service.stockEntry).toHaveBeenCalledWith(
      "product-1",
      5,
      "restock",
      "user-jwt",
      "tenant-1"
    );
    expect(service.variantStockEntry).toHaveBeenCalledWith(
      "variant-1",
      2,
      undefined,
      "user-jwt",
      "tenant-1",
      "product-1"
    );
  });

  it("rejects a legacy tenant different from the JWT tenant", async () => {
    const controller = new StockController({} as any);
    await expect(
      controller.entry(
        "product-1",
        { quantity: 1, tenantId: "tenant-2", userId: "user-1" } as any,
        request
      )
    ).rejects.toThrow(ForbiddenException);
  });
});
