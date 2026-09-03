import React from "react";
import { Activity, Plus, FileText, FlaskConical, Printer } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PolicyGuard } from "@/components/PolicyGuard";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { useTranslation } from "../../lib/i18n";
import { relativeTimeSince } from "@/lib/relativeTime";
import type { Patient } from "@shared/schema";

function relativeTimeLabel(t: (key: string) => string, date: Date): string {
  const { unit, amount } = relativeTimeSince(date);
  if (unit === "now") return t("relativeJustNow");
  if (unit === "minutes") return t("relativeMinutesAgo").replace("{count}", String(amount));
  if (unit === "hours") return t("relativeHoursAgo").replace("{count}", String(amount));
  return t("relativeDaysAgo").replace("{count}", String(amount));
}

function statusVariant(status: Patient["status"]): "default" | "secondary" | "destructive" {
  if (status === "hospitalise") return "destructive";
  if (status === "inactif") return "secondary";
  return "default";
}

function DisabledActionButton({ label, icon }: { label: string; icon: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button variant="outline" disabled className="pointer-events-none">
            {icon}
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("availableInFuturePhase")}</TooltipContent>
    </Tooltip>
  );
}

export interface PatientHeaderProps {
  patient: Patient;
}

export default function PatientHeader({ patient }: PatientHeaderProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-4" data-testid="patient-header">
      <div className="space-y-1">
        <h1 className="text-xl font-display font-bold text-foreground" data-testid="text-patient-file-heading">
          {t("patientFileHeading")} – {patient.firstName} {patient.lastName}
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant(patient.status)} className="gap-1" data-testid="badge-patient-status">
            <Activity className="w-3.5 h-3.5" />
            {t(`patientStatus${patient.status[0].toUpperCase()}${patient.status.slice(1)}`)}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t("lastUpdatedPrefix")} {relativeTimeLabel(t, new Date(patient.updatedAt))}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <PolicyGuard policy={ConsultationsPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/new?patientId=${patient.id}`)} data-testid="button-new-consultation">
            <Plus className="w-4 h-4 mr-2" />
            {t("newConsultation")}
          </Button>
        </PolicyGuard>
        <DisabledActionButton label={t("prescribeAction")} icon={<FileText className="w-4 h-4 mr-2" />} />
        <DisabledActionButton label={t("requestLabAnalysisAction")} icon={<FlaskConical className="w-4 h-4 mr-2" />} />
        <Button variant="outline" onClick={() => window.print()} data-testid="button-print-dossier">
          <Printer className="w-4 h-4 mr-2" />
          {t("printDossierAction")}
        </Button>
      </div>
    </div>
  );
}
