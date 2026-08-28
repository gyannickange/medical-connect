import * as bcrypt from "bcrypt";
import { ForbiddenException } from "@nestjs/common";
import { AuthService } from "./auth.service";

describe("AuthService login", () => {
  const tenant = {
    id: "tenant-1",
    name: "Store",
  };

  const makeUser = (password: string) => ({
    id: "user-1",
    username: "cashier",
    password,
    firstName: "Casey",
    lastName: "Cashier",
    email: "casey@example.com",
    role: "cashier",
    tenantId: "tenant-1",
    isActive: true,
    createdAt: new Date(),
  });

  it("logs in with a bcrypt password without rewriting it", async () => {
    const passwordHash = await bcrypt.hash("secret123", 10);
    const storage = {
      findByUsername: jest.fn().mockResolvedValue(makeUser(passwordHash)),
      update: jest.fn(),
    };
    const tenants = { findById: jest.fn().mockResolvedValue(tenant) };
    const jwt = { sign: jest.fn().mockReturnValue("token") };
    const service = new AuthService(storage as any, tenants as any, jwt as any);

    await expect(service.login(" Cashier ", "secret123")).resolves.toEqual(
      expect.objectContaining({ access_token: "token" })
    );
    expect(storage.update).not.toHaveBeenCalled();
  });

  it("upgrades a valid legacy plaintext password after login", async () => {
    const storage = {
      findByUsername: jest.fn().mockResolvedValue(makeUser("legacy-secret")),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const tenants = { findById: jest.fn().mockResolvedValue(tenant) };
    const jwt = { sign: jest.fn().mockReturnValue("token") };
    const service = new AuthService(storage as any, tenants as any, jwt as any);

    await service.login("cashier", "legacy-secret");

    expect(storage.update).toHaveBeenCalledWith("user-1", "tenant-1", {
      password: expect.not.stringMatching(/^legacy-secret$/),
    });
    const upgradedPassword = storage.update.mock.calls[0][2].password;
    await expect(
      bcrypt.compare("legacy-secret", upgradedPassword)
    ).resolves.toBe(true);
  });
});

describe("register", () => {
  function repos(overrides: { existingUsersCount?: number } = {}) {
    const usersRepository = {
      findByUsername: jest.fn().mockResolvedValue(undefined),
      findByTenant: jest.fn().mockResolvedValue(new Array(overrides.existingUsersCount ?? 0).fill({ id: "u" })),
      create: jest.fn().mockResolvedValue({ id: "new-user", tenantId: "tenant-1", role: "cashier" }),
    };
    const tenantsRepository = { findById: jest.fn().mockResolvedValue({ id: "tenant-1", name: "Clinic" }) };
    return { usersRepository, tenantsRepository };
  }

  it("allows open registration when the target tenant has zero users", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 0 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newadmin", "password1", "New", "Admin", "tenant-1", undefined, "admin", null)
    ).resolves.toBeDefined();
  });

  it("rejects an unauthenticated caller when the target tenant already has users", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newadmin", "password1", "New", "Admin", "tenant-1", undefined, "admin", null)
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects a caller from a different tenant even if they are admin somewhere", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newadmin", "password1", "New", "Admin", "tenant-1", undefined, "admin", {
        userId: "u2",
        tenantId: "tenant-2",
        role: "admin",
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects a non-admin/manager caller from the correct tenant", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newuser", "password1", "New", "User", "tenant-1", undefined, "cashier", {
        userId: "u2",
        tenantId: "tenant-1",
        role: "medecin",
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows an admin of the correct tenant to register a new user", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newuser", "password1", "New", "User", "tenant-1", undefined, "cashier", {
        userId: "u2",
        tenantId: "tenant-1",
        role: "admin",
      })
    ).resolves.toBeDefined();
  });
});
