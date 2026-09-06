import { ConflictException, ForbiddenException } from "@nestjs/common";
import { RolesService } from "./roles.service";

function role(overrides: Record<string, unknown> = {}) {
  return {
    id: "medecin", tenantId: "t1", name: "Médecin", description: null, isSystemRole: true,
    permissions: { patients: { view: true } }, createdAt: new Date(), updatedAt: new Date(), ...overrides,
  };
}

describe("RolesService", () => {
  describe("findByTenant", () => {
    it("annotates each role with its count of active users", async () => {
      const rolesRepository = { findByTenant: jest.fn().mockResolvedValue([role({ id: "medecin" }), role({ id: "admin", name: "Administrateur" })]) };
      const usersRepository = { findByTenant: jest.fn().mockResolvedValue([
        { id: "u1", role: "medecin", isActive: true },
        { id: "u2", role: "medecin", isActive: true },
        { id: "u3", role: "admin", isActive: true },
        { id: "u4", role: "medecin", isActive: false },
      ]) };
      const service = new RolesService(rolesRepository as any, usersRepository as any);

      const result = await service.findByTenant("t1");

      expect(result.find((r) => r.id === "medecin")?.activeUserCount).toBe(2);
      expect(result.find((r) => r.id === "admin")?.activeUserCount).toBe(1);
    });
  });

  describe("findMine", () => {
    it("returns just the permissions matrix for the given role", async () => {
      const rolesRepository = { findById: jest.fn().mockResolvedValue(role()) };
      const service = new RolesService(rolesRepository as any, {} as any);

      const result = await service.findMine("t1", "medecin");

      expect(result).toEqual({ patients: { view: true } });
      expect(rolesRepository.findById).toHaveBeenCalledWith("medecin", "t1");
    });
  });

  describe("create", () => {
    it("always creates non-system roles regardless of input", async () => {
      const rolesRepository = { create: jest.fn().mockResolvedValue(role({ id: "custom-1", isSystemRole: false })) };
      const service = new RolesService(rolesRepository as any, {} as any);

      await service.create({ name: "Agent admission", permissions: {} as any, tenantId: "t1", isSystemRole: true } as any);

      expect(rolesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ isSystemRole: false }));
    });
  });

  describe("delete", () => {
    it("refuses to delete the admin system role", async () => {
      const service = new RolesService({} as any, {} as any);

      await expect(service.delete("admin", "t1")).rejects.toThrow(ForbiddenException);
    });

    it("refuses to delete a role still assigned to a user", async () => {
      const rolesRepository = { delete: jest.fn() };
      const usersRepository = { findByTenant: jest.fn().mockResolvedValue([{ id: "u1", role: "medecin" }]) };
      const service = new RolesService(rolesRepository as any, usersRepository as any);

      await expect(service.delete("medecin", "t1")).rejects.toThrow(ConflictException);
      expect(rolesRepository.delete).not.toHaveBeenCalled();
    });

    it("deletes a role with no assigned users", async () => {
      const rolesRepository = { delete: jest.fn().mockResolvedValue(undefined) };
      const usersRepository = { findByTenant: jest.fn().mockResolvedValue([]) };
      const service = new RolesService(rolesRepository as any, usersRepository as any);

      await service.delete("custom-1", "t1");

      expect(rolesRepository.delete).toHaveBeenCalledWith("custom-1", "t1");
    });
  });

  describe("seedSystemRoles", () => {
    it("creates all 8 seedable roles with id === role name and isSystemRole true", async () => {
      const rolesRepository = { create: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, createdAt: new Date(), updatedAt: new Date() })) };
      const service = new RolesService(rolesRepository as any, {} as any);

      const result = await service.seedSystemRoles("tenant-9");

      expect(result).toHaveLength(8);
      expect(rolesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ id: "admin", isSystemRole: true, tenantId: "tenant-9" }));
      expect(rolesRepository.create).toHaveBeenCalledWith(expect.objectContaining({ id: "pharmacien", isSystemRole: true, tenantId: "tenant-9" }));
      const adminCall = rolesRepository.create.mock.calls.find((call) => call[0].id === "admin")![0];
      expect(adminCall.permissions.roles.view).toBe(true);
    });
  });
});
