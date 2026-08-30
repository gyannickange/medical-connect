import { BadRequestException, Injectable } from "@nestjs/common";
import type { InsertQueueEvent, QueueItem } from "@shared/schema";
import { FoldedQueueEntry, QueueRepository } from "./queue.repository";
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
    return this.toQueueItems(tenantId, folded);
  }

  async getQueueHistory(tenantId: string, date: string): Promise<QueueItem[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException("date must be formatted as YYYY-MM-DD");
    }
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T00:00:00.000Z`);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
    const folded = await this.queueRepository.getEventsBetween(tenantId, startOfDay, endOfDay);
    return this.toQueueItems(tenantId, folded);
  }

  private async toQueueItems(tenantId: string, folded: FoldedQueueEntry[]): Promise<QueueItem[]> {
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
