import type { Consultation, Patient, QueueItem } from "@shared/schema";

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

export function computeConsultationJourney(patient: Patient, consultation: Consultation, queueItem: QueueItem | undefined): JourneyStep[] {
  const arrivalEvent = queueItem?.timeline.find((e) => e.eventType === "arrived" || e.eventType === "registered");

  const occurredAtByKey: Record<(typeof STEP_KEYS)[number], Date | null> = {
    patientIdentified: new Date(patient.createdAt),
    consultationRegistered: new Date(consultation.createdAt),
    queue: arrivalEvent ? new Date(arrivalEvent.occurredAt) : null,
    preConsultation: consultation.vitalsRecordedAt ? new Date(consultation.vitalsRecordedAt) : null,
    medicalConsultation: consultation.medicalConsultationSavedAt ? new Date(consultation.medicalConsultationSavedAt) : null,
    exams: null,
    prescription: null,
    carePlan: null,
    closure: null,
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
