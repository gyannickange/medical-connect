import type { Consultation, LabOrder, Patient, Prescription, QueueItem } from "@shared/schema";

export type JourneyStepState = "completed" | "current" | "not_started";

export interface JourneyStep {
  key: string;
  state: JourneyStepState;
  occurredAt: Date | null;
}

const STEP_KEYS = [
  "patientIdentified",
  "consultationRegistered",
  "queue",
  "preConsultation",
  "medicalConsultation",
  "exams",
  "prescription",
  "carePlan",
  "closure",
] as const;

const RESOLVED_LAB_ORDER_STATUSES = new Set(["termine", "annule"]);
const RESOLVED_PRESCRIPTION_STATUSES = new Set(["delivre", "delivre_partiel", "annule"]);

export function computeConsultationJourney(
  patient: Patient,
  consultation: Consultation,
  queueItem: QueueItem | undefined,
  labOrders: LabOrder[],
  prescriptions: Prescription[]
): JourneyStep[] {
  const arrivalEvent = queueItem?.timeline.find((e) => e.eventType === "arrived" || e.eventType === "registered");
  const consultationClosed = consultation.status === "terminee";

  const examsResolved =
    labOrders.length > 0 ? labOrders.every((order) => RESOLVED_LAB_ORDER_STATUSES.has(order.status)) : consultationClosed;
  const examsOccurredAt = examsResolved ? mostRecentDate(labOrders.map((o) => o.updatedAt)) ?? (consultationClosed ? new Date(consultation.updatedAt) : null) : null;

  const prescriptionResolved =
    prescriptions.length > 0 ? prescriptions.every((p) => RESOLVED_PRESCRIPTION_STATUSES.has(p.status)) : consultationClosed;
  const prescriptionOccurredAt = prescriptionResolved
    ? mostRecentDate(prescriptions.map((p) => p.updatedAt)) ?? (consultationClosed ? new Date(consultation.updatedAt) : null)
    : null;

  const occurredAtByKey: Record<(typeof STEP_KEYS)[number], Date | null> = {
    patientIdentified: new Date(patient.createdAt),
    consultationRegistered: new Date(consultation.createdAt),
    queue: arrivalEvent ? new Date(arrivalEvent.occurredAt) : null,
    preConsultation: consultation.vitalsRecordedAt ? new Date(consultation.vitalsRecordedAt) : null,
    medicalConsultation: consultation.medicalConsultationSavedAt ? new Date(consultation.medicalConsultationSavedAt) : null,
    exams: examsResolved ? (examsOccurredAt ?? new Date(consultation.updatedAt)) : null,
    prescription: prescriptionResolved ? (prescriptionOccurredAt ?? new Date(consultation.updatedAt)) : null,
    carePlan: consultation.carePlan ? new Date(consultation.carePlanSavedAt ?? consultation.updatedAt) : null,
    closure: consultationClosed && consultation.closedAt ? new Date(consultation.closedAt) : null,
  };

  const steps: JourneyStep[] = [];
  let currentAssigned = false;
  for (const key of STEP_KEYS) {
    const occurredAt = occurredAtByKey[key];
    if (occurredAt) {
      steps.push({ key, state: "completed", occurredAt });
      continue;
    }
    if (!currentAssigned) {
      steps.push({ key, state: "current", occurredAt: null });
      currentAssigned = true;
      continue;
    }
    steps.push({ key, state: "not_started", occurredAt: null });
  }
  return steps;
}

function mostRecentDate(values: (Date | string)[]): Date | null {
  if (values.length === 0) return null;
  return values.map((v) => new Date(v)).reduce((latest, current) => (current > latest ? current : latest));
}
