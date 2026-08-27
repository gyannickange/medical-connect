import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { ConsultationPriority, Patient } from "@shared/schema";

interface QueueRegistrationModalProps {
  open: boolean;
  onClose: () => void;
}

export function QueueRegistrationModal({ open, onClose }: QueueRegistrationModalProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      handleClose();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  function handleClose() {
    setExistingQuery("");
    setSelectedPatient(null);
    setNewLastName("");
    setNewFirstName("");
    setNewPhone("");
    setDestinationService("");
    setRequestedDoctorId("");
    setReason("");
    setNotes("");
    setPriority("normal");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("registerPatient")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label>{t("quickRegisterExistingRecord")}</Label>
            <Input
              value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : existingQuery}
              onChange={(e) => {
                setSelectedPatient(null);
                setExistingQuery(e.target.value);
              }}
              className="glass-input"
              data-testid="input-queue-patient-search"
            />
            {!selectedPatient && existingResults.length > 0 && (
              <div className="border border-border rounded-lg mt-1 overflow-hidden">
                {existingResults.map((patient) => (
                  <button
                    type="button"
                    key={patient.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent"
                    onClick={() => setSelectedPatient(patient)}
                    data-testid={`option-queue-patient-${patient.id}`}>
                    {patient.firstName} {patient.lastName} — {patient.dossierNumber ?? t("pendingSync")}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!selectedPatient && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="newLastName">{t("lastName")}</Label>
                <Input id="newLastName" className="glass-input" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="newFirstName">{t("firstName")}</Label>
                <Input id="newFirstName" className="glass-input" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="newPhone">{t("quickRegisterPhone")}</Label>
                <Input id="newPhone" className="glass-input" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="destinationService">{t("quickRegisterDestinationService")}</Label>
              <Input id="destinationService" className="glass-input" value={destinationService} onChange={(e) => setDestinationService(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="requestedDoctorId">{t("quickRegisterRequestedDoctor")}</Label>
              <Input id="requestedDoctorId" className="glass-input" value={requestedDoctorId} onChange={(e) => setRequestedDoctorId(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="reason">{t("quickRegisterVisitReason")}</Label>
            <Textarea id="reason" className="glass-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div>
            <Label>{t("priority")}</Label>
            <RadioGroup value={priority} onValueChange={(value) => setPriority(value as ConsultationPriority)} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="normal" id="queue-priority-normal" />
                <Label htmlFor="queue-priority-normal">{t("priorityNormal")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="urgent" id="queue-priority-urgent" />
                <Label htmlFor="queue-priority-urgent">{t("priorityUrgent")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tres_urgent" id="queue-priority-tres-urgent" />
                <Label htmlFor="queue-priority-tres-urgent">{t("priorityTresUrgent")}</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="notes">{t("quickRegisterNotes")}</Label>
            <Textarea id="notes" className="glass-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>{t("cancel")}</Button>
            <Button
              className="btn-primary"
              disabled={registerMutation.isPending || (!selectedPatient && (!newLastName || !newFirstName || !newPhone))}
              onClick={() => registerMutation.mutate()}
              data-testid="button-submit-queue-registration">
              {registerMutation.isPending ? t("saving") : t("addToQueue")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
