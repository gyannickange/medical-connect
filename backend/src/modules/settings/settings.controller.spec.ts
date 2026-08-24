import { ForbiddenException } from "@nestjs/common";
import { SettingsController } from "./settings.controller";

describe("SettingsController tenant scope", () => {
  const request = { user: { tenantId: "tenant-1" } };

  it("uses the authenticated tenant for every settings operation", async () => {
    const service = {
      findByTenant: jest.fn().mockResolvedValue([]),
      findByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      updateByKey: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new SettingsController(service as any);

    await controller.findByTenant("tenant-1", request);
    await controller.findByKey("currency", "tenant-1", request);
    await controller.create(
      { tenantId: "tenant-1", key: "currency", value: "XOF" } as any,
      request
    );
    await controller.update("setting-1", { value: "EUR" }, request);
    await controller.updateByKey("currency", "tenant-1", { value: "EUR" }, request);
    await controller.delete("setting-1", request);

    expect(service.findByTenant).toHaveBeenCalledWith("tenant-1");
    expect(service.findByKey).toHaveBeenCalledWith("currency", "tenant-1");
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ key: "currency" }),
      "tenant-1"
    );
    expect(service.update).toHaveBeenCalledWith("setting-1", "tenant-1", {
      value: "EUR",
    });
    expect(service.updateByKey).toHaveBeenCalledWith(
      "currency",
      "tenant-1",
      { value: "EUR" }
    );
    expect(service.delete).toHaveBeenCalledWith("setting-1", "tenant-1");
  });

  it("rejects a legacy tenantId that differs from the JWT tenant", async () => {
    const controller = new SettingsController({} as any);

    await expect(
      controller.findByTenant("tenant-2", request)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.create(
        { tenantId: "tenant-2", key: "currency", value: "EUR" } as any,
        request
      )
    ).rejects.toThrow(ForbiddenException);
  });
});
