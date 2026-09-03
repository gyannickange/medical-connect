import React from "react";
import { Check } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { bucketQueueItems } from "@/lib/queueColumns";
import { calculateAge } from "@/lib/patientAge";
import { priorityLabelKey, priorityVariant } from "./queueCardHelpers";
import type { Consultation, Patient, QueueEventType, QueueItem, User } from "@shared/schema";

function statusColumnLabelKey(status: QueueItem["status"]): "waitingColumn" | "inConsultationColumn" | "doneColumn" {
  if (status === "completed") return "doneColumn";
  if (status === "called" || status === "in_care" || status === "in_consultation") return "inConsultationColumn";
  return "waitingColumn";
}

export default function FileAttenteShow() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { consultationId } = useParams<{ consultationId: string }>();

  const { data: queueItems = [] } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const item = queueItems.find((entry) => entry.consultationId === consultationId);

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", item?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${item?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!item?.patientId,
  });

  const { data: photoUrl } = useQuery<string | null>({
    queryKey: ["/api/patients/photo-url", item?.patientId, patient?.photoS3Key],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${item?.patientId}/photo-url`, { credentials: "include" });
      if (!response.ok) return null;
      const body = await response.json();
      return body.url;
    },
    enabled: !!patient?.photoS3Key,
  });

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultationId,
  });

  const { data: consultationsList = [] } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const serviceOptions = Array.from(new Set(consultationsList.map((c) => c.specialty))).sort();

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const assignedDoctor = staffList.find((member) => member.id === consultation?.assignedDoctorId);
  const doctorFullName = assignedDoctor ? `${assignedDoctor.firstName} ${assignedDoctor.lastName}` : consultation?.assignedDoctorId;

  const eventMutation = useMutation({
    mutationFn: async ({ eventType, payload }: { eventType: QueueEventType; payload?: Record<string, unknown> }) =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId, patientId: item?.patientId, eventType, payload, tenantId: currentTenant?.id },
        { collection: "queue" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  if (!item || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const patientName = `${patient.firstName} ${patient.lastName}`;
  const age = calculateAge(patient.dateOfBirth);
  const waitingMinutes = item.waitingSinceMs ? Math.round(item.waitingSinceMs / 60_000) : null;
  const waitingBucket = bucketQueueItems(queueItems).waiting;
  const queuePosition = waitingBucket.findIndex((entry) => entry.consultationId === consultationId);

  function eventOccurredAt(eventTypes: QueueEventType[]): string | undefined {
    return item!.timeline.find((e) => eventTypes.includes(e.eventType))?.occurredAt;
  }
  function formatTime(iso: string | undefined): string | null {
    return iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  }

  const arrivedAt = eventOccurredAt(["arrived"]);
  const registeredAt = eventOccurredAt(["registered"]);
  const activeAt = eventOccurredAt(["called", "in_care", "in_consultation"]);
  const isActiveOrDone = item.status !== "arrived" && item.status !== "registered" && item.status !== "waiting";
  const isDone = item.status === "completed";

  const steps = [
    { label: t("arrivedEventLabel"), time: formatTime(arrivedAt), done: !!arrivedAt },
    { label: t("registeredEventLabel"), time: formatTime(registeredAt), done: !!registeredAt },
    {
      label: t("waitingColumn"),
      time: !isActiveOrDone && waitingMinutes !== null ? `${t("waitingSince")} ${waitingMinutes} ${t("minutesShort")}` : formatTime(registeredAt) ? t("comingSoonLabel") : null,
      done: isActiveOrDone,
      current: !isActiveOrDone,
    },
    {
      label: t("inConsultationColumn"),
      time: activeAt ? formatTime(activeAt) : isActiveOrDone ? t("comingSoonLabel") : t("comingSoonLabel"),
      done: isDone,
      current: isActiveOrDone && !isDone,
    },
  ];

  return (
    <div className="space-y-6" data-testid="file-attente-show-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">
          {patientName} — {t(statusColumnLabelKey(item.status))}
        </h1>
        {waitingMinutes !== null && !isActiveOrDone && (
          <p className="text-sm text-muted-foreground">{t("admissionPendingSubtitle").replace("{min}", String(waitingMinutes))}</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
        <div className="space-y-6">
          <div className="glass-card rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-3">
              <Avatar className="h-[54px] w-[54px]">
                {photoUrl && <AvatarImage src={photoUrl} alt={patientName} />}
                <AvatarFallback>{`${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-foreground text-lg">{patientName}</p>
                <p className="text-sm text-muted-foreground">{age}{t("yearsOldSuffix")} • {patient.primaryPhone}</p>
              </div>
            </div>
            <div className="border-t border-border pt-4 space-y-3">
              {queuePosition >= 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("positionInQueueLabel")}</span>
                  <span className="font-bold text-primary">{queuePosition + 1} / {waitingBucket.length}</span>
                </div>
              )}
              {waitingMinutes !== null && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{t("waitingSince")}</span>
                  <span className="font-bold text-red-500">{waitingMinutes} {t("minutesShort")}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("currentPriorityLabel")}</span>
                <Badge variant={priorityVariant(item.priority)}>{t(priorityLabelKey(item.priority))}</Badge>
              </div>
            </div>
          </div>

          <div className="glass-card rounded-xl p-5 space-y-3">
            <p className="font-bold text-sm text-foreground">{t("quickActionsTitle")}</p>
            <Button
              className="btn-primary w-full"
              onClick={() => eventMutation.mutate({ eventType: "in_consultation" })}
              disabled={eventMutation.isPending}
              data-testid="button-mark-seen">
              {t("markSeen")}
            </Button>
            <Select onValueChange={(service) => eventMutation.mutate({ eventType: "transferred", payload: { targetService: service } })}>
              <SelectTrigger data-testid="select-transfer-service">
                <SelectValue placeholder={t("transferService")} />
              </SelectTrigger>
              <SelectContent>
                {serviceOptions.map((service) => (
                  <SelectItem key={service} value={service}>{service}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={(priority) => eventMutation.mutate({ eventType: "priority_changed", payload: { priority } })}>
              <SelectTrigger data-testid="select-change-priority">
                <SelectValue placeholder={t("changePriority")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">{t("priorityNormal")}</SelectItem>
                <SelectItem value="urgent">{t("priorityUrgent")}</SelectItem>
                <SelectItem value="tres_urgent">{t("priorityTresUrgent")}</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              className="w-full bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600"
              onClick={() => eventMutation.mutate({ eventType: "cancelled" })}
              disabled={eventMutation.isPending}
              data-testid="button-cancel-queue-entry">
              {t("cancelOrRemove")}
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <div className="glass-card rounded-xl p-6 space-y-5">
            <p className="font-bold text-foreground">{t("admissionTrackingTitle")}</p>
            <div className="flex items-center gap-3">
              {steps.map((step, index) => (
                <React.Fragment key={step.label}>
                  {index > 0 && <div className="h-px flex-1 bg-border" />}
                  <div className="flex items-center gap-2 shrink-0">
                    <div
                      className={
                        step.done
                          ? "flex items-center justify-center rounded-full bg-primary size-6"
                          : step.current
                            ? "flex items-center justify-center rounded-full border-2 border-amber-500 size-6"
                            : "flex items-center justify-center rounded-full bg-muted size-6"
                      }>
                      {step.done && <Check className="size-3 text-primary-foreground" />}
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${step.current ? "text-amber-500" : step.done ? "text-foreground" : "text-muted-foreground"}`}>
                        {step.label}
                      </p>
                      {step.time && <p className="text-[10px] text-muted-foreground">{step.time}</p>}
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>

          {consultation && (
            <div className="glass-card rounded-xl p-6 space-y-3">
              <p className="font-bold text-foreground">{t("admissionClinicalInfoTitle")}</p>
              <div className="space-y-1 border-b border-border pb-3">
                <p className="text-xs uppercase font-semibold text-muted-foreground">{t("waitReasonLabel")}</p>
                <p className="text-sm text-foreground">{consultation.reason}</p>
              </div>
              {consultation.nurseNotes && (
                <div className="space-y-1 border-b border-border pb-3">
                  <p className="text-xs uppercase font-semibold text-muted-foreground">{t("admissionNotesLabel")}</p>
                  <p className="text-sm text-foreground">{consultation.nurseNotes}</p>
                </div>
              )}
              <div className="flex gap-6 text-sm">
                <div className="flex-1 space-y-1">
                  <p className="text-xs uppercase font-semibold text-muted-foreground">{t("assignedDoctorShortLabel")}</p>
                  <p className="text-primary font-medium">{doctorFullName}</p>
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-xs uppercase font-semibold text-muted-foreground">{t("careServiceLabel")}</p>
                  <p className="text-foreground">{consultation.specialty}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
