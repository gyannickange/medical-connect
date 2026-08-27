import { NotFoundException } from "@nestjs/common";
import { QueueRepository } from "./queue.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

describe("QueueRepository", () => {
  describe("appendEvent", () => {
    it("validates the consultation exists in the tenant and inserts the event", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new QueueRepository(couchDBService as any, consultationsRepository as any);

      const result = await repository.appendEvent({
        consultationId: "c1",
        patientId: "p1",
        eventType: "arrived",
        actorUserId: "u1",
        tenantId: "tenant-1",
      } as any);

      expect(consultationsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "c1");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ type: "queue_event", eventType: "arrived", consultationId: "c1" }));
      expect(result.eventType).toBe("arrived");
    });

    it("throws NotFoundException when the consultation does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const repository = new QueueRepository(couchDBService as any, consultationsRepoStub(null) as any);

      await expect(
        repository.appendEvent({ consultationId: "missing", patientId: "p1", eventType: "arrived", actorUserId: "u1", tenantId: "tenant-1" } as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getEventsSince", () => {
    it("folds events per consultation into the latest status and a timeline", async () => {
      const docs = [
        { consultationId: "c1", patientId: "p1", eventType: "arrived", occurredAt: "2026-08-27T08:00:00.000Z" },
        { consultationId: "c1", patientId: "p1", eventType: "registered", occurredAt: "2026-08-27T08:05:00.000Z" },
        { consultationId: "c2", patientId: "p2", eventType: "arrived", occurredAt: "2026-08-27T08:10:00.000Z" },
        { consultationId: "c1", patientId: "p1", eventType: "priority_changed", payload: { priority: "urgent" }, occurredAt: "2026-08-27T08:12:00.000Z" },
      ];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new QueueRepository(couchDBService as any, consultationsRepoStub() as any);

      const result = await repository.getEventsSince("tenant-1", new Date("2026-08-27T00:00:00.000Z"));

      expect(result).toHaveLength(2);
      const c1 = result.find((item: any) => item.consultationId === "c1")!;
      expect(c1.status).toBe("priority_changed");
      expect(c1.priorityOverride).toBe("urgent");
      expect(c1.timeline).toHaveLength(3);
      const c2 = result.find((item: any) => item.consultationId === "c2")!;
      expect(c2.status).toBe("arrived");
      expect(c2.priorityOverride).toBeNull();
    });
  });
});
