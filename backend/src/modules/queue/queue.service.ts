import { Injectable } from "@nestjs/common";
import type { InsertQueueEvent, QueueItem } from "@shared/schema";
import { QueueRepository } from "./queue.repository";
import { ConsultationsRepository } from "../consultations/consultations.repository";

@Injectable()
export class QueueService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  appendEvent(data: InsertQueueEvent) {
    return this.queueRepository.appendEvent(data);
  }

  async getActiveQueue(tenantId: string): Promise<QueueItem[]> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const folded = await this.queueRepository.getEventsSince(tenantId, startOfDay);

    const items: QueueItem[] = [];
    for (const entry of folded) {
      let priority = entry.priorityOverride as QueueItem["priority"] | null;
      if (!priority) {
        const consultation = await this.consultationsRepository.findById(entry.consultationId, tenantId);
        priority = consultation.priority;
      }
      const arrivedEvent = entry.timeline.find((e) => e.eventType === "arrived");
      items.push({
        consultationId: entry.consultationId,
        patientId: entry.patientId,
        status: entry.status,
        priority: priority ?? "normal",
        waitingSinceMs: arrivedEvent ? Date.now() - new Date(arrivedEvent.occurredAt).getTime() : null,
        timeline: entry.timeline,
      });
    }
    return items;
  }
}
