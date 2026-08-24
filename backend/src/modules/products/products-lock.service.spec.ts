import { ConflictException } from "@nestjs/common";
import { ProductsLockService } from "./products-lock.service";

describe("ProductsLockService", () => {
  describe("acquireOrRenew", () => {
    it("creates a new lock when none exists", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await service.acquireOrRenew("product-1", "tenant-1", "device-a", "Caisse A");

      expect(couchDBService.getDatabase).toHaveBeenCalledWith("businessconnect_tenant-1");
      const inserted = db.insert.mock.calls[0][0];
      expect(inserted).toMatchObject({
        _id: "lock_product-1",
        type: "lock",
        productId: "product-1",
        deviceId: "device-a",
        deviceName: "Caisse A",
      });
      expect(inserted).not.toHaveProperty("_rev");
      expect(new Date(inserted.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("renews its own lock, keeping the original acquiredAt", async () => {
      const originalAcquiredAt = new Date(Date.now() - 60_000).toISOString();
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "2-abc",
          type: "lock",
          productId: "product-1",
          deviceId: "device-a",
          deviceName: "Caisse A",
          acquiredAt: originalAcquiredAt,
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await service.acquireOrRenew("product-1", "tenant-1", "device-a", "Caisse A");

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted._rev).toBe("2-abc");
      expect(inserted.acquiredAt).toBe(originalAcquiredAt);
      expect(new Date(inserted.expiresAt).getTime()).toBeGreaterThan(Date.now() + 200_000);
    });

    it("rejects acquiring a lock held by another device", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "2-abc",
          type: "lock",
          productId: "product-1",
          deviceId: "device-a",
          deviceName: "Caisse A",
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
        insert: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await expect(
        service.acquireOrRenew("product-1", "tenant-1", "device-b", "Caisse B")
      ).rejects.toThrow(ConflictException);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("allows a different device to acquire an expired lock", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "2-abc",
          type: "lock",
          productId: "product-1",
          deviceId: "device-a",
          deviceName: "Caisse A",
          acquiredAt: new Date(Date.now() - 700_000).toISOString(),
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await service.acquireOrRenew("product-1", "tenant-1", "device-b", "Caisse B");

      const inserted = db.insert.mock.calls[0][0];
      expect(inserted.deviceId).toBe("device-b");
      expect(inserted._rev).toBe("2-abc");
    });

    it("translates a racing first acquisition conflict", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        insert: jest.fn().mockRejectedValue({ statusCode: 409 }),
      };
      const service = new ProductsLockService({
        getDatabase: jest.fn().mockResolvedValue(db),
      } as any);

      await expect(
        service.acquireOrRenew("product-1", "tenant-1", "device-a", "Caisse A")
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("release", () => {
    it("removes a lock held by the caller", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "3-def",
          deviceId: "device-a",
        }),
        destroy: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await service.release("product-1", "tenant-1", "device-a");

      expect(db.destroy).toHaveBeenCalledWith("lock_product-1", "3-def");
    });

    it("does nothing when no lock exists", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
        destroy: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await service.release("product-1", "tenant-1", "device-a");

      expect(db.destroy).not.toHaveBeenCalled();
    });

    it("rejects releasing a lock held by another device", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "3-def",
          deviceId: "device-a",
        }),
        destroy: jest.fn(),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await expect(
        service.release("product-1", "tenant-1", "device-b")
      ).rejects.toThrow(ConflictException);
      expect(db.destroy).not.toHaveBeenCalled();
    });
  });

  describe("assertHeldByDevice", () => {
    it("does nothing when no lock exists", async () => {
      const db = {
        get: jest.fn().mockRejectedValue({ statusCode: 404 }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await expect(
        service.assertHeldByDevice("product-1", "tenant-1", "device-a")
      ).resolves.toBeUndefined();
    });

    it("does nothing when the lock is expired", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "2-abc",
          deviceId: "device-a",
          deviceName: "Caisse A",
          acquiredAt: new Date(Date.now() - 700_000).toISOString(),
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await expect(
        service.assertHeldByDevice("product-1", "tenant-1", "device-b")
      ).resolves.toBeUndefined();
    });

    it("does nothing when the caller holds the valid lock", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "2-abc",
          deviceId: "device-a",
          deviceName: "Caisse A",
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await expect(
        service.assertHeldByDevice("product-1", "tenant-1", "device-a")
      ).resolves.toBeUndefined();
    });

    it("rejects when a different device holds a valid lock", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "2-abc",
          deviceId: "device-a",
          deviceName: "Caisse A",
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await expect(
        service.assertHeldByDevice("product-1", "tenant-1", "device-b")
      ).rejects.toThrow(ConflictException);
    });

    it("rejects when the caller supplies no deviceId and someone else holds a valid lock", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "lock_product-1",
          _rev: "2-abc",
          deviceId: "device-a",
          deviceName: "Caisse A",
          acquiredAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 300_000).toISOString(),
        }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const service = new ProductsLockService(couchDBService as any);

      await expect(
        service.assertHeldByDevice("product-1", "tenant-1", undefined)
      ).rejects.toThrow(ConflictException);
    });
  });
});
