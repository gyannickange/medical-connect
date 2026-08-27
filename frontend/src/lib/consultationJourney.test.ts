import { describe, expect, it } from "vitest";
import { computeConsultationJourney } from "./consultationJourney";
import type { Consultation, Patient, QueueItem } from "@shared/schema";

function patient(overrides: Partial<Patient> = {}): Patient {
  return { id: "p1", tenantId: "t1", dossierNumber: "MC-2026-0001", lastName: "Diallo", firstName: "Aïssatou", searchName: "aïssatou diallo", dateOfBirth: "1994-03-12", sex: "F", primaryPhone: "+237600000000", residenceAddress: "Yaoundé", usualName: null, birthPlace: null, nationality: null, profession: null, maritalStatus: null, idDocumentType: null, idDocumentNumber: null, idDocumentExpiry: null, email: null, secondaryPhone: null, residenceZone: null, fullAddress: null, emergencyContact: null, bloodGroup: null, allergyKnowledge: "non_renseigne", allergyDetails: null, medicalHistory: null, surgicalHistory: null, chronicDiseases: null, currentTreatments: null, disabilities: null, facilityService: null, referringDoctorId: null, patientType: "externe", paymentMode: null, insuranceName: null, insuranceNumber: null, financiallyResponsible: null, pediatricInfo: null, photoS3Key: null, status: "actif", isActive: true, createdAt: "2026-08-27T08:00:00.000Z", updatedAt: "2026-08-27T08:00:00.000Z", ...overrides } as Patient;
}

function consultation(overrides: Partial<Consultation> = {}): Consultation {
  return { id: "c1", tenantId: "t1", number: "C-2026-0904", patientId: "p1", scheduledAt: "2026-08-27T08:05:00.000Z", specialty: "Cardiologie", assignedDoctorId: "doctor-1", roomId: null, priority: "normal", reason: "Suivi", nurseNotes: null, symptoms: null, vitals: null, vitalsRecordedAt: null, relevantHistory: [], presentIllnessHistory: null, physicalExam: null, diagnosisPrincipal: null, diagnosisSecondary: [], diagnosisHypothesis: null, medicalConsultationSavedAt: null, status: "en_cours", createdAt: "2026-08-27T08:05:00.000Z", updatedAt: "2026-08-27T08:05:00.000Z", ...overrides } as Consultation;
}

describe("computeConsultationJourney", () => {
  it("marks only steps 1-2 completed and step 3 current when there is no queue item yet", () => {
    const steps = computeConsultationJourney(patient(), consultation(), undefined);

    expect(steps[0]).toMatchObject({ key: "patientIdentified", state: "completed" });
    expect(steps[1]).toMatchObject({ key: "consultationRegistered", state: "completed" });
    expect(steps[2]).toMatchObject({ key: "queue", state: "current" });
    expect(steps[3]).toMatchObject({ key: "preConsultation", state: "not_started" });
    expect(steps.slice(4).every((s) => s.state === "not_started")).toBe(true);
  });

  it("marks step 3 completed and step 4 current once a queue item with an arrived timeline entry exists", () => {
    const queueItem: QueueItem = {
      consultationId: "c1",
      patientId: "p1",
      status: "in_care",
      priority: "normal",
      waitingSinceMs: 600_000,
      timeline: [
        { eventType: "arrived", occurredAt: "2026-08-27T08:10:00.000Z" },
        { eventType: "registered", occurredAt: "2026-08-27T08:11:00.000Z" },
        { eventType: "in_care", occurredAt: "2026-08-27T08:15:00.000Z" },
      ],
    };

    const steps = computeConsultationJourney(patient(), consultation(), queueItem);

    expect(steps[2]).toMatchObject({ key: "queue", state: "completed", occurredAt: new Date("2026-08-27T08:10:00.000Z") });
    expect(steps[3]).toMatchObject({ key: "preConsultation", state: "current" });
  });

  it("marks steps 1-5 completed and step 6 current once vitals and the medical consultation are both saved", () => {
    const queueItem: QueueItem = {
      consultationId: "c1",
      patientId: "p1",
      status: "in_consultation",
      priority: "normal",
      waitingSinceMs: null,
      timeline: [{ eventType: "arrived", occurredAt: "2026-08-27T08:10:00.000Z" }],
    };
    const c = consultation({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z" });

    const steps = computeConsultationJourney(patient(), c, queueItem);

    expect(steps[3]).toMatchObject({ key: "preConsultation", state: "completed" });
    expect(steps[4]).toMatchObject({ key: "medicalConsultation", state: "completed" });
    expect(steps[5]).toMatchObject({ key: "exams", state: "current" });
    expect(steps.slice(6).every((s) => s.state === "not_started")).toBe(true);
  });
});
