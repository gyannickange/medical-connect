import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CalendarDays, ChevronDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertConsultationSchema, type InsertConsultation, type Patient } from "@shared/schema";

const inputClass = "bg-white border border-[#e2e8f0] rounded-[8px] px-3 py-3 text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] h-auto";
const labelClass = "font-semibold text-[#475569] text-[13px]";

export default function ConsultationForm() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const { data: patientResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, "search", patientQuery],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}?q=${encodeURIComponent(patientQuery)}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id && patientQuery.length > 1 && !selectedPatient,
  });

  const form = useForm<InsertConsultation>({
    resolver: zodResolver(insertConsultationSchema),
    defaultValues: { patientId: "", scheduledAt: "", specialty: "", assignedDoctorId: "", priority: "normal", reason: "", tenantId: currentTenant?.id ?? "" },
  });
  const errors = form.formState.errors;

  const saveMutation = useMutation({
    mutationFn: async (data: InsertConsultation) => {
      const response = await offlineApiRequest("POST", "/api/consultations", { ...data, tenantId: currentTenant?.id }, { collection: "consultations" });
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/consultations"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("consultationSavedOffline") : t("consultationCreatedSuccessfully"),
      });
      setLocation("/consultations");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateConsultation"), t("networkRequestFailed"));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-[#0f172a] text-[24px]">{t("newConsultation")}</h1>
        <p className="font-medium text-[#64748b] text-[14px]">{t("newConsultationSubtitle")}</p>
      </div>

      <form
        onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
        className="bg-white border border-[#e2e8f0] rounded-[16px] shadow-sm flex flex-col gap-6 p-8 w-full"
        data-testid="consultation-form">
        <p className="font-bold text-[#0f172a] text-[18px]">{t("consultationRegistrationForm")}</p>
        <div className="border-t border-[#e2e8f0]" />

        <div className="flex gap-6 items-start w-full">
          <div className="flex-1 flex flex-col gap-2 relative">
            <Label className={labelClass}>{t("searchPatientToAssign")}</Label>
            <div className={`flex gap-2 items-center px-3 py-3 rounded-[8px] border ${selectedPatient ? "border-[#047857] border-[1.5px]" : "border-[#e2e8f0]"} bg-white`}>
              <Search className="w-4 h-4 text-[#64748b]" />
              <input
                className="flex-1 outline-none text-[14px] text-[#0f172a] placeholder:text-[#94a3b8]"
                placeholder={t("searchPatientPlaceholder")}
                value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : patientQuery}
                onChange={(e) => {
                  setSelectedPatient(null);
                  setPatientQuery(e.target.value);
                }}
                data-testid="input-consultation-patient-search"
              />
            </div>
            {!selectedPatient && patientResults.length > 0 && (
              <div className="bg-white border border-[#e2e8f0] rounded-[8px] flex flex-col p-1 w-full absolute top-full mt-1 z-10 shadow-md">
                {patientResults.map((patient, index) => (
                  <button
                    type="button"
                    key={patient.id}
                    className={`text-left px-3 py-2.5 rounded-[6px] text-[13px] ${index === 0 ? "bg-[#ecfdf5] text-[#047857] font-semibold" : "text-[#475569]"}`}
                    onClick={() => {
                      setSelectedPatient(patient);
                      form.setValue("patientId", patient.id, { shouldValidate: true });
                    }}
                    data-testid={`option-patient-${patient.id}`}>
                    {patient.firstName} {patient.lastName} ({patient.dossierNumber ?? t("pendingSync")})
                  </button>
                ))}
              </div>
            )}
            {errors.patientId && <p className="text-sm text-destructive">{t("patientRequired")}</p>}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("scheduledDateTime")}</Label>
            <div className="relative">
              <Input type="datetime-local" className={`${inputClass} pr-9`} {...form.register("scheduledAt")} data-testid="input-scheduledAt" />
              <CalendarDays className="w-4 h-4 text-[#64748b] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {errors.scheduledAt && <p className="text-sm text-destructive">{errors.scheduledAt.message}</p>}
          </div>
        </div>

        <div className="flex gap-6 items-start w-full">
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("specialty")}</Label>
            <div className="relative">
              <Input className={`${inputClass} pr-9`} placeholder="Cardiologie" {...form.register("specialty")} data-testid="input-specialty" />
              <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {errors.specialty && <p className="text-sm text-destructive">{errors.specialty.message}</p>}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("assignedDoctor")}</Label>
            <div className="relative">
              <Input className={`${inputClass} pr-9`} placeholder="Dr. Mbarga (Cardiologue)" {...form.register("assignedDoctorId")} data-testid="input-assignedDoctorId" />
              <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
            {errors.assignedDoctorId && <p className="text-sm text-destructive">{errors.assignedDoctorId.message}</p>}
          </div>
        </div>

        <div className="flex gap-6 items-start w-full">
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("assignedRoom")}</Label>
            <div className="relative">
              <Input className={`${inputClass} pr-9`} placeholder="Salle de cardiologie 104" {...form.register("roomId")} />
              <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("priority")}</Label>
            <RadioGroup
              className="flex gap-4 items-center pt-2"
              value={form.watch("priority")}
              onValueChange={(value) => form.setValue("priority", value as InsertConsultation["priority"])}>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="normal" id="c-priority-normal" />
                <Label htmlFor="c-priority-normal" className="text-[#0f172a] text-[14px] font-semibold">{t("priorityNormal")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="urgent" id="c-priority-urgent" />
                <Label htmlFor="c-priority-urgent" className="text-[#475569] text-[14px] font-normal">{t("priorityUrgent")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="tres_urgent" id="c-priority-tres-urgent" />
                <Label htmlFor="c-priority-tres-urgent" className="text-[#475569] text-[14px] font-normal">{t("priorityTresUrgent")}</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <div className="flex flex-col gap-2 w-full">
          <Label className={labelClass}>{t("visitReason")}</Label>
          <Textarea className={`${inputClass} h-[80px]`} placeholder={t("visitReasonPlaceholder")} {...form.register("reason")} data-testid="input-reason" />
          {errors.reason && <p className="text-sm text-destructive">{errors.reason.message}</p>}
        </div>

        <div className="flex flex-col gap-2 w-full">
          <Label className={labelClass}>{t("nursePreliminaryNotes")}</Label>
          <Textarea className={`${inputClass} h-[80px]`} placeholder={t("nursePreliminaryNotesPlaceholder")} {...form.register("nurseNotes")} />
        </div>

        <div className="border-t border-[#e2e8f0] flex gap-4 items-start justify-end pt-2 w-full">
          <Button type="button" variant="outline" className="border-[#e2e8f0] text-[#475569] font-semibold rounded-[8px] px-5 py-2.5 h-auto" onClick={() => setLocation("/consultations")}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            className="bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-[8px] px-6 py-2.5 h-auto shadow-sm"
            disabled={saveMutation.isPending}
            data-testid="button-save-consultation">
            {saveMutation.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
