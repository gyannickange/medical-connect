import { ForbiddenException } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";

describe("CategoriesController tenant scope", () => {
  const request = { user: { tenantId: "tenant-1" } };

  it("uses the authenticated tenant for every operation", async () => {
    const service = {
      findByTenant: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new CategoriesController(service as any);

    await controller.findByTenant("tenant-1", undefined, undefined, undefined, request);
    await controller.create({ tenantId: "tenant-1", name: "Food" } as any, request);
    await controller.update("category-1", { name: "Fresh food" }, request);
    await controller.delete("category-1", request);

    expect(service.findByTenant).toHaveBeenCalledWith("tenant-1", expect.any(Object));
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1" })
    );
    expect(service.update).toHaveBeenCalledWith("category-1", "tenant-1", {
      name: "Fresh food",
    });
    expect(service.delete).toHaveBeenCalledWith("category-1", "tenant-1");
  });

  it("rejects a legacy tenant different from the JWT tenant", async () => {
    const controller = new CategoriesController({} as any);

    await expect(
      controller.findByTenant("tenant-2", undefined, undefined, undefined, request)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.create({ tenantId: "tenant-2", name: "Food" } as any, request)
    ).rejects.toThrow(ForbiddenException);
  });
});
