import { ForbiddenException } from "@nestjs/common";
import { ProductsController } from "./products.controller";

describe("ProductsController tenant scope", () => {
  const request = { user: { tenantId: "tenant-1", userId: "user-1" } };

  it("forces the authenticated tenant on product creation", async () => {
    const service = { create: jest.fn().mockResolvedValue({}) };
    const controller = new ProductsController(service as any, {} as any, {} as any);

    await controller.create(
      { tenantId: "tenant-1", name: "Tea", price: 10, cost: 5 } as any,
      request
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", name: "Tea" })
    );
  });

  it("rejects body and route tenants that differ from the JWT tenant", async () => {
    const controller = new ProductsController({} as any, {} as any, {} as any);

    await expect(
      controller.create(
        { tenantId: "tenant-2", name: "Tea", price: 10, cost: 5 } as any,
        request
      )
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.findByTenant("tenant-2", undefined, undefined, undefined, request)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.findByBarcode("tenant-2", "ABC", request)
    ).rejects.toThrow(ForbiddenException);
  });
});
