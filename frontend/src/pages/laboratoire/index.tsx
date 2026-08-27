import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { LabOrder, LabOrderStatus } from "@shared/schema";

function statusVariant(status: LabOrderStatus): "default" | "secondary" | "destructive" {
  if (status === "annule" || status === "probleme_signale") return "destructive";
  if (status === "termine") return "secondary";
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

  const statusQuery = statusFilter !== "all" ? `?status=${statusFilter}` : "";
  const { data: labOrders = [], isLoading } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}${statusQuery}`],
    enabled: !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  const counts = {
    demande: labOrders.filter((o) => o.status === "demande").length,
    en_cours: labOrders.filter((o) => o.status === "en_cours").length,
    a_valider: labOrders.filter((o) => o.status === "a_valider").length,
    termine: labOrders.filter((o) => o.status === "termine").length,
  };

  return (
    <div className="space-y-6" data-testid="laboratoire-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("laboratoireTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("laboratoireSubtitle")}</p>
        </div>
        <PolicyGuard policy={LabOrdersPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setLocation("/laboratoire/new")} data-testid="button-new-lab-order">
            <Plus className="w-4 h-4 mr-2" />
            {t("newLabOrder")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusDemande")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-demande">{counts.demande}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusEnCours")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-en-cours">{counts.en_cours}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusAValider")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-a-valider">{counts.a_valider}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusTermine")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-termine">{counts.termine}</p>
        </Card>
      </div>

      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as LabOrderStatus | "all")}>
        <SelectTrigger className="w-56" data-testid="select-status-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((status) => (
            <SelectItem key={status} value={status}>
              {status === "all" ? t("statusAll") : t(statusLabelKey(status))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : labOrders.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noLabOrders")}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("examTypesRequested")}</TableHead>
              <TableHead>{t("priorityLevelLabel")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {labOrders.map((order) => (
              <TableRow
                key={order.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => setLocation(`/laboratoire/${order.id}`)}
                data-testid={`row-lab-order-${order.id}`}>
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
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
