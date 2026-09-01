import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { ConsultationListCard } from "./ConsultationListCard";
import type { Consultation, Patient, User } from "@shared/schema";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ConsultationsArchive() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");

  const hasSearched = !!appliedStart && !!appliedEnd;

  const { data: consultationsList = [], isLoading } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id, "archive", appliedStart, appliedEnd],
    queryFn: async () => {
      const start = `${appliedStart}T00:00:00.000Z`;
      const end = `${appliedEnd}T23:59:59.999Z`;
      const response = await fetch(
        `/api/consultations/${currentTenant?.id}?scheduledOnOrAfter=${encodeURIComponent(start)}&scheduledOnOrBefore=${encodeURIComponent(end)}`,
        { credentials: "include" }
      );
      return response.json();
    },
    enabled: !!currentTenant?.id && hasSearched,
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

  function runSearch() {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
  }

  function resetSearch() {
    setStartDate("");
    setEndDate("");
    setAppliedStart("");
    setAppliedEnd("");
  }

  return (
    <div className="space-y-6" data-testid="consultations-archive-page">
      <Button variant="ghost" onClick={() => setLocation("/consultations")} data-testid="button-back-to-consultations">
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("consultationsArchiveTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("consultationsArchiveSubtitle")}</p>
      </div>

      <div className="glass-card rounded-xl p-4 flex flex-wrap items-end gap-4">
        <div>
          <Label className="text-sm text-muted-foreground block mb-1">{t("startDateLabel")}</Label>
          <DatePicker value={startDate} onValueChange={setStartDate} maxDate={endDate || todayIsoDate()} className="w-auto" data-testid="input-consultations-archive-start-date" />
        </div>
        <div>
          <Label className="text-sm text-muted-foreground block mb-1">{t("endDateLabel")}</Label>
          <DatePicker value={endDate} onValueChange={setEndDate} minDate={startDate} maxDate={todayIsoDate()} className="w-auto" data-testid="input-consultations-archive-end-date" />
        </div>
        <Button onClick={runSearch} disabled={!startDate || !endDate} data-testid="button-run-consultations-archive-search">
          {t("applyFilterAction")}
        </Button>
        <Button variant="ghost" onClick={resetSearch} data-testid="button-reset-consultations-archive-search">
          {t("resetFilterAction")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {!hasSearched ? (
          <div className="md:col-span-2 glass-card rounded-xl p-8 text-center text-muted-foreground">{t("launchSearchPrompt")}</div>
        ) : isLoading ? (
          <div className="md:col-span-2 flex items-center justify-center min-h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : consultationsList.length === 0 ? (
          <div className="md:col-span-2 glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noArchivedConsultations")}</div>
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
