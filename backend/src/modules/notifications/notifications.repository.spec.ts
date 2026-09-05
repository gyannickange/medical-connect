import { NotFoundException } from "@nestjs/common";
import { NotificationsRepository } from "./notifications.repository";

describe("NotificationsRepository", () => {
  describe("notifyUser", () => {
    it("inserts a notification document for the recipient", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      const result = await repository.notifyUser({
        tenantId: "tenant-1",
        recipientUserId: "doctor-1",
        notificationType: "queue_patient_ready",
        data: { consultationNumber: "C-2026-0001" },
        relatedEntity: { type: "consultation", id: "c1" },
      });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification",
          tenantId: "tenant-1",
          recipientUserId: "doctor-1",
          notificationType: "queue_patient_ready",
          readAt: null,
        })
      );
      expect(result.readAt).toBeNull();
      expect(result.recipientUserId).toBe("doctor-1");
    });
  });

  describe("findForRecipient", () => {
    it("queries by tenant and recipient, sorted newest-first", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new NotificationsRepository(couchDBService as any);

      await repository.findForRecipient("tenant-1", "doctor-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: { type: "notification", tenantId: "tenant-1", recipientUserId: "doctor-1" },
          sort: [{ createdAt: "desc" }],
          limit: 50,
        })
      );
    });
  });

  describe("markRead", () => {
    it("sets readAt on the recipient's own notification", async () => {
      const existing = {
        _id: "notification:n1",
        _rev: "1-a",
        id: "n1",
        type: "notification",
        tenantId: "tenant-1",
        recipientUserId: "doctor-1",
        notificationType: "lab_result_ready",
        data: { examNames: "NFS" },
        relatedEntity: { type: "labOrder", id: "lo1" },
        createdAt: "2026-09-03T08:00:00.000Z",
        readAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      const result = await repository.markRead("n1", "tenant-1", "doctor-1");

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ readAt: expect.any(String) }));
      expect(result.readAt).toBeInstanceOf(Date);
    });

    it("throws NotFoundException when the notification belongs to a different recipient", async () => {
      const existing = { _id: "notification:n1", type: "notification", tenantId: "tenant-1", recipientUserId: "other-doctor" };
      const db = { get: jest.fn().mockResolvedValue(existing) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      await expect(repository.markRead("n1", "tenant-1", "doctor-1")).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the notification does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      await expect(repository.markRead("missing", "tenant-1", "doctor-1")).rejects.toThrow(NotFoundException);
    });
  });
});
