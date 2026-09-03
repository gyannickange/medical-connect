import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { ConsultationPriority, Patient } from "@shared/schema";

const inputClass = "bg-white border border-[#e2e8f0] rounded-[8px] px-3.5 py-3 text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] h-auto";
const labelClass = "font-semibold text-[#64748b] text-[13px]";
const sectionTitleClass = "font-bold text-[#0f172a] text-[16px]";

const PRIORITY_OPTIONS: { value: ConsultationPriority; dotColor: string; labelKey: string }[] = [
  { value: "normal", dotColor: "#10b981", labelKey: "priorityNormal" },
  { value: "urgent", dotColor: "#f59e0b", labelKey: "priorityUrgent" },
  { value: "tres_urgent", dotColor: "#ef4444", labelKey: "priorityTresUrgentShort" },
];

export default function QueueRegister() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [existingQuery, setExistingQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newLastName, setNewLastName] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [destinationService, setDestinationService] = useState("");
  const [requestedDoctorId, setRequestedDoctorId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<ConsultationPriority>("normal");

  const { data: existingResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, "queue-search", existingQuery],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}?q=${encodeURIComponent(existingQuery)}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id && existingQuery.length > 1 && !selectedPatient,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      let patientId = selectedPatient?.id;
      if (!patientId) {
        const patientResponse = await offlineApiRequest(
          "POST",
          "/api/patients",
          {
            lastName: newLastName,
            firstName: newFirstName,
            dateOfBirth: "1900-01-01",
            sex: "M",
            primaryPhone: newPhone,
            residenceAddress: "—",
            tenantId: currentTenant?.id,
          },
          { collection: "patients" }
        );
        const patient = await patientResponse.json();
        patientId = patient.id;
      }

      const consultationResponse = await offlineApiRequest(
        "POST",
        "/api/consultations",
        {
          patientId,
          scheduledAt: new Date().toISOString(),
          specialty: destinationService,
          assignedDoctorId: requestedDoctorId || (user?.id ?? ""),
          priority,
          reason,
          nurseNotes: notes || undefined,
          tenantId: currentTenant?.id,
        },
        { collection: "consultations" }
      );
      const consultation = await consultationResponse.json();

      await offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: consultation.id, patientId, eventType: "arrived", tenantId: currentTenant?.id },
        { collection: "queue" }
      );
      return offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: consultation.id, patientId, eventType: "registered", tenantId: currentTenant?.id },
        { collection: "queue" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      toast({ title: t("success"), description: t("queueEntryAddedSuccessfully") });
      setLocation("/file-attente");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  const canSubmit = selectedPatient || (newLastName && newFirstName && newPhone);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-[#0f172a] text-[24px]">{t("registerPatient")}</h1>
        <p className="font-medium text-[#64748b] text-[14px]">{t("registerPatientSubtitle")}</p>
      </div>

      <div className="bg-white border border-[#e2e8f0] rounded-[16px] shadow-sm flex flex-col gap-8 p-8 w-full" data-testid="queue-register-form">
        {/* Section 1 */}
        <div className="flex flex-col gap-5 w-full">
          <p className={sectionTitleClass}>{t("queueSection1Title")}</p>
          <div className="border-t border-[#e2e8f0]" />
          <div className="flex gap-6 items-start w-full">
            <div className="flex-1 flex flex-col gap-2">
              <Label className={labelClass}>{t("quickRegisterExistingRecord")}</Label>
              <div className="flex gap-2 items-center px-3.5 py-3 rounded-[8px] border border-[#e2e8f0] bg-[#f9fafb]">
                <Search className="w-3.5 h-3.5 text-[#94a3b8]" />
                <input
                  className="flex-1 bg-transparent outline-none text-[14px] text-[#0f172a] placeholder:text-[#94a3b8]"
                  placeholder={t("quickRegisterExistingPlaceholder")}
                  value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : existingQuery}
                  onChange={(e) => {
                    setSelectedPatient(null);
                    setExistingQuery(e.target.value);
                  }}
                  data-testid="input-queue-patient-search"
                />
              </div>
              {!selectedPatient && existingResults.length > 0 && (
                <div className="bg-white border border-[#e2e8f0] rounded-[8px] flex flex-col p-1 w-full shadow-md">
                  {existingResults.map((patient) => (
                    <button
                      type="button"
                      key={patient.id}
                      className="text-left px-3 py-2 rounded-[6px] hover:bg-accent text-[13px] text-[#475569]"
                      onClick={() => setSelectedPatient(patient)}
                      data-testid={`option-queue-patient-${patient.id}`}>
                      {patient.firstName} {patient.lastName} — {patient.dossierNumber ?? t("pendingSync")}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <Label className={labelClass}>{t("quickRegisterPhone")}</Label>
              <Input className={inputClass} placeholder="+237 6aa bbb ccc" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} disabled={!!selectedPatient} data-testid="input-newPhone" />
            </div>
          </div>
          {!selectedPatient && (
            <div className="flex gap-6 items-start w-full">
              <div className="flex-1 flex flex-col gap-2">
                <Label className={labelClass}>{t("lastName")}</Label>
                <Input className={inputClass} placeholder="Koffi" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} data-testid="input-newLastName" />
              </div>
              <div className="flex-1 flex flex-col gap-2">
                <Label className={labelClass}>{t("firstName")}</Label>
                <Input className={inputClass} placeholder="Emmanuel" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} data-testid="input-newFirstName" />
              </div>
            </div>
          )}
        </div>

        {/* Section 2 */}
        <div className="flex flex-col gap-5 w-full">
          <p className={sectionTitleClass}>{t("queueSection2Title")}</p>
          <div className="border-t border-[#e2e8f0]" />
          <div className="flex gap-6 items-start w-full">
            <div className="flex-1 flex flex-col gap-2">
              <Label className={labelClass}>{t("quickRegisterDestinationService")}</Label>
              <div className="relative">
                <Input className={`${inputClass} pr-9`} placeholder="Cardiologie" value={destinationService} onChange={(e) => setDestinationService(e.target.value)} data-testid="input-destinationService" />
                <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <Label className={labelClass}>{t("quickRegisterRequestedDoctor")}</Label>
              <div className="relative">
                <Input className={`${inputClass} pr-9`} placeholder="Dr. Mbarga" value={requestedDoctorId} onChange={(e) => setRequestedDoctorId(e.target.value)} data-testid="input-requestedDoctorId" />
                <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="flex gap-6 items-start w-full">
            <div className="flex-1 flex flex-col gap-2">
              <Label className={labelClass}>{t("quickRegisterVisitReason")}</Label>
              <Input className={inputClass} placeholder={t("quickRegisterVisitReasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-reason" />
            </div>
            <div className="flex-1 flex flex-col gap-2">
              <Label className={labelClass}>{t("priorityLevel")}</Label>
              <div className="flex gap-3 items-start w-full">
                {PRIORITY_OPTIONS.map((option) => {
                  const active = priority === option.value;
                  return (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => setPriority(option.value)}
                      className={`flex gap-2 items-center px-4 py-3 rounded-[8px] border ${
                        active ? "bg-[#ecfdf5] border-[#10b981]" : "bg-white border-[#e2e8f0]"
                      }`}
                      data-testid={`priority-pill-${option.value}`}>
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: option.dotColor }} />
                      <span className={`text-[13px] ${active ? "font-semibold" : "font-medium"}`} style={{ color: active ? "#10b981" : "#0f172a" }}>
                        {t(option.labelKey)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full">
            <Label className={labelClass}>{t("quickRegisterNotes")}</Label>
            <Textarea className={`${inputClass} h-[80px]`} placeholder={t("quickRegisterNotesPlaceholder")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="border-t border-[#e2e8f0] flex gap-4 items-start justify-end pt-2 w-full">
          <Button type="button" variant="outline" className="border-[#e2e8f0] text-[#64748b] font-semibold rounded-[10px] px-6 py-3 h-auto" onClick={() => setLocation("/file-attente")}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            className="bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-[10px] px-6 py-3 h-auto"
            disabled={registerMutation.isPending || !canSubmit}
            onClick={() => registerMutation.mutate()}
            data-testid="button-submit-queue-registration">
            {registerMutation.isPending ? t("saving") : t("addToQueue")}
          </Button>
        </div>
      </div>
    </div>
  );
}
