import type { ConsultationPriority, QueueEventType, QueueItem } from "@shared/schema";

export interface QueueColumns {
  waiting: QueueItem[];
  inConsultation: QueueItem[];
  done: QueueItem[];
}

const WAITING_STATUSES: QueueEventType[] = ["arrived", "registered", "waiting"];
const IN_CONSULTATION_STATUSES: QueueEventType[] = ["called", "in_care", "in_consultation"];
const PRIORITY_RANK: Record<ConsultationPriority, number> = { tres_urgent: 0, urgent: 1, normal: 2 };

export function bucketQueueItems(items: QueueItem[]): QueueColumns {
  const waiting = items.filter((item) => WAITING_STATUSES.includes(item.status));
  const inConsultation = items.filter((item) => IN_CONSULTATION_STATUSES.includes(item.status));
  const done = items.filter((item) => item.status === "completed");

  waiting.sort((a, b) => {
    const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return (b.waitingSinceMs ?? 0) - (a.waitingSinceMs ?? 0);
  });

  return { waiting, inConsultation, done };
}
