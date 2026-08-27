import { describe, expect, it } from "vitest";
import { bucketQueueItems } from "./queueColumns";
import type { QueueItem } from "@shared/schema";

function item(overrides: Partial<QueueItem>): QueueItem {
  return { consultationId: "c1", patientId: "p1", status: "arrived", priority: "normal", waitingSinceMs: null, timeline: [], ...overrides };
}

describe("bucketQueueItems", () => {
  it("buckets arrived/registered/waiting into waiting, called/in_care/in_consultation into inConsultation, completed into done", () => {
    const items = [
      item({ consultationId: "c1", status: "arrived" }),
      item({ consultationId: "c2", status: "registered" }),
      item({ consultationId: "c3", status: "waiting" }),
      item({ consultationId: "c4", status: "called" }),
      item({ consultationId: "c5", status: "in_care" }),
      item({ consultationId: "c6", status: "in_consultation" }),
      item({ consultationId: "c7", status: "completed" }),
      item({ consultationId: "c8", status: "cancelled" }),
    ];

    const result = bucketQueueItems(items);

    expect(result.waiting.map((i) => i.consultationId)).toEqual(["c1", "c2", "c3"]);
    expect(result.inConsultation.map((i) => i.consultationId)).toEqual(["c4", "c5", "c6"]);
    expect(result.done.map((i) => i.consultationId)).toEqual(["c7"]);
  });

  it("sorts the waiting column by priority (tres_urgent, urgent, normal) then by longest wait", () => {
    const items = [
      item({ consultationId: "normal-long-wait", status: "arrived", priority: "normal", waitingSinceMs: 20 * 60_000 }),
      item({ consultationId: "urgent", status: "arrived", priority: "urgent", waitingSinceMs: 5 * 60_000 }),
      item({ consultationId: "tres-urgent", status: "arrived", priority: "tres_urgent", waitingSinceMs: 1 * 60_000 }),
      item({ consultationId: "normal-short-wait", status: "arrived", priority: "normal", waitingSinceMs: 10 * 60_000 }),
    ];

    const result = bucketQueueItems(items);

    expect(result.waiting.map((i) => i.consultationId)).toEqual(["tres-urgent", "urgent", "normal-long-wait", "normal-short-wait"]);
  });
});
