import type { AppNotification, NotificationType } from "@shared/schema";

export function isNotificationDoc(doc: unknown, userId: string): doc is AppNotification & { _id: string } {
  if (!doc || typeof doc !== "object") return false;
  const candidate = doc as Record<string, unknown>;
  return candidate.type === "notification" && candidate.recipientUserId === userId && !candidate._deleted;
}

export function notificationTitle(t: (key: string) => string, notification: { notificationType: NotificationType }): string {
  return notification.notificationType === "queue_patient_ready"
    ? t("notificationQueuePatientReadyTitle")
    : t("notificationLabResultReadyTitle");
}

export function notificationBody(
  t: (key: string) => string,
  notification: { notificationType: NotificationType; data?: { consultationNumber?: string; examNames?: string } }
): string {
  if (notification.notificationType === "queue_patient_ready") {
    const ref = notification.data?.consultationNumber;
    return ref ? `${t("notificationQueuePatientReadyBody")} ${ref}` : t("notificationQueuePatientReadyBody");
  }
  const exams = notification.data?.examNames;
  return exams ? `${t("notificationLabResultReadyBody")} ${exams}` : t("notificationLabResultReadyBody");
}
