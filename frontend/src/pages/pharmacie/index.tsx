import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import type { Prescription, PrescriptionStatus } from "@shared/schema";

function statusVariant(status: PrescriptionStatus): "default" | "secondary" | "destructive" {
  if (status === "annule") return "destructive";
  if (status === "delivre") return "secondary";
  return "default";
}

function statusLabelKey(status: string): string {
  return "prescriptionStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function PharmacieIndex() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();

  const { data: prescriptions = [], isLoading } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}`],
    enabled: !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  const pending = prescriptions.filter((p) => p.status === "en_attente" || p.status === "prepare");
  const delivered = prescriptions.filter((p) => p.status === "delivre" || p.status === "delivre_partiel");

  return (
    <div className="space-y-6" data-testid="pharmacie-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("pharmacieTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pharmacieSubtitle")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("prescriptionStatusEnAttente")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-en-attente">{pending.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("prescriptionStatusDelivre")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-delivre">{delivered.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("ordonnancesEnAttenteTitle")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-total">{prescriptions.length}</p>
        </Card>
      </div>

      <h2 className="font-semibold text-foreground">{t("ordonnancesEnAttenteTitle")}</h2>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noPrescriptions")}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("medicationsPrescribedSection")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prescriptions.map((prescription) => (
              <TableRow
                key={prescription.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => setLocation(`/pharmacie/${prescription.id}`)}
                data-testid={`row-prescription-${prescription.id}`}>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {prescription.lines.map((line, index) => (
                      <Badge key={index} variant="secondary">{line.drugName}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(prescription.status)}>{t(statusLabelKey(prescription.status))}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
