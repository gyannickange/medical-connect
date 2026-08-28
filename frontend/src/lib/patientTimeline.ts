import type { Consultation, LabOrder, Prescription } from "@shared/schema";

export type PatientTimelineEventType = "consultation_created" | "consultation_closed" | "lab_result" | "prescription_delivered";

export interface PatientTimelineEntry {
  type: PatientTimelineEventType;
  occurredAt: Date;
  detail: string;
}

const RESOLVED_LAB_ORDER_STATUSES = new Set(["termine"]);
const DELIVERED_PRESCRIPTION_STATUSES = new Set(["delivre", "delivre_partiel"]);

export function buildPatientTimeline(consultations: Consultation[], labOrders: LabOrder[], prescriptions: Prescription[]): PatientTimelineEntry[] {
  const entries: PatientTimelineEntry[] = [];

  for (const c of consultations) {
    entries.push({ type: "consultation_created", occurredAt: new Date(c.createdAt), detail: c.specialty });
    if (c.status === "terminee" && c.closedAt) {
      entries.push({ type: "consultation_closed", occurredAt: new Date(c.closedAt), detail: c.specialty });
    }
  }

  for (const order of labOrders) {
    if (RESOLVED_LAB_ORDER_STATUSES.has(order.status)) {
      entries.push({ type: "lab_result", occurredAt: new Date(order.updatedAt), detail: order.examLines.map((l) => l.examName).join(", ") });
    }
  }

  for (const prescription of prescriptions) {
    if (DELIVERED_PRESCRIPTION_STATUSES.has(prescription.status)) {
      entries.push({ type: "prescription_delivered", occurredAt: new Date(prescription.updatedAt), detail: prescription.lines.map((l) => l.drugName).join(", ") });
    }
  }

  return entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
