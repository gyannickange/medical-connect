import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { bucketQueueItems } from "@/lib/queueColumns";
import { QueueDoneCard } from "./queueCardHelpers";
import type { Consultation, Patient, QueueItem, User } from "@shared/schema";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function FileAttenteArchive() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const [date, setDate] = useState(todayIsoDate());

  const { data: queueItems = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id, "history", date],
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

  const { data: consultationsList = [] } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const consultationById = Object.fromEntries(consultationsList.map((consultation) => [consultation.id, consultation]));

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const doctorNameById = Object.fromEntries(staffList.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));

  const doneItems = bucketQueueItems(queueItems).done;

  return (
    <div className="space-y-6" data-testid="file-attente-archive-page">
      <Button variant="ghost" onClick={() => setLocation("/file-attente")} data-testid="button-back-to-queue">
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("queueTitle")}
      </Button>

      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("queueArchiveTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("queueArchiveSubtitle")}</p>
        </div>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayIsoDate()} data-testid="input-archive-date" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : doneItems.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noArchivedQueueEntries")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {doneItems.map((item) => (
            <QueueDoneCard
              key={item.consultationId}
              item={item}
              patient={patientById[item.patientId]}
              doctorName={doctorNameById[consultationById[item.consultationId]?.assignedDoctorId ?? ""]}
            />
          ))}
        </div>
      )}
    </div>
  );
}
