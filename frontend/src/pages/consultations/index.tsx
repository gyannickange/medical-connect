import React from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Consultation, Patient, User } from "@shared/schema";

function statusVariant(status: Consultation["status"]): "default" | "secondary" | "destructive" | "success" {
  if (status === "annulee") return "destructive";
  if (status === "terminee") return "success";
  return "default";
}

function statusLabelKey(status: string): string {
  return "consultationStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function Consultations() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();

  const { data: consultationsList = [], isLoading } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id],
    enabled: !!currentTenant?.id,
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

  return (
    <div className="space-y-6" data-testid="consultations-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("consultations")}</h1>
          <p className="text-sm text-muted-foreground">{t("consultationsOfTheDay")}</p>
        </div>
        <PolicyGuard policy={ConsultationsPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setLocation("/consultations/new")} data-testid="button-add-consultation">
            <Plus className="w-4 h-4 mr-2" />
            {t("newConsultation")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="md:col-span-2 flex items-center justify-center min-h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : consultationsList.length === 0 ? (
          <div className="md:col-span-2 glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noConsultationsToday")}</div>
        ) : (
          consultationsList.map((consultation) => {
            const patient = patientById[consultation.patientId];
            const patientName = patient ? `${patient.firstName} ${patient.lastName}` : consultation.patientId;
            const patientInitials = patient ? `${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase() : "?";
            const doctorName = doctorNameById[consultation.assignedDoctorId] ?? consultation.assignedDoctorId;
            const scheduledTime = new Date(consultation.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

            return (
              <div
                key={consultation.id}
                className="glass-card rounded-xl p-6 space-y-4"
                data-testid={`row-consultation-${consultation.id}`}>
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
          })
        )}
      </div>
    </div>
  );
}
