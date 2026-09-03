import { ConflictException } from "@nestjs/common";
import { PlatformService } from "./platform.service";

describe("PlatformService.createTenantWithAdmin", () => {
  const dto = {
    name: "Clinique du Nord",
    adminUsername: "nord-admin",
    adminPassword: "secret123",
    adminFirstName: "Awa",
    adminLastName: "Diop",
  } as any;

  it("creates the tenant via TenantsService (so default services get seeded), then its first admin user", async () => {
    const tenant = { id: "tenant-9", name: dto.name };
    const tenantsService = {
      create: jest.fn().mockResolvedValue({
        tenant,
        provisioningSecret: "AAAA-BBBB-CCCC",
      }),
    };
    const usersRepository = {
      findByUsername: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({
        id: "user-9",
        username: "nord-admin",
        password: "hashed",
        firstName: "Awa",
        lastName: "Diop",
        email: null,
        role: "admin",
        tenantId: "tenant-9",
        isActive: true,
        createdAt: new Date(),
      }),
    };
    const service = new PlatformService(tenantsService as any, usersRepository as any);

    const result = await service.createTenantWithAdmin(dto);

    expect(usersRepository.findByUsername).toHaveBeenCalledWith("nord-admin");
    expect(tenantsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Clinique du Nord" })
    );
    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "admin",
        tenantId: "tenant-9",
        username: "nord-admin",
      })
    );
    expect(result.adminUser).not.toHaveProperty("password");
    expect(result.provisioningSecret).toBe("AAAA-BBBB-CCCC");
  });

  it("rejects a taken username before creating the tenant", async () => {
    const tenantsService = { create: jest.fn() };
    const usersRepository = {
      findByUsername: jest.fn().mockResolvedValue({ id: "existing" }),
      create: jest.fn(),
    };
    const service = new PlatformService(tenantsService as any, usersRepository as any);

    await expect(service.createTenantWithAdmin(dto)).rejects.toThrow(ConflictException);
    expect(tenantsService.create).not.toHaveBeenCalled();
  });
});
