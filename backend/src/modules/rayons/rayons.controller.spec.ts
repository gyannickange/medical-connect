import { ForbiddenException } from "@nestjs/common";
import { RayonsController } from "./rayons.controller";

describe("RayonsController tenant scope", () => {
  const request = { user: { tenantId: "tenant-1" } };

  it("uses the authenticated tenant for every operation", async () => {
    const service = {
      findByTenant: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
    };
    const controller = new RayonsController(service as any);

    await controller.findByTenant("tenant-1", undefined, undefined, undefined, request);
    await controller.create({ tenantId: "tenant-1", name: "Boissons" } as any, request);
    await controller.update("rayon-1", { name: "Épicerie" }, request);

    expect(service.findByTenant).toHaveBeenCalledWith("tenant-1", expect.any(Object));
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1" })
    );
    expect(service.update).toHaveBeenCalledWith("rayon-1", "tenant-1", {
      name: "Épicerie",
    });
  });

  it("rejects a legacy tenant different from the JWT tenant", async () => {
    const controller = new RayonsController({} as any);

    await expect(
      controller.findByTenant("tenant-2", undefined, undefined, undefined, request)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.create({ tenantId: "tenant-2", name: "Boissons" } as any, request)
    ).rejects.toThrow(ForbiddenException);
  });
});
