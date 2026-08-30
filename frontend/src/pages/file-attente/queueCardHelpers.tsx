import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../../lib/i18n";
import { calculateAge } from "@/lib/patientAge";
import type { Patient, QueueEventType, QueueItem } from "@shared/schema";

export function priorityVariant(priority: QueueItem["priority"]): "destructive" | "warning" | "success" {
  if (priority === "tres_urgent") return "destructive";
  if (priority === "urgent") return "warning";
  return "success";
}

export function priorityLabelKey(priority: string): string {
  return "priority" + priority[0].toUpperCase() + priority.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function eventTime(item: QueueItem, eventTypes: QueueEventType[]): string | null {
  const entry = item.timeline.find((e) => eventTypes.includes(e.eventType));
  if (!entry) return null;
  return new Date(entry.occurredAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function QueuePatientHeader({ item, patient }: { item: QueueItem; patient: Patient | undefined }) {
  const { t } = useTranslation();
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : item.patientId;
  const age = patient ? calculateAge(patient.dateOfBirth) : null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-foreground">
        {patientName}
        {age !== null && <span className="text-sm font-normal text-muted-foreground">, {age}{t("yearsOldSuffix")}</span>}
      </span>
      <Badge variant={priorityVariant(item.priority)}>{t(priorityLabelKey(item.priority))}</Badge>
    </div>
  );
}

export function QueueDoneCard({ item, patient, doctorName }: { item: QueueItem; patient: Patient | undefined; doctorName: string | undefined }) {
  const { t } = useTranslation();
  const completedAt = eventTime(item, ["completed"]);
  return (
    <div className="glass-card rounded-xl p-4 space-y-2" data-testid={`queue-card-${item.consultationId}`}>
      <QueuePatientHeader item={item} patient={patient} />
      <div className="flex items-center justify-between text-sm">
        {completedAt && <span className="text-emerald-500 font-medium">{t("completedAtLabel")} {completedAt}</span>}
        {doctorName && <span className="text-muted-foreground">{doctorName}</span>}
      </div>
    </div>
  );
}
