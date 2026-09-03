import React, { useState } from "react";
import { Plus, Stethoscope } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { QueuePolicy } from "@/lib/policies/queue.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { bucketQueueItems } from "@/lib/queueColumns";
import { eventTime, QueueDoneCard, QueuePatientHeader } from "./queueCardHelpers";
import type { Consultation, Patient, QueueEventType, QueueItem, User } from "@shared/schema";

const COLUMN_DOT_CLASS = {
  waiting: "bg-amber-500",
  inConsultation: "bg-emerald-500",
  done: "bg-muted-foreground",
} as const;

export default function FileAttente() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [serviceFilter, setServiceFilter] = useState("all");

  const { data: queueItems = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  const { data: patientsList = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });
  const patientById = Object.fromEntries(patientsList.map((patient) => [patient.id, patient]));

  const { data: consultationsList = [] } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const consultationById = Object.fromEntries(consultationsList.map((consultation) => [consultation.id, consultation]));

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const doctorNameById = Object.fromEntries(staffList.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));

  const eventMutation = useMutation({
    mutationFn: async ({ item, eventType }: { item: QueueItem; eventType: QueueEventType }) =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: item.consultationId, patientId: item.patientId, eventType, tenantId: currentTenant?.id },
        { collection: "queue" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  const serviceOptions = Array.from(new Set(consultationsList.map((c) => c.specialty))).sort();

  const matchesService = (item: QueueItem) =>
    serviceFilter === "all" || consultationById[item.consultationId]?.specialty === serviceFilter;

  const columns = bucketQueueItems(queueItems);
  const filteredColumns = {
    waiting: columns.waiting.filter(matchesService),
    inConsultation: columns.inConsultation.filter(matchesService),
    done: columns.done.filter(matchesService),
  };

  const averageWaitMinutes = filteredColumns.waiting.length
    ? Math.round(filteredColumns.waiting.reduce((sum, item) => sum + (item.waitingSinceMs ?? 0), 0) / filteredColumns.waiting.length / 60_000)
    : 0;

  function renderWaitingCard(item: QueueItem) {
    const consultation = consultationById[item.consultationId];
    const waitingMinutes = item.waitingSinceMs ? Math.round(item.waitingSinceMs / 60_000) : null;
    return (
      <div key={item.consultationId} className="glass-card rounded-xl p-4 space-y-2" data-testid={`queue-card-${item.consultationId}`}>
        <QueuePatientHeader item={item} patient={patientById[item.patientId]} />
        {consultation && (
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">{t("quickRegisterVisitReason")} :</p>
            <p className="text-sm text-foreground">{consultation.reason}</p>
          </div>
        )}
        <div className="flex items-center justify-between text-sm">
          {consultation && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Stethoscope className="w-3.5 h-3.5" />
              {consultation.specialty}
            </span>
          )}
          {waitingMinutes !== null && (
            <span className="text-red-500 font-medium">{t("waitingSince")} : {waitingMinutes} {t("minutesShort")}</span>
          )}
        </div>
        <div className="flex items-center gap-4 pt-1">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary"
            onClick={() => setLocation(`/file-attente/${item.consultationId}`)}
            data-testid={`button-view-details-${item.consultationId}`}>
            {t("viewQueueDetails")}
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-muted-foreground"
            onClick={() => eventMutation.mutate({ item, eventType: "cancelled" })}
            disabled={eventMutation.isPending}
            data-testid={`button-leave-queue-${item.consultationId}`}>
            {t("leaveQueueAction")}
          </Button>
        </div>
      </div>
    );
  }

  function renderInConsultationCard(item: QueueItem) {
    const patient = patientById[item.patientId];
    const doctorName = doctorNameById[consultationById[item.consultationId]?.assignedDoctorId ?? ""];
    const startedAt = eventTime(item, ["called", "in_care", "in_consultation"]);
    return (
      <div key={item.consultationId} className="glass-card rounded-xl p-4 space-y-2" data-testid={`queue-card-${item.consultationId}`}>
        <QueuePatientHeader item={item} patient={patient} />
        {doctorName && (
          <p className="text-sm text-foreground">
            <span className="text-muted-foreground">{t("assignedDoctorQueueLabel")}</span> <span className="text-primary font-medium">{doctorName}</span>
          </p>
        )}
        {startedAt && <p className="text-sm text-muted-foreground">{t("startedAtLabel")} {startedAt}</p>}
        {patient?.dossierNumber && (
          <p className="text-sm text-muted-foreground">{t("dossierNumberLabel")} {patient.dossierNumber}</p>
        )}
        <div className="flex items-center gap-4 pt-1">
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-primary"
            onClick={() => setLocation(`/file-attente/${item.consultationId}`)}
            data-testid={`button-view-details-${item.consultationId}`}>
            {t("viewQueueDetails")}
          </Button>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 text-muted-foreground"
            onClick={() => eventMutation.mutate({ item, eventType: "cancelled" })}
            disabled={eventMutation.isPending}
            data-testid={`button-leave-queue-${item.consultationId}`}>
            {t("leaveQueueAction")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="file-attente-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("queueTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("queueSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation("/file-attente/archive")} data-testid="button-view-queue-archive">
            {t("viewArchiveAction")}
          </Button>
          <PolicyGuard policy={QueuePolicy} action="canAppendEvent">
            <Button className="btn-primary" onClick={() => setLocation("/file-attente/new")} data-testid="button-register-queue-patient">
              <Plus className="w-4 h-4 mr-2" />
              {t("registerPatient")}
            </Button>
          </PolicyGuard>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-4">
        <div className="glass-card rounded-xl px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("waitingColumn")}</p>
          <p className="font-semibold text-foreground">{filteredColumns.waiting.length} {t("patientsStatSuffix")}</p>
        </div>
        <div className="glass-card rounded-xl px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("averageWaitStatLabel")}</p>
          <p className="font-semibold text-foreground">{averageWaitMinutes} {t("minutesShort")}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("serviceFilterLabel")}</span>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-[200px]" data-testid="select-queue-service-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allServicesOption")}</SelectItem>
              {serviceOptions.map((service) => (
                <SelectItem key={service} value={service}>{service}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <span className={`w-2 h-2 rounded-full ${COLUMN_DOT_CLASS.waiting}`} />
              {t("waitingColumn")} ({filteredColumns.waiting.length})
            </h2>
            {filteredColumns.waiting.map(renderWaitingCard)}
          </div>
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <span className={`w-2 h-2 rounded-full ${COLUMN_DOT_CLASS.inConsultation}`} />
              {t("inConsultationColumn")} ({filteredColumns.inConsultation.length})
            </h2>
            {filteredColumns.inConsultation.map(renderInConsultationCard)}
          </div>
          <div className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <span className={`w-2 h-2 rounded-full ${COLUMN_DOT_CLASS.done}`} />
              {t("doneColumn")} ({filteredColumns.done.length})
            </h2>
            {filteredColumns.done.map((item) => (
              <QueueDoneCard
                key={item.consultationId}
                item={item}
                patient={patientById[item.patientId]}
                doctorName={doctorNameById[consultationById[item.consultationId]?.assignedDoctorId ?? ""]}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
