import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

interface ConsultationFormModalProps {
  open: boolean;
  onClose: () => void;
}

export function ConsultationFormModal({ open, onClose }: ConsultationFormModalProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const { data: patientResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, "search", patientQuery],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}?q=${encodeURIComponent(patientQuery)}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id && patientQuery.length > 1,
  });

  const form = useForm<InsertConsultation>({
    resolver: zodResolver(insertConsultationSchema),
    defaultValues: { patientId: "", scheduledAt: "", specialty: "", assignedDoctorId: "", priority: "normal", reason: "", tenantId: currentTenant?.id ?? "" },
  });

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
      handleClose();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateConsultation"), t("networkRequestFailed"));
    },
  });

  function handleClose() {
    form.reset({ patientId: "", scheduledAt: "", specialty: "", assignedDoctorId: "", priority: "normal", reason: "", tenantId: currentTenant?.id ?? "" });
    setSelectedPatient(null);
    setPatientQuery("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newConsultation")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4 mt-4">
          <div>
            <Label>{t("searchPatientToAssign")}</Label>
            <Input
              value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : patientQuery}
              onChange={(e) => {
                setSelectedPatient(null);
                setPatientQuery(e.target.value);
              }}
              className="glass-input"
              data-testid="input-consultation-patient-search"
            />
            {!selectedPatient && patientResults.length > 0 && (
              <div className="border border-border rounded-lg mt-1 overflow-hidden">
                {patientResults.map((patient) => (
                  <button
                    type="button"
                    key={patient.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent"
                    onClick={() => {
                      setSelectedPatient(patient);
                      form.setValue("patientId", patient.id, { shouldValidate: true });
                    }}
                    data-testid={`option-patient-${patient.id}`}>
                    {patient.firstName} {patient.lastName} — {patient.dossierNumber ?? t("pendingSync")}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scheduledAt">{t("scheduledDateTime")}</Label>
              <Input id="scheduledAt" type="datetime-local" className="glass-input" {...form.register("scheduledAt")} />
            </div>
            <div>
              <Label htmlFor="specialty">{t("specialty")}</Label>
              <Input id="specialty" className="glass-input" {...form.register("specialty")} />
            </div>
            <div>
              <Label htmlFor="assignedDoctorId">{t("assignedDoctor")}</Label>
              <Input id="assignedDoctorId" className="glass-input" {...form.register("assignedDoctorId")} />
            </div>
            <div>
              <Label htmlFor="roomId">{t("assignedRoom")}</Label>
              <Input id="roomId" className="glass-input" {...form.register("roomId")} />
            </div>
          </div>

          <div>
            <Label>{t("priority")}</Label>
            <RadioGroup
              value={form.watch("priority")}
              onValueChange={(value) => form.setValue("priority", value as InsertConsultation["priority"])}
              className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="normal" id="priority-normal" />
                <Label htmlFor="priority-normal">{t("priorityNormal")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="urgent" id="priority-urgent" />
                <Label htmlFor="priority-urgent">{t("priorityUrgent")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tres_urgent" id="priority-tres-urgent" />
                <Label htmlFor="priority-tres-urgent">{t("priorityTresUrgent")}</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="reason">{t("visitReason")}</Label>
            <Textarea id="reason" className="glass-input" {...form.register("reason")} />
          </div>

          <div>
            <Label htmlFor="nurseNotes">{t("nursePreliminaryNotes")}</Label>
            <Textarea id="nurseNotes" className="glass-input" {...form.register("nurseNotes")} />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>{t("cancel")}</Button>
            <Button type="submit" className="btn-primary" disabled={saveMutation.isPending} data-testid="button-save-consultation">
              {saveMutation.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
