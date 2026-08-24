import { NotFoundException } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

const userDocument = (overrides: Record<string, unknown> = {}) => ({
  _id: "user:user-1",
  _rev: "1-user",
  id: "user-1",
  type: "user",
  username: "alice",
  tenantId: "tenant-1",
  password: "hashed",
  firstName: "Alice",
  lastName: "A",
  email: null,
  role: "cashier",
  isActive: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("UsersRepository", () => {
  describe("update", () => {
    it("hides a user that belongs to a different tenant", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(userDocument()),
        insert: jest.fn(),
      };
      const repository = new UsersRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.update("user-1", "tenant-2", { firstName: "Mallory" })
      ).rejects.toThrow(NotFoundException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("updates a user when the tenant matches", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(userDocument()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new UsersRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      const result = await repository.update("user-1", "tenant-1", {
        firstName: "Alicia",
      });

      expect(result.firstName).toBe("Alicia");
    });

    it("releases a newly reserved username when the user write fails", async () => {
      const newReservation = {
        _id: "username:bob",
        _rev: "1-new",
        type: "username_reservation",
        username: "bob",
        userId: "user-1",
      };
      const db = {
        get: jest.fn().mockImplementation((documentId: string) => {
          if (documentId === "user:user-1") return Promise.resolve(userDocument());
          if (documentId === "username:bob") return Promise.resolve(newReservation);
          return Promise.reject({ statusCode: 404 });
        }),
        insert: jest
          .fn()
          .mockResolvedValueOnce({ ok: true })
          .mockRejectedValueOnce(new Error("network blip")),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new UsersRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        repository.update("user-1", "tenant-1", { username: "bob" })
      ).rejects.toThrow("network blip");
      expect(db.destroy).toHaveBeenCalledWith("username:bob", "1-new");
    });
  });

  describe("delete", () => {
    it("hides a user that belongs to a different tenant", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(userDocument()),
        destroy: jest.fn(),
      };
      const repository = new UsersRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(repository.delete("user-1", "tenant-2")).rejects.toThrow(
        NotFoundException
      );
      expect(db.destroy).not.toHaveBeenCalled();
    });

    it("deletes a user when the tenant matches", async () => {
      const db = {
        get: jest
          .fn()
          .mockResolvedValueOnce(userDocument())
          .mockRejectedValueOnce({ statusCode: 404 }),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new UsersRepository({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await repository.delete("user-1", "tenant-1");

      expect(db.destroy).toHaveBeenCalledWith("user:user-1", "1-user");
    });
  });
});
