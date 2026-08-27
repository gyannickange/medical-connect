import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import type { InsertQueueEvent, QueueEvent, QueueEventType } from "@shared/schema";
import { couchDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

export interface FoldedQueueEntry {
  consultationId: string;
  patientId: string;
  status: QueueEventType;
  priorityOverride: string | null;
  timeline: { eventType: QueueEventType; occurredAt: string }[];
}

@Injectable()
export class QueueRepository {
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  async appendEvent(data: InsertQueueEvent): Promise<QueueEvent> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const consultation = await this.consultationsRepository.findExistingForCascade(db, data.consultationId);
    if (!consultation || consultation.type !== "consultation" || consultation.tenantId !== data.tenantId) {
      throw new NotFoundException("Consultation not found");
    }

    const event: QueueEvent = {
      id,
      tenantId: data.tenantId,
      consultationId: data.consultationId,
      patientId: data.patientId,
      eventType: data.eventType,
      payload: data.payload ?? null,
      actorUserId: data.actorUserId,
      actorDeviceId: data.actorDeviceId ?? null,
      occurredAt: now,
    };

    try {
      await db.insert({ ...event, type: "queue_event" as const, occurredAt: now.toISOString(), _id: couchDocumentId("queue_event", id) } as any);
      return event;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async getEventsSince(tenantId: string, since: Date): Promise<FoldedQueueEntry[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "queue_events_by_tenant_time", ["tenantId", "type", "occurredAt"]);
    const result = await db.find({
      selector: { type: "queue_event", tenantId, occurredAt: { $gte: since.toISOString() } },
      sort: [{ occurredAt: "asc" }],
      limit: 1000,
    });

    const byConsultation = new Map<string, any[]>();
    for (const doc of result.docs as any[]) {
      const list = byConsultation.get(doc.consultationId) ?? [];
      list.push(doc);
      byConsultation.set(doc.consultationId, list);
    }

    const entries: FoldedQueueEntry[] = [];
    for (const [consultationId, events] of byConsultation) {
      const last = events[events.length - 1];
      const priorityEvent = [...events].reverse().find((e) => e.eventType === "priority_changed");
      entries.push({
        consultationId,
        patientId: last.patientId,
        status: last.eventType,
        priorityOverride: priorityEvent?.payload?.priority ?? null,
        timeline: events.map((e) => ({ eventType: e.eventType, occurredAt: e.occurredAt })),
      });
    }
    return entries;
  }

  private async database(tenantId: string): Promise<DocumentScope<unknown>> {
    try {
      return await this.couchDBService.getDatabase(this.databaseName(tenantId));
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
  }
}
