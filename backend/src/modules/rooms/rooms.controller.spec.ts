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

  it("assign scopes to the authenticated tenant", async () => {
    const roomsService = { assign: jest.fn().mockResolvedValue({ id: "room-1" }) };
    const controller = new RoomsController(roomsService as any);

    await controller.assign("room-1", { patientId: "patient-1", consultationId: "c-1" } as any, req());

    expect(roomsService.assign).toHaveBeenCalledWith("room-1", "tenant-1", { patientId: "patient-1", consultationId: "c-1" });
  });

  it("release scopes to the authenticated tenant", async () => {
    const roomsService = { release: jest.fn().mockResolvedValue({ id: "room-1" }) };
    const controller = new RoomsController(roomsService as any);

    await controller.release("room-1", { consultationId: "c-1" } as any, req());

    expect(roomsService.release).toHaveBeenCalledWith("room-1", "tenant-1", "c-1");
  });

  it("findPendingHospitalisations scopes to the authenticated tenant", async () => {
    const roomsService = { findPendingHospitalisations: jest.fn().mockResolvedValue([]) };
    const controller = new RoomsController(roomsService as any);

    await controller.findPendingHospitalisations("tenant-1", req());

    expect(roomsService.findPendingHospitalisations).toHaveBeenCalledWith("tenant-1");
  });

  it("findPendingHospitalisations rejects a tenantId param that does not match the authenticated user", async () => {
    const controller = new RoomsController({ findPendingHospitalisations: jest.fn() } as any);

    await expect(controller.findPendingHospitalisations("tenant-2", req("tenant-1"))).rejects.toThrow(ForbiddenException);
  });
});
