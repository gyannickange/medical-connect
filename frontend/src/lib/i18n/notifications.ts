import type { TranslationSection } from "./types";

export const notifications: TranslationSection = {
  en: {
    notifications: "Notifications",
    noNotifications: "No notifications yet.",
    notificationQueuePatientReadyTitle: "Patient ready",
    notificationQueuePatientReadyBody: "Your patient is ready — consultation",
    notificationLabResultReadyTitle: "Lab results ready",
    notificationLabResultReadyBody: "Results are back for",
    notificationSoundLabel: "Notification sound",
    notificationSoundDefault: "Default",
    notificationSoundChime: "Chime",
    notificationSoundPing: "Ping",
    notificationSoundNone: "Silent",
  },
  fr: {
    notifications: "Notifications",
    noNotifications: "Aucune notification pour le moment.",
    notificationQueuePatientReadyTitle: "Patient prêt",
    notificationQueuePatientReadyBody: "Votre patient est prêt — consultation",
    notificationLabResultReadyTitle: "Résultats d'analyses prêts",
    notificationLabResultReadyBody: "Résultats disponibles pour",
    notificationSoundLabel: "Son de notification",
    notificationSoundDefault: "Par défaut",
    notificationSoundChime: "Carillon",
    notificationSoundPing: "Ping",
    notificationSoundNone: "Silencieux",
  },
};
