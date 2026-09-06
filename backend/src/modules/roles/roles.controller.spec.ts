import { ForbiddenException } from "@nestjs/common";
import { RolesController } from "./roles.controller";

describe("RolesController", () => {
  function req(tenantId = "tenant-1", role = "admin") {
    return { user: { tenantId, role } };
  }

  it("findByTenant scopes to the authenticated tenant", async () => {
    const rolesService = { findByTenant: jest.fn().mockResolvedValue([]) };
    const controller = new RolesController(rolesService as any);

    await controller.findByTenant("tenant-1", req());

    expect(rolesService.findByTenant).toHaveBeenCalledWith("tenant-1");
  });

  it("rejects a tenantId param that does not match the authenticated user", async () => {
    const controller = new RolesController({ findByTenant: jest.fn() } as any);

    await expect(controller.findByTenant("tenant-2", req("tenant-1"))).rejects.toThrow(ForbiddenException);
  });

  it("findById returns the role detail", async () => {
    const rolesService = { findById: jest.fn().mockResolvedValue({ id: "medecin" }) };
    const controller = new RolesController(rolesService as any);

    await controller.findById("medecin", req());

    expect(rolesService.findById).toHaveBeenCalledWith("medecin", "tenant-1");
  });

  it("findMine resolves the caller's own tenant and role from the request, never a param", async () => {
    const rolesService = { findMine: jest.fn().mockResolvedValue({ patients: { view: true } }) };
    const controller = new RolesController(rolesService as any);

    await controller.findMine(req("tenant-1", "medecin"));

    expect(rolesService.findMine).toHaveBeenCalledWith("tenant-1", "medecin");
  });

  it("create forces tenantId from the authenticated user", async () => {
    const rolesService = { create: jest.fn().mockResolvedValue({ id: "custom-1" }) };
    const controller = new RolesController(rolesService as any);

    await controller.create({ name: "Agent admission", permissions: {} as any } as any, req());

    expect(rolesService.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1" }));
  });

  it("update scopes to the authenticated tenant", async () => {
    const rolesService = { update: jest.fn().mockResolvedValue({ id: "medecin" }) };
    const controller = new RolesController(rolesService as any);

    await controller.update("medecin", { name: "Médecin senior" } as any, req());

    expect(rolesService.update).toHaveBeenCalledWith("medecin", "tenant-1", { name: "Médecin senior" });
  });

  it("delete scopes to the authenticated tenant", async () => {
    const rolesService = { delete: jest.fn().mockResolvedValue(undefined) };
    const controller = new RolesController(rolesService as any);

    await controller.delete("custom-1", req());

    expect(rolesService.delete).toHaveBeenCalledWith("custom-1", "tenant-1");
  });
});
