import { computeRoomStatus, deriveRoomHistory } from "./room-status";
import type { Consultation, Room } from "@shared/schema";

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    tenantId: "tenant-1",
    number: "101",
    type: "Cardiologie",
    floor: null,
    capacity: 2,
    equipment: [],
    notes: null,
    status: "disponible",
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    ...overrides,
  };
}

function consultation(overrides: Partial<Consultation> = {}): Consultation {
  return {
    id: "c-1",
    tenantId: "tenant-1",
    number: "C-2026-0001",
    patientId: "patient-1",
    scheduledAt: new Date("2026-08-28T09:00:00.000Z"),
    specialty: "Cardiologie",
    assignedDoctorId: "doctor-1",
    roomId: "room-1",
    priority: "normal",
    reason: "Suivi",
    nurseNotes: null,
    symptoms: null,
    vitals: null,
    vitalsRecordedAt: null,
    relevantHistory: [],
    presentIllnessHistory: null,
    physicalExam: null,
    diagnosisPrincipal: null,
    diagnosisSecondary: [],
    diagnosisHypothesis: null,
    medicalConsultationSavedAt: null,
    carePlan: null,
    carePlanSavedAt: null,
    examInterpretation: null,
    examDecision: null,
    examsReviewedAt: null,
    closedAt: null,
    status: "planifiee",
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    ...overrides,
  };
}

const now = new Date("2026-08-28T08:00:00.000Z");

describe("computeRoomStatus", () => {
  it("returns occupee when a consultation in this room is en_cours", () => {
    const inProgress = consultation({ status: "en_cours" });
    const result = computeRoomStatus(room(), [inProgress], now);
    expect(result.effectiveStatus).toBe("occupee");
    expect(result.currentConsultation).toBe(inProgress);
  });

  it("occupee wins even when the room is stored as en_maintenance", () => {
    const inProgress = consultation({ status: "en_cours" });
    const result = computeRoomStatus(room({ status: "en_maintenance" }), [inProgress], now);
    expect(result.effectiveStatus).toBe("occupee");
  });

  it("returns en_maintenance when stored status is en_maintenance and no consultation is in progress", () => {
    const result = computeRoomStatus(room({ status: "en_maintenance" }), [], now);
    expect(result.effectiveStatus).toBe("en_maintenance");
  });

  it("en_maintenance wins over a future reservation today", () => {
    const upcoming = consultation({ status: "planifiee", scheduledAt: new Date("2026-08-28T14:00:00.000Z") });
    const result = computeRoomStatus(room({ status: "en_maintenance" }), [upcoming], now);
    expect(result.effectiveStatus).toBe("en_maintenance");
  });

  it("returns reservee when a planifiee/en_attente consultation is scheduled later today", () => {
    const upcoming = consultation({ status: "en_attente", scheduledAt: new Date("2026-08-28T14:00:00.000Z") });
    const result = computeRoomStatus(room(), [upcoming], now);
    expect(result.effectiveStatus).toBe("reservee");
    expect(result.upcomingConsultations).toEqual([upcoming]);
  });

  it("ignores a scheduled consultation from a different day", () => {
    const tomorrow = consultation({ status: "planifiee", scheduledAt: new Date("2026-08-29T09:00:00.000Z") });
    const result = computeRoomStatus(room(), [tomorrow], now);
    expect(result.effectiveStatus).toBe("disponible");
  });

  it("returns disponible when there is nothing relevant", () => {
    const result = computeRoomStatus(room(), [], now);
    expect(result.effectiveStatus).toBe("disponible");
  });
});

describe("deriveRoomHistory", () => {
  it("returns only terminee consultations, most recent first, limited", () => {
    const oldest = consultation({ id: "c-old", status: "terminee", scheduledAt: new Date("2026-08-01T09:00:00.000Z") });
    const newest = consultation({ id: "c-new", status: "terminee", scheduledAt: new Date("2026-08-20T09:00:00.000Z") });
    const stillPlanned = consultation({ id: "c-planned", status: "planifiee" });

    const result = deriveRoomHistory([oldest, newest, stillPlanned], 5);

    expect(result.map((c) => c.id)).toEqual(["c-new", "c-old"]);
  });

  it("respects the limit", () => {
    const consultations = [1, 2, 3].map((n) =>
      consultation({ id: `c-${n}`, status: "terminee", scheduledAt: new Date(`2026-08-0${n}T09:00:00.000Z`) })
    );
    expect(deriveRoomHistory(consultations, 2)).toHaveLength(2);
  });
});
