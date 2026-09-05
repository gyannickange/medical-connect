import { describe, expect, it, vi } from "vitest";
import { isNotificationDoc, notificationBody, notificationTitle } from "./notifications";

const t = vi.fn((key: string) => key);

describe("isNotificationDoc", () => {
  it("accepts a notification doc addressed to the given user", () => {
    const doc = { type: "notification", recipientUserId: "doctor-1" };
    expect(isNotificationDoc(doc, "doctor-1")).toBe(true);
  });

  it("rejects a notification doc addressed to someone else", () => {
    const doc = { type: "notification", recipientUserId: "doctor-2" };
    expect(isNotificationDoc(doc, "doctor-1")).toBe(false);
  });

  it("rejects non-notification docs", () => {
    expect(isNotificationDoc({ type: "consultation", recipientUserId: "doctor-1" }, "doctor-1")).toBe(false);
  });

  it("rejects deleted docs", () => {
    expect(isNotificationDoc({ type: "notification", recipientUserId: "doctor-1", _deleted: true }, "doctor-1")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isNotificationDoc(null, "doctor-1")).toBe(false);
    expect(isNotificationDoc(undefined, "doctor-1")).toBe(false);
  });
});

describe("notificationTitle", () => {
  it("returns the queue title key for queue_patient_ready", () => {
    expect(notificationTitle(t, { notificationType: "queue_patient_ready" })).toBe("notificationQueuePatientReadyTitle");
  });

  it("returns the lab title key for lab_result_ready", () => {
    expect(notificationTitle(t, { notificationType: "lab_result_ready" })).toBe("notificationLabResultReadyTitle");
  });
});

describe("notificationBody", () => {
  it("appends the consultation number for queue_patient_ready", () => {
    const result = notificationBody(t, { notificationType: "queue_patient_ready", data: { consultationNumber: "C-2026-0001" } });
    expect(result).toBe("notificationQueuePatientReadyBody C-2026-0001");
  });

  it("falls back to the plain body when consultationNumber is missing", () => {
    const result = notificationBody(t, { notificationType: "queue_patient_ready", data: {} });
    expect(result).toBe("notificationQueuePatientReadyBody");
  });

  it("appends exam names for lab_result_ready", () => {
    const result = notificationBody(t, { notificationType: "lab_result_ready", data: { examNames: "NFS, Créatinine" } });
    expect(result).toBe("notificationLabResultReadyBody NFS, Créatinine");
  });
});
