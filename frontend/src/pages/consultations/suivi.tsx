import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Bell, CheckCircle2, Clock, Folder } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import type { Consultation, LabOrder, Patient, Prescription, QueueItem } from "@shared/schema";

const OPEN_LAB_ORDER_STATUSES = new Set(["demande", "en_cours", "a_valider"]);
const OPEN_PRESCRIPTION_STATUSES = new Set(["en_attente", "prepare"]);

type FollowUpFilter = "all" | "pending" | "done" | "scheduled";

interface FollowUpRow {
  key: string;
  action: string;
  service: string;
  statusLabel: string;
  filterBucket: FollowUpFilter;
  date: string;
  href?: string;
}

interface NotificationRow {
  key: string;
  occurredAt: Date;
  message: string;
}

export default function Suivi() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<FollowUpFilter>("all");

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", consultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${consultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultation?.patientId,
  });

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
    refetchInterval: 15_000,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
    refetchInterval: 15_000,
  });

  const { data: queueItems = [] } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  useEffect(() => {
    if (consultation && consultation.closedAt === null) {
      setLocation(`/consultations/${consultationId}/resume-cloture`, { replace: true });
    }
  }, [consultation, consultationId, setLocation]);

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const rows: FollowUpRow[] = [
    ...labOrders.map((order) => ({
      key: `lab-${order.id}`,
      action: order.examLines.map((l) => l.examName).join(", "),
      service: t("followUpServiceLab"),
      statusLabel: t("labOrderStatus" + order.status[0].toUpperCase() + order.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())),
      filterBucket: (OPEN_LAB_ORDER_STATUSES.has(order.status) ? "pending" : "done") as FollowUpFilter,
      date: new Date(order.updatedAt).toLocaleDateString(),
      href: `/consultations/${consultationId}/suivi/${order.id}`,
    })),
    ...prescriptions.map((prescription) => ({
      key: `rx-${prescription.id}`,
      action: prescription.lines.map((l) => l.drugName).join(", "),
      service: t("followUpServicePharmacy"),
      statusLabel: t("prescriptionStatus" + prescription.status[0].toUpperCase() + prescription.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())),
      filterBucket: (OPEN_PRESCRIPTION_STATUSES.has(prescription.status) ? "pending" : "done") as FollowUpFilter,
      date: new Date(prescription.updatedAt).toLocaleDateString(),
      href: `/pharmacie/${prescription.id}`,
    })),
    ...(consultation.carePlan?.orientation === "controle_suivi"
      ? [
          {
            key: "appointment",
            action: consultation.carePlan.followUpReason,
            service: t("followUpServiceAppointment"),
            statusLabel: consultation.carePlan.appointmentDate,
            filterBucket: "scheduled" as FollowUpFilter,
            date: consultation.carePlan.appointmentDate,
          },
        ]
      : []),
  ];

  const filteredRows = filter === "all" ? rows : rows.filter((r) => r.filterBucket === filter);
  const urgentCount = 0;
  const pendingCount = rows.filter((r) => r.filterBucket === "pending").length;
  const completedCount = rows.filter((r) => r.filterBucket === "done").length;

  const notifications: NotificationRow[] = [
    ...labOrders
      .filter((o) => o.status === "termine")
      .map((o) => ({ key: `notif-lab-${o.id}`, occurredAt: new Date(o.updatedAt), message: `${t("patientTimelineLabResult")} — ${o.examLines.map((l) => l.examName).join(", ")}` })),
    ...prescriptions
      .filter((p) => p.status === "delivre" || p.status === "delivre_partiel")
      .map((p) => ({ key: `notif-rx-${p.id}`, occurredAt: new Date(p.updatedAt), message: `${t("patientTimelinePrescriptionDelivered")} — ${p.lines.map((l) => l.drugName).join(", ")}` })),
  ].sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  const queueItem = queueItems.find((item) => item.consultationId === consultationId);
  const timeline = queueItem?.timeline ?? [];

  return (
    <div className="space-y-6" data-testid="suivi-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("suiviTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("suiviSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <p className="text-lg font-semibold">{urgentCount} {t("urgentActionsLabel")}</p>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <Clock className="w-8 h-8 text-muted-foreground" />
          <p className="text-lg font-semibold">{pendingCount} {t("pendingActionsLabel")}</p>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-primary" />
          <p className="text-lg font-semibold">{completedCount} {t("completedActionsLabel")}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">{t("followUpActionsTableTitle")}</h2>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as FollowUpFilter)}>
              <TabsList>
                <TabsTrigger value="all">{t("followUpFilterAll")}</TabsTrigger>
                <TabsTrigger value="pending">{t("followUpFilterPending")}</TabsTrigger>
                <TabsTrigger value="done">{t("followUpFilterDone")}</TabsTrigger>
                <TabsTrigger value="scheduled">{t("followUpFilterScheduled")}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("examTypesRequested")}</TableHead>
                <TableHead>{t("followUpServiceLab")}/{t("followUpServicePharmacy")}</TableHead>
                <TableHead>{t("statusColumnLabel")}</TableHead>
                <TableHead>{t("dateOfBirth")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.key} data-testid={`row-followup-${row.key}`}>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>{row.service}</TableCell>
                  <TableCell><Badge>{row.statusLabel}</Badge></TableCell>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>
                    {row.href && (
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(row.href!)}>{t("viewLabel")}</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>

        <div className="space-y-6">
          <Card className="p-4 space-y-3">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Bell className="w-4 h-4" />
              {t("notificationsTitle")}
            </h2>
            {notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noHistoryEvents")}</p>
            ) : (
              notifications.map((n) => (
                <div key={n.key} className="flex items-start gap-2 text-sm border-b border-border pb-2 last:border-0">
                  <span className="text-muted-foreground shrink-0">{n.occurredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  <span>{n.message}</span>
                </div>
              ))
            )}
          </Card>

          <Card className="p-4 space-y-2">
            <h2 className="font-semibold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {t("timelineTitle")}
            </h2>
            <ol className="space-y-2">
              {timeline.map((entry, index) => (
                <li key={index} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</span>
                  <span>{entry.eventType}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}/dossier-medical`)}>
          <Folder className="w-4 h-4 mr-2" />
          {t("viewPatientRecordAction")}
        </Button>
        <Button variant="outline" onClick={() => setLocation("/consultations")}>
          {t("backToConsultationsAction")}
        </Button>
      </div>
    </div>
  );
}
