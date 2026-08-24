import { ForbiddenException } from "@nestjs/common";
import { SalesController } from "./sales.controller";

describe("SalesController tenant scope", () => {
  const request = { user: { tenantId: "tenant-1", userId: "user-jwt" } };

  it("forces the JWT identity on sale creation", async () => {
    const service = { create: jest.fn().mockResolvedValue({}) };
    const controller = new SalesController(service as any);

    await controller.create(
      {
        sale: { tenantId: "tenant-1", userId: "legacy", total: 10 },
        items: [],
      } as any,
      request
    );

    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-1", userId: "user-jwt" }),
      []
    );
  });

  it("rejects a body or route tenant different from the JWT tenant", async () => {
    const controller = new SalesController({} as any);
    await expect(
      controller.create(
        { sale: { tenantId: "tenant-2", userId: "legacy", total: 10 }, items: [] } as any,
        request
      )
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.findByTenant("tenant-2", undefined, undefined, undefined, request)
    ).rejects.toThrow(ForbiddenException);
  });
});
