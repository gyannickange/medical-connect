import React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "../../lib/i18n";
import type { Consultation, Patient } from "@shared/schema";

function statusVariant(status: Consultation["status"]): "default" | "secondary" | "destructive" | "success" {
  if (status === "annulee") return "destructive";
  if (status === "terminee") return "success";
  return "default";
}

function statusLabelKey(status: string): string {
  return "consultationStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export interface ConsultationListCardProps {
  consultation: Consultation;
  patient?: Patient;
  doctorName: string;
}

export function ConsultationListCard({ consultation, patient, doctorName }: ConsultationListCardProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const patientName = patient ? `${patient.firstName} ${patient.lastName}` : consultation.patientId;
  const patientInitials = patient ? `${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase() : "?";
  const scheduledTime = new Date(consultation.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="glass-card rounded-xl p-6 space-y-4" data-testid={`row-consultation-${consultation.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{patientInitials}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-foreground">{patientName}</p>
            <p className="text-sm text-muted-foreground">
              {t("specialtyLabel")} <span className="text-primary font-medium">{consultation.specialty}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="secondary">{scheduledTime}</Badge>
          <Badge variant={statusVariant(consultation.status)}>{t(statusLabelKey(consultation.status))}</Badge>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("visitReasonSectionLabel")}</p>
        <p className="text-sm text-foreground">{consultation.reason}</p>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-sm text-foreground">
          <span className="text-muted-foreground">{t("doctorLabel")}</span> {doctorName}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLocation(`/consultations/${consultation.id}`)}
            data-testid={`button-open-consultation-${consultation.id}`}>
            {t("openConsultationAction")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation(`/patients/${consultation.patientId}/dossier-medical`)}
            data-testid={`button-open-dossier-${consultation.id}`}>
            {t("viewDossierMedicalAction")}
          </Button>
        </div>
      </div>
    </div>
  );
}
