import type { Consultation, Room, RoomEffectiveStatus } from "@shared/schema";

export interface RoomStatusResult {
  effectiveStatus: RoomEffectiveStatus;
  currentConsultation: Consultation | null;
  upcomingConsultations: Consultation[];
}

export function computeRoomStatus(room: Room, roomConsultations: Consultation[], now: Date): RoomStatusResult {
  const current = roomConsultations.find((c) => c.status === "en_cours") ?? null;
  if (current) {
    return { effectiveStatus: "occupee", currentConsultation: current, upcomingConsultations: [] };
  }

  if (room.status === "en_maintenance") {
    return { effectiveStatus: "en_maintenance", currentConsultation: null, upcomingConsultations: [] };
  }

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const upcoming = roomConsultations
    .filter(
      (c) =>
        (c.status === "planifiee" || c.status === "en_attente") &&
        c.scheduledAt >= dayStart &&
        c.scheduledAt <= dayEnd
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  if (upcoming.length > 0) {
    return { effectiveStatus: "reservee", currentConsultation: null, upcomingConsultations: upcoming };
  }

  return { effectiveStatus: "disponible", currentConsultation: null, upcomingConsultations: [] };
}

export function deriveRoomHistory(roomConsultations: Consultation[], limit: number): Consultation[] {
  return roomConsultations
    .filter((c) => c.status === "terminee")
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
    .slice(0, limit);
}
