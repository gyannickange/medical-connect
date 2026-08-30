import React, { useState } from "react";
import { AlertCircle, CheckCircle2, Clock, Loader2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { ExamTypesPolicy } from "@/lib/policies/examTypes.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { cn } from "@/lib/utils";
import type { LabOrder, LabOrderStatus, Patient, User } from "@shared/schema";

function statusVariant(status: LabOrderStatus): "default" | "secondary" | "destructive" | "warning" {
  if (status === "annule" || status === "probleme_signale") return "destructive";
  if (status === "termine") return "secondary";
  if (status === "demande") return "warning";
  return "default";
}

function statusLabelKey(status: string): string {
  return "labOrderStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const STATUS_FILTERS: (LabOrderStatus | "all")[] = ["all", "demande", "en_cours", "a_valider", "termine"];

export default function LaboratoireIndex() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | "all">("all");

  const { data: labOrders = [], isLoading } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}`],
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

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const doctorNameById = Object.fromEntries(staffList.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));

  const counts = {
    demande: labOrders.filter((o) => o.status === "demande").length,
    en_cours: labOrders.filter((o) => o.status === "en_cours").length,
    a_valider: labOrders.filter((o) => o.status === "a_valider").length,
    termine: labOrders.filter((o) => o.status === "termine").length,
  };

  const filteredOrders = statusFilter === "all" ? labOrders : labOrders.filter((o) => o.status === statusFilter);

  return (
    <div className="space-y-6" data-testid="laboratoire-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("laboratoireTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("laboratoireSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <PolicyGuard policy={ExamTypesPolicy} action="canView">
            <Button variant="outline" onClick={() => setLocation("/laboratoire/exam-types")} data-testid="button-manage-exam-types">
              {t("examTypesManagerTitle")}
            </Button>
          </PolicyGuard>
          <PolicyGuard policy={LabOrdersPolicy} action="canCreate">
            <Button className="btn-primary" onClick={() => setLocation("/laboratoire/new")} data-testid="button-new-lab-order">
              <Plus className="w-4 h-4 mr-2" />
              {t("newLabOrder")}
            </Button>
          </PolicyGuard>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card rounded-xl p-5 flex items-center justify-between" data-testid="stat-demande">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("labOrderStatusDemande")}</p>
            <p className="text-2xl font-bold text-foreground">{counts.demande}</p>
          </div>
          <span className="flex items-center justify-center rounded-full bg-amber-500/10 size-10"><Clock className="w-5 h-5 text-amber-600" /></span>
        </div>
        <div className="glass-card rounded-xl p-5 flex items-center justify-between" data-testid="stat-en-cours">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("labOrderStatusEnCours")}</p>
            <p className="text-2xl font-bold text-foreground">{counts.en_cours}</p>
          </div>
          <span className="flex items-center justify-center rounded-full bg-primary/10 size-10"><Loader2 className="w-5 h-5 text-primary" /></span>
        </div>
        <div className="glass-card rounded-xl p-5 flex items-center justify-between" data-testid="stat-a-valider">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("labOrderStatusAValider")}</p>
            <p className="text-2xl font-bold text-foreground">{counts.a_valider}</p>
          </div>
          <span className="flex items-center justify-center rounded-full bg-red-500/10 size-10"><AlertCircle className="w-5 h-5 text-red-600" /></span>
        </div>
        <div className="glass-card rounded-xl p-5 flex items-center justify-between" data-testid="stat-termine">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{t("labOrderStatusTermine")}</p>
            <p className="text-2xl font-bold text-foreground">{counts.termine}</p>
          </div>
          <span className="flex items-center justify-center rounded-full bg-emerald-500/10 size-10"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></span>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border pb-1">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(status)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium",
              statusFilter === status ? "bg-primary/10 border border-primary text-primary font-semibold" : "text-muted-foreground"
            )}
            data-testid={`tab-status-${status}`}>
            {status === "all" ? t("statusAll") : t(statusLabelKey(status))}
            <span className={cn("rounded-full px-1.5 py-0.5 text-xs", statusFilter === status ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {status === "all" ? labOrders.length : labOrders.filter((o) => o.status === status).length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noLabOrders")}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("requestedAtLabel")}</TableHead>
              <TableHead>{t("patientLabel")}</TableHead>
              <TableHead>{t("prescribingDoctorLabel")}</TableHead>
              <TableHead>{t("examTypesRequested")}</TableHead>
              <TableHead>{t("priorityLevelLabel")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredOrders.map((order) => {
              const patient = patientById[order.patientId];
              return (
                <TableRow
                  key={order.id}
                  className={cn("cursor-pointer hover:bg-accent/50", order.status === "demande" && "border-l-4 border-l-amber-500")}
                  onClick={() => setLocation(`/laboratoire/${order.id}`)}
                  data-testid={`row-lab-order-${order.id}`}>
                  <TableCell>{new Date(order.requestedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</TableCell>
                  <TableCell>
                    {patient ? (
                      <div>
                        <p className="font-medium text-foreground">{patient.firstName} {patient.lastName}</p>
                        <p className="text-xs text-muted-foreground">{patient.dossierNumber ?? t("pendingSync")}</p>
                      </div>
                    ) : "—"}
                  </TableCell>
                  <TableCell>{doctorNameById[order.requestedByUserId] ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {order.examLines.map((line, index) => (
                        <Badge key={index} variant="secondary">{line.examName}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{t(order.priority === "urgent" ? "priorityUrgent" : "priorityNormal")}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(order.status)}>{t(statusLabelKey(order.status))}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
