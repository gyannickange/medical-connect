import { ForbiddenException } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";

describe("RoomsController", () => {
  function req(tenantId = "tenant-1") {
    return { user: { tenantId } };
  }

  it("findByTenant scopes to the authenticated tenant", async () => {
    const roomsService = { findByTenant: jest.fn().mockResolvedValue([]) };
    const controller = new RoomsController(roomsService as any);

    await controller.findByTenant("tenant-1", req());

    expect(roomsService.findByTenant).toHaveBeenCalledWith("tenant-1");
  });

  it("rejects a tenantId param that does not match the authenticated user", async () => {
    const controller = new RoomsController({ findByTenant: jest.fn() } as any);

    await expect(controller.findByTenant("tenant-2", req("tenant-1"))).rejects.toThrow(ForbiddenException);
  });

  it("create forces tenantId from the authenticated user", async () => {
    const roomsService = { create: jest.fn().mockResolvedValue({ id: "room-1" }) };
    const controller = new RoomsController(roomsService as any);

    await controller.create({ number: "101", type: "Cardiologie", capacity: 2 } as any, req());

    expect(roomsService.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1" }));
  });

  it("update scopes to the authenticated tenant", async () => {
    const roomsService = { update: jest.fn().mockResolvedValue({ id: "room-1" }) };
    const controller = new RoomsController(roomsService as any);

    await controller.update("room-1", { status: "en_maintenance" } as any, req());

    expect(roomsService.update).toHaveBeenCalledWith("room-1", "tenant-1", { status: "en_maintenance" });
  });
});
