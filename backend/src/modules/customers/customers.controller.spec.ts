import { ForbiddenException } from "@nestjs/common";
import { CustomersController } from "./customers.controller";

describe("CustomersController tenant scope", () => {
  const request = { user: { tenantId: "tenant-1" } };

  it("uses the authenticated tenant for every operation", async () => {
    const service = {
      findByTenant: jest.fn().mockResolvedValue([]),
      search: jest.fn().mockResolvedValue([]),
      getPurchases: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const controller = new CustomersController(service as any);

    await controller.findByTenant("tenant-1", undefined, undefined, undefined, request);
    await controller.search("tenant-1", "Jane", undefined, undefined, undefined, request);
    await controller.getPurchases("customer-1", request);
    await controller.create(
      { tenantId: "tenant-1", firstName: "Jane", lastName: "Doe" } as any,
      request
    );
    await controller.update("customer-1", { firstName: "Janet" }, request);
    await controller.delete("customer-1", request);

    expect(service.findByTenant).toHaveBeenCalledWith("tenant-1", expect.any(Object));
    expect(service.search).toHaveBeenCalledWith("Jane", "tenant-1", expect.any(Object));
    expect(service.getPurchases).toHaveBeenCalledWith("customer-1", "tenant-1");
    expect(service.update).toHaveBeenCalledWith("customer-1", "tenant-1", {
      firstName: "Janet",
    });
    expect(service.delete).toHaveBeenCalledWith("customer-1", "tenant-1");
  });

  it("rejects a legacy tenant different from the JWT tenant", async () => {
    const controller = new CustomersController({} as any);

    await expect(
      controller.findByTenant("tenant-2", undefined, undefined, undefined, request)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.create(
        { tenantId: "tenant-2", firstName: "Jane", lastName: "Doe" } as any,
        request
      )
    ).rejects.toThrow(ForbiddenException);
  });
});
