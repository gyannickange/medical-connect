import { StaffService } from "./staff.service";
import * as bcrypt from "bcrypt";

describe("StaffService username uniqueness", () => {
  it("normalizes username on create and update", async () => {
    const stored = {
      id: "user-1",
      username: "alice",
      password: "hash",
      firstName: "Alice",
      lastName: "Admin",
      email: null,
      role: "admin",
      tenantId: "tenant-1",
      isActive: true,
      createdAt: new Date(),
    };
    const storage = {
      create: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockResolvedValue(stored),
    };
    const service = new StaffService(storage as any);

    await service.create({ ...stored, username: "  Alice  " } as any);
    await service.update("user-1", "tenant-1", { username: " ALICE " });

    expect(storage.create).toHaveBeenCalledWith(
      expect.objectContaining({ username: "alice" }),
    );
    expect(storage.update).toHaveBeenCalledWith(
      "user-1",
      "tenant-1",
      expect.objectContaining({ username: "alice" }),
    );
  });

  it("hashes passwords on create and when a new password is provided", async () => {
    const stored = {
      id: "user-1",
      username: "alice",
      password: "stored-hash",
      firstName: "Alice",
      lastName: "Admin",
      email: "alice@example.com",
      role: "admin",
      tenantId: "tenant-1",
      isActive: true,
      createdAt: new Date(),
    };
    const storage = {
      create: jest.fn().mockResolvedValue(stored),
      update: jest.fn().mockResolvedValue(stored),
    };
    const service = new StaffService(storage as any);

    await service.create({ ...stored, password: "create-secret" } as any);
    await service.update("user-1", "tenant-1", { password: "updated-secret" });

    const createdPassword = storage.create.mock.calls[0][0].password;
    const updatedPassword = storage.update.mock.calls[0][2].password;
    expect(createdPassword).not.toBe("create-secret");
    expect(updatedPassword).not.toBe("updated-secret");
    await expect(bcrypt.compare("create-secret", createdPassword)).resolves.toBe(
      true
    );
    await expect(
      bcrypt.compare("updated-secret", updatedPassword)
    ).resolves.toBe(true);
  });

  it("does not overwrite the password when an update omits it", async () => {
    const stored = {
      id: "user-1",
      username: "alice",
      password: "stored-hash",
      firstName: "Alice",
      lastName: "Admin",
      email: null,
      role: "admin",
      tenantId: "tenant-1",
      isActive: true,
      createdAt: new Date(),
    };
    const storage = {
      update: jest.fn().mockResolvedValue(stored),
    };
    const service = new StaffService(storage as any);

    await service.update("user-1", "tenant-1", { firstName: "Alicia" });

    expect(storage.update).toHaveBeenCalledWith("user-1", "tenant-1", {
      firstName: "Alicia",
    });
  });
});
