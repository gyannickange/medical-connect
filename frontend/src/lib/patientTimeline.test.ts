import { describe, expect, it } from "vitest";
import { buildPatientTimeline } from "./patientTimeline";
import type { Consultation, LabOrder, Prescription } from "@shared/schema";

function consultation(overrides: Partial<Consultation> = {}): Consultation {
  return {
    id: "c1", tenantId: "t1", number: "C-2026-0001", patientId: "p1", scheduledAt: "2026-08-01T09:00:00.000Z",
    specialty: "Cardiologie", assignedDoctorId: "doctor-1", roomId: null, priority: "normal", reason: "Suivi",
    nurseNotes: null, symptoms: null, vitals: null, vitalsRecordedAt: null, relevantHistory: [], presentIllnessHistory: null,
    physicalExam: null, diagnosisPrincipal: null, diagnosisSecondary: [], diagnosisHypothesis: null,
    medicalConsultationSavedAt: null, carePlan: null, carePlanSavedAt: null, closedAt: null, status: "planifiee",
    createdAt: "2026-08-01T09:00:00.000Z", updatedAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  } as Consultation;
}

function labOrder(overrides: Partial<LabOrder> = {}): LabOrder {
  return {
    id: "lo1", tenantId: "t1", consultationId: "c1", patientId: "p1", examLines: [{ examName: "NFS", resultText: "RAS" }],
    requestedByUserId: "doctor-1", requestedAt: "2026-08-02T09:00:00.000Z", priority: "normal", clinicalContext: null,
    specialInstructions: null, status: "termine", takenInChargeByUserId: null, takenInChargeAt: null,
    validatedByUserId: null, validatedAt: null, problemReport: null, followUpAction: null, followUpNote: null,
    followUpRecordedAt: null, createdAt: "2026-08-02T09:00:00.000Z", updatedAt: "2026-08-02T10:00:00.000Z",
    ...overrides,
  } as LabOrder;
}

function prescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: "pr1", tenantId: "t1", consultationId: "c1", patientId: "p1", lines: [{ drugName: "Bisoprolol", dosage: "5mg", frequency: "1/jour", durationDays: 30, quantity: "1 boîte", dispenseStatus: "delivre" }],
    prescribedByUserId: "doctor-1", prescribedAt: "2026-08-02T09:00:00.000Z", status: "delivre",
    dispensedByUserId: "pharmacist-1", dispensedAt: "2026-08-02T11:00:00.000Z",
    createdAt: "2026-08-02T09:00:00.000Z", updatedAt: "2026-08-02T11:00:00.000Z",
    ...overrides,
  } as Prescription;
}

describe("buildPatientTimeline", () => {
  it("includes a consultation_created entry for every consultation", () => {
    const entries = buildPatientTimeline([consultation()], [], []);
    expect(entries).toContainEqual(expect.objectContaining({ type: "consultation_created", detail: "Cardiologie" }));
  });

  it("includes a consultation_closed entry only when status is terminee and closedAt is set", () => {
    const closed = consultation({ status: "terminee", closedAt: "2026-08-01T12:00:00.000Z" });
    const open = consultation({ id: "c2", status: "en_cours", closedAt: null });

    const entries = buildPatientTimeline([closed, open], [], []);

    expect(entries.filter((e) => e.type === "consultation_closed")).toHaveLength(1);
  });

  it("includes a lab_result entry only for termine lab orders, with joined exam names", () => {
    const entries = buildPatientTimeline([], [labOrder({ status: "termine" }), labOrder({ id: "lo2", status: "en_cours" })], []);

    const results = entries.filter((e) => e.type === "lab_result");
    expect(results).toHaveLength(1);
    expect(results[0].detail).toBe("NFS");
  });

  it("includes a prescription_delivered entry for delivre and delivre_partiel, not for others", () => {
    const entries = buildPatientTimeline(
      [],
      [],
      [prescription({ status: "delivre" }), prescription({ id: "pr2", status: "delivre_partiel" }), prescription({ id: "pr3", status: "en_attente" })]
    );

    expect(entries.filter((e) => e.type === "prescription_delivered")).toHaveLength(2);
  });

  it("sorts entries by occurredAt descending, most recent first", () => {
    const older = consultation({ createdAt: "2026-08-01T09:00:00.000Z" });
    const newer = consultation({ id: "c2", createdAt: "2026-08-10T09:00:00.000Z" });

    const entries = buildPatientTimeline([older, newer], [], []);

    expect(entries[0].occurredAt.getTime()).toBeGreaterThan(entries[1].occurredAt.getTime());
  });
});
