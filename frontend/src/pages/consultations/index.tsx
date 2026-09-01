import React from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { ConsultationListCard } from "./ConsultationListCard";
import type { Consultation, Patient, User } from "@shared/schema";

function todayRange(): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function Consultations() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();

  const { data: consultationsList = [], isLoading } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id, "today"],
    queryFn: async () => {
      const { start, end } = todayRange();
      const response = await fetch(
        `/api/consultations/${currentTenant?.id}?scheduledOnOrAfter=${encodeURIComponent(start)}&scheduledOnOrBefore=${encodeURIComponent(end)}`,
        { credentials: "include" }
      );
      return response.json();
    },
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
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation("/consultations/archive")} data-testid="button-view-consultations-archive">
            {t("viewArchiveAction")}
          </Button>
          <PolicyGuard policy={ConsultationsPolicy} action="canCreate">
            <Button className="btn-primary" onClick={() => setLocation("/consultations/new")} data-testid="button-add-consultation">
              <Plus className="w-4 h-4 mr-2" />
              {t("newConsultation")}
            </Button>
          </PolicyGuard>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {isLoading ? (
          <div className="md:col-span-2 flex items-center justify-center min-h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : consultationsList.length === 0 ? (
          <div className="md:col-span-2 glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noConsultationsToday")}</div>
        ) : (
          consultationsList.map((consultation) => (
            <ConsultationListCard
              key={consultation.id}
              consultation={consultation}
              patient={patientById[consultation.patientId]}
              doctorName={doctorNameById[consultation.assignedDoctorId] ?? consultation.assignedDoctorId}
            />
          ))
        )}
      </div>
    </div>
  );
}
