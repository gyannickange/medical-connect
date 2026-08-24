import * as bcrypt from "bcrypt";
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
