import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "wouter";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { useDoctors } from "@/hooks/useStaffDirectory";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertConsultationSchema, type InsertConsultation, type Consultation, type Patient, type Room, type Service } from "@shared/schema";

const inputClass = "bg-card border border-border rounded-[8px] px-3 py-3 text-[14px] text-foreground placeholder:text-muted-foreground h-auto";
const disabledFieldClass = "bg-muted border border-border rounded-[8px] px-3 py-3 flex items-center";
const labelClass = "font-semibold text-secondary-foreground text-[13px]";

function defaultValuesFor(consultation: Consultation | null, tenantId: string): InsertConsultation {
  if (!consultation) {
    return { patientId: "", scheduledAt: "", specialty: "", assignedDoctorId: "", priority: "normal", reason: "", tenantId };
  }
  return {
    patientId: consultation.patientId,
    scheduledAt: consultation.scheduledAt,
    specialty: consultation.specialty,
    assignedDoctorId: consultation.assignedDoctorId,
    roomId: consultation.roomId ?? "",
    priority: consultation.priority,
    reason: consultation.reason,
    nurseNotes: consultation.nurseNotes ?? "",
    tenantId,
  };
}

export interface ConsultationFormFieldsProps {
  consultationId?: string;
}

export default function ConsultationFormFields({ consultationId: editingId }: ConsultationFormFieldsProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const prefillPatientId = searchParams.get("patientId") ?? "";
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const doctors = useDoctors();
  const doctorOptions = doctors.map((doctor) => ({ value: doctor.id, label: `${doctor.firstName} ${doctor.lastName}` }));

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const activeServices = services.filter((service) => service.isActive);

  const { data: existingConsultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", editingId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${editingId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!editingId,
  });

  const { data: assignedPatient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", existingConsultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${existingConsultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!existingConsultation?.patientId,
  });

  const { data: patientResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, "search", patientQuery],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}?q=${encodeURIComponent(patientQuery)}`, { credentials: "include" });
      return response.json();
    },
    enabled: !editingId && !!currentTenant?.id && patientQuery.length > 1 && !selectedPatient,
  });

  const { data: prefillPatient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", prefillPatientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${prefillPatientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !editingId && !!prefillPatientId,
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ["/api/rooms", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  const form = useForm<InsertConsultation>({
    resolver: zodResolver(insertConsultationSchema),
    defaultValues: defaultValuesFor(null, currentTenant?.id ?? ""),
  });

  useEffect(() => {
    if (existingConsultation) form.reset(defaultValuesFor(existingConsultation, currentTenant?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingConsultation, currentTenant?.id]);

  useEffect(() => {
    if (prefillPatient && !editingId) {
      setSelectedPatient(prefillPatient);
      form.setValue("patientId", prefillPatient.id, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPatient, editingId]);

  const errors = form.formState.errors;

  const saveMutation = useMutation({
    mutationFn: async (data: InsertConsultation) => {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `/api/consultations/${editingId}` : "/api/consultations";
      const response = await offlineApiRequest(method, url, { ...data, tenantId: currentTenant?.id }, { collection: "consultations" });
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/consultations"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("consultationSavedOffline") : editingId ? t("consultationUpdatedSuccessfully") : t("consultationCreatedSuccessfully"),
      });
      setLocation(editingId ? `/consultations/${editingId}` : "/consultations");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), editingId ? t("failedToUpdateConsultation") : t("failedToCreateConsultation"), t("networkRequestFailed"));
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-bold text-foreground text-[24px]">{editingId ? t("editConsultation") : t("newConsultation")}</h1>
        <p className="font-medium text-muted-foreground text-[14px]">{editingId ? t("editConsultationSubtitle") : t("newConsultationSubtitle")}</p>
      </div>

      <form
        onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
        className="bg-card border border-border rounded-[16px] shadow-sm flex flex-col gap-6 p-8 w-full"
        data-testid="consultation-form">
        <p className="font-bold text-foreground text-[18px]">{t("consultationRegistrationForm")}</p>
        <div className="border-t border-border" />

        <div className="flex gap-6 items-start w-full">
          <div className="flex-1 flex flex-col gap-2 relative">
            <Label className={labelClass}>{t("searchPatientToAssign")}</Label>
            {editingId ? (
              <div className={disabledFieldClass}>
                <span className="text-foreground text-[14px]">
                  {assignedPatient ? `${assignedPatient.firstName} ${assignedPatient.lastName}` : t("loading")}
                </span>
              </div>
            ) : (
              <>
                <div className={`flex gap-2 items-center px-3 py-3 rounded-[8px] border ${selectedPatient ? "border-primary border-[1.5px]" : "border-border"} bg-card`}>
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <input
                    className="flex-1 outline-none bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground"
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
                  <div className="bg-card border border-border rounded-[8px] flex flex-col p-1 w-full absolute top-full mt-1 z-10 shadow-md">
                    {patientResults.map((patient, index) => (
                      <button
                        type="button"
                        key={patient.id}
                        className={`text-left px-3 py-2.5 rounded-[6px] text-[13px] ${index === 0 ? "bg-accent text-primary font-semibold" : "text-secondary-foreground"}`}
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
              </>
            )}
            {errors.patientId && <p className="text-sm text-destructive">{t("patientRequired")}</p>}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("scheduledDateTime")}</Label>
            <DateTimePicker
              value={typeof form.watch("scheduledAt") === "string" ? (form.watch("scheduledAt") as string) : ""}
              onValueChange={(value) => form.setValue("scheduledAt", value, { shouldValidate: true })}
              className={inputClass}
              data-testid="input-scheduledAt"
            />
            {errors.scheduledAt && <p className="text-sm text-destructive">{errors.scheduledAt.message}</p>}
          </div>
        </div>

        <div className="flex gap-6 items-start w-full">
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("specialty")}</Label>
            <Select
              value={form.watch("specialty") ?? ""}
              onValueChange={(value) => form.setValue("specialty", value, { shouldValidate: true })}
              disabled={activeServices.length === 0}>
              <SelectTrigger className={inputClass} data-testid="select-specialty">
                <SelectValue placeholder={activeServices.length === 0 ? t("noServicesAvailable") : t("selectServicePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {activeServices.map((service) => (
                  <SelectItem key={service.id} value={service.name}>{service.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.specialty && <p className="text-sm text-destructive">{errors.specialty.message}</p>}
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("assignedDoctor")}</Label>
            <Combobox
              options={doctorOptions}
              value={form.watch("assignedDoctorId") ?? ""}
              onValueChange={(value) => form.setValue("assignedDoctorId", value, { shouldValidate: true })}
              placeholder={t("selectDoctorPlaceholder")}
              searchPlaceholder={t("searchDoctorPlaceholder")}
              emptyText={t("noDoctorsFound")}
              className={inputClass}
              data-testid="combobox-assignedDoctorId"
            />
            {errors.assignedDoctorId && <p className="text-sm text-destructive">{errors.assignedDoctorId.message}</p>}
          </div>
        </div>

        <div className="flex gap-6 items-start w-full">
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("assignedRoom")}</Label>
            <Select value={form.watch("roomId") ?? ""} onValueChange={(value) => form.setValue("roomId", value)}>
              <SelectTrigger className={inputClass} data-testid="select-consultation-room">
                <SelectValue placeholder={t("noRoomAssigned")} />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.number} — {room.type}
                  </SelectItem>
                ))}
                {form.watch("roomId") && !rooms.some((r) => r.id === form.watch("roomId")) && (
                  <SelectItem value={form.watch("roomId") as string} disabled>
                    {form.watch("roomId")}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("priority")}</Label>
            <RadioGroup
              className="flex gap-4 items-center pt-2"
              value={form.watch("priority")}
              onValueChange={(value) => form.setValue("priority", value as InsertConsultation["priority"])}>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="normal" id="c-priority-normal" />
                <Label htmlFor="c-priority-normal" className="text-foreground text-[14px] font-semibold">{t("priorityNormal")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="urgent" id="c-priority-urgent" />
                <Label htmlFor="c-priority-urgent" className="text-secondary-foreground text-[14px] font-normal">{t("priorityUrgent")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="tres_urgent" id="c-priority-tres-urgent" />
                <Label htmlFor="c-priority-tres-urgent" className="text-secondary-foreground text-[14px] font-normal">{t("priorityTresUrgent")}</Label>
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

        <div className="border-t border-border flex gap-4 items-start justify-end pt-2 w-full">
          <Button
            type="button"
            variant="outline"
            className="font-semibold rounded-[8px] px-5 py-2.5 h-auto"
            onClick={() => setLocation(editingId ? `/consultations/${editingId}` : "/consultations")}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            className="font-semibold rounded-[8px] px-6 py-2.5 h-auto shadow-sm"
            disabled={saveMutation.isPending}
            data-testid="button-save-consultation">
            {saveMutation.isPending ? t("saving") : t("save")}
          </Button>
        </div>
      </form>
    </div>
  );
}
