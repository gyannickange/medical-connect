import { TenantsService } from "./tenants.service";

describe("TenantsService.findAll", () => {
  it("returns every tenant for a platform_admin", async () => {
    const tenants = [{ id: "t1" }, { id: "t2" }];
    const tenantsRepository = {
      findAll: jest.fn().mockResolvedValue(tenants),
      findById: jest.fn(),
    };
    const servicesRepository = { seedDefaults: jest.fn() };
    const service = new TenantsService(tenantsRepository as any, servicesRepository as any);

    const result = await service.findAll({
      id: "u1",
      username: "root",
      tenantId: null,
      role: "platform_admin",
    } as any);

    expect(result).toBe(tenants);
    expect(tenantsRepository.findById).not.toHaveBeenCalled();
  });

  it("returns only the caller's own tenant for a tenant-scoped role", async () => {
    const ownTenant = { id: "tenant-1", name: "Clinique" };
    const tenantsRepository = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(ownTenant),
    };
    const servicesRepository = { seedDefaults: jest.fn() };
    const service = new TenantsService(tenantsRepository as any, servicesRepository as any);

    const result = await service.findAll({
      id: "u2",
      username: "clinic-admin",
      tenantId: "tenant-1",
      role: "admin",
    } as any);

    expect(result).toEqual([ownTenant]);
    expect(tenantsRepository.findAll).not.toHaveBeenCalled();
  });
});

describe("TenantsService.create", () => {
  it("seeds default services for the new tenant", async () => {
    const tenant = { id: "tenant-2", name: "Nouvelle clinique" };
    const tenantsRepository = {
      create: jest.fn().mockResolvedValue({ tenant, provisioningSecret: "SECRET" }),
    };
    const servicesRepository = { seedDefaults: jest.fn().mockResolvedValue(undefined) };
    const service = new TenantsService(tenantsRepository as any, servicesRepository as any);

    await service.create({ name: "Nouvelle clinique" });

    expect(servicesRepository.seedDefaults).toHaveBeenCalledWith("tenant-2");
  });
});
