import React from "react";
import { useLocation } from "wouter";
import { Bell, CircleX, DoorOpen, FlaskConical, Users, type LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "@/lib/i18n";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePolicy } from "@/hooks/usePolicy";
import { QueuePolicy } from "@/lib/policies/queue.policy";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { RoomsPolicy } from "@/lib/policies/rooms.policy";
import { PatientsPolicy } from "@/lib/policies/patients.policy";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationTitle, notificationBody } from "@/lib/notifications";
import { relativeTimeSince } from "@/lib/relativeTime";
import { bucketQueueItems } from "@/lib/queueColumns";
import { calculateAge } from "@/lib/patientAge";
import { eventTime } from "@/pages/file-attente/queueCardHelpers";
import type { Consultation, LabOrder, Patient, QueueItem, Room } from "@shared/schema";

function relativeTimeLabel(t: (key: string) => string, date: Date): string {
  const { unit, amount } = relativeTimeSince(date);
  if (unit === "now") return t("relativeJustNow");
  if (unit === "minutes") return t("relativeMinutesAgo").replace("{count}", String(amount));
  if (unit === "hours") return t("relativeHoursAgo").replace("{count}", String(amount));
  return t("relativeDaysAgo").replace("{count}", String(amount));
}

function initials(patient: Patient): string {
  return `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase();
}

const QUEUE_STATUS_BADGE = {
  waiting: { labelKey: "waitingColumn", variant: "warning" as const },
  inConsultation: { labelKey: "inConsultationColumn", variant: "success" as const },
  done: { labelKey: "doneColumn", variant: "secondary" as const },
};

interface StatCardConfig {
  id: string;
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  subtitle?: string;
}

function StatCard({ icon: Icon, label, value, subtitle, testId }: StatCardConfig & { testId: string }) {
  return (
    <div className="glass-card rounded-xl p-5" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-3xl font-bold text-foreground">{value}</p>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { t, language } = useTranslation();
  const [, setLocation] = useLocation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const queuePolicy = usePolicy(QueuePolicy);
  const labOrdersPolicy = usePolicy(LabOrdersPolicy);
  const roomsPolicy = usePolicy(RoomsPolicy);
  const patientsPolicy = usePolicy(PatientsPolicy);
  const { notifications } = useNotifications();

  const canSeeQueue = queuePolicy.canView();
  const canSeeLabOrders = labOrdersPolicy.canView();
  const canSeeRooms = roomsPolicy.canView();
  const canSeePatients = patientsPolicy.canView();

  const { data: queueItems = [] } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: canSeeQueue && !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  const { data: patientsList = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: (canSeeQueue || canSeePatients) && !!currentTenant?.id,
  });
  const patientById = Object.fromEntries(patientsList.map((patient) => [patient.id, patient]));

  const { data: consultationsList = [] } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id],
    enabled: (canSeeQueue || canSeePatients) && !!currentTenant?.id,
  });
  const consultationById = Object.fromEntries(consultationsList.map((consultation) => [consultation.id, consultation]));

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}`],
    enabled: canSeeLabOrders && !!currentTenant?.id,
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ["/api/rooms", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: canSeeRooms && !!currentTenant?.id,
  });

  const columns = bucketQueueItems(queueItems);
  const waitingCount = columns.waiting.length;
  const averageWaitMinutes = waitingCount
    ? Math.round(columns.waiting.reduce((sum, item) => sum + (item.waitingSinceMs ?? 0), 0) / waitingCount / 60_000)
    : 0;
  const pendingLabOrdersCount = labOrders.filter((order) => order.status !== "termine" && order.status !== "annule").length;
  const availableRoomsCount = rooms.filter((room) => room.status === "disponible").length;

  const activeQueue = [
    ...columns.inConsultation.map((item) => ({ item, bucket: "inConsultation" as const })),
    ...columns.waiting.map((item) => ({ item, bucket: "waiting" as const })),
    ...columns.done.map((item) => ({ item, bucket: "done" as const })),
  ].slice(0, 6);

  const recentPatients: { patient: Patient; consultation: Consultation }[] = [];
  if (canSeePatients) {
    const sortedConsultations = [...consultationsList].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    const seenPatientIds = new Set<string>();
    for (const consultation of sortedConsultations) {
      if (seenPatientIds.has(consultation.patientId)) continue;
      const patient = patientById[consultation.patientId];
      if (!patient) continue;
      seenPatientIds.add(consultation.patientId);
      recentPatients.push({ patient, consultation });
      if (recentPatients.length >= 4) break;
    }
  }

  const doctorDisplayName =
    user?.role === "medecin" ? `Dr. ${user.lastName}` : [user?.firstName, user?.lastName].filter(Boolean).join(" ");

  const formattedDate = new Date().toLocaleDateString(language === "fr" ? "fr-FR" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const capitalizedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);

  const statCards: StatCardConfig[] = [];
  if (canSeeQueue) {
    statCards.push({
      id: "patientsToday",
      icon: Users,
      label: t("statPatientsTodayLabel"),
      value: queueItems.length,
    });
    statCards.push({
      id: "waiting",
      icon: CircleX,
      label: t("waitingColumn"),
      value: waitingCount,
      subtitle: `${t("averageWaitStatLabel")}: ${averageWaitMinutes} ${t("minutesShort")}`,
    });
  }
  if (canSeeLabOrders) {
    statCards.push({
      id: "labPending",
      icon: FlaskConical,
      label: t("statLabResultsPendingLabel"),
      value: pendingLabOrdersCount,
    });
  }
  if (canSeeRooms) {
    statCards.push({
      id: "roomsAvailable",
      icon: DoorOpen,
      label: t("statRoomsAvailableLabel"),
      value: `${availableRoomsCount}/${rooms.length}`,
    });
  }

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground" data-testid="dashboard-greeting">
          {t("dashboardGreeting")}, {doctorDisplayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {capitalizedDate} — {t("dashboardWelcomeSubtitle")}
        </p>
      </div>

      {statCards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <StatCard key={card.id} testId={`dashboard-stat-${card.id}`} {...card} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {canSeeQueue && (
          <div className="glass-card rounded-xl p-5 lg:col-span-2" data-testid="dashboard-queue-card">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CircleX className="h-[18px] w-[18px] text-primary" />
                <h2 className="font-semibold text-foreground">{t("queueSectionTitle")}</h2>
              </div>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-primary"
                onClick={() => setLocation("/file-attente")}
                data-testid="button-view-all-queue">
                {t("queueViewAllPrefix")} ({queueItems.length})
              </Button>
            </div>
            {activeQueue.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("queueEmptyState")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("queueColumnArrival")}</TableHead>
                    <TableHead>{t("queueColumnPatient")}</TableHead>
                    <TableHead>{t("queueColumnType")}</TableHead>
                    <TableHead>{t("queueColumnStatus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeQueue.map(({ item, bucket }) => {
                    const patient = patientById[item.patientId];
                    const consultation = consultationById[item.consultationId];
                    const badge = QUEUE_STATUS_BADGE[bucket];
                    const arrival = eventTime(item, ["arrived", "registered"]);
                    return (
                      <TableRow key={item.consultationId} data-testid={`dashboard-queue-row-${item.consultationId}`}>
                        <TableCell className="text-sm text-muted-foreground">{arrival ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                              {patient ? initials(patient) : "?"}
                            </div>
                            <span className="font-medium text-foreground">
                              {patient ? `${patient.firstName} ${patient.lastName}` : item.patientId}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {consultation?.reason ?? consultation?.specialty ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{t(badge.labelKey)}</Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        )}

        <div className={`glass-card rounded-xl p-5 ${canSeeQueue ? "" : "lg:col-span-3"}`} data-testid="dashboard-notifications-card">
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-[18px] w-[18px] text-primary" />
            <h2 className="font-semibold text-foreground">{t("recentNotificationsTitle")}</h2>
          </div>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noNotifications")}</p>
          ) : (
            <div className="space-y-3">
              {notifications.slice(0, 4).map((notification) => (
                <div
                  key={notification.id}
                  className="rounded-lg border border-border p-3"
                  data-testid={`dashboard-notification-${notification.id}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{notificationTitle(t, notification)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {relativeTimeLabel(t, new Date(notification.createdAt))}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{notificationBody(t, notification)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {canSeePatients && (
        <div className="glass-card rounded-xl p-5" data-testid="dashboard-recent-patients-card">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-[18px] w-[18px] text-primary" />
              <h2 className="font-semibold text-foreground">{t("recentPatientsTitle")}</h2>
            </div>
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-primary"
              onClick={() => setLocation("/patients")}
              data-testid="button-recent-patients-search">
              {t("recentPatientsSearchLink")}
            </Button>
          </div>
          {recentPatients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recentPatientsEmptyState")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {recentPatients.map(({ patient, consultation }) => (
                <div
                  key={patient.id}
                  className="rounded-lg border border-border p-4"
                  data-testid={`dashboard-recent-patient-${patient.id}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                      {initials(patient)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {patient.firstName} {patient.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {calculateAge(patient.dateOfBirth)}
                        {t("yearsOldSuffix")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("lastVisit")}</p>
                    <p className="truncate text-sm text-foreground">{consultation.reason}</p>
                  </div>
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2 h-auto p-0 text-primary"
                    onClick={() => setLocation(`/patients/${patient.id}/dossier-medical`)}
                    data-testid={`button-view-record-${patient.id}`}>
                    {t("viewRecord")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
