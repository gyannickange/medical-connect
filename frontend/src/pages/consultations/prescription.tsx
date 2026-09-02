import React, { useState } from "react";
import { ArrowLeft, AlertTriangle, Pill } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { ConsultationJourneySidebar } from "./ConsultationJourneySidebar";
import { useConsultationJourney } from "./useConsultationJourney";
import type { Consultation, Patient, Prescription } from "@shared/schema";

export default function PrescriptionForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

  const [drugName, setDrugName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("");
  const [durationDays, setDurationDays] = useState("");
  const [quantity, setQuantity] = useState("");

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", consultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${consultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultation?.patientId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const steps = useConsultationJourney(consultation, patient);

  const addMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest(
        "POST",
        "/api/prescriptions",
        {
          consultationId,
          lines: [{ drugName, dosage, frequency, durationDays: durationDays ? Number(durationDays) : null, quantity: quantity || null }],
        },
        { collection: "prescriptions" }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`] });
      toast({ title: t("success"), description: t("prescriptionCreatedSuccessfully") });
      setDrugName("");
      setDosage("");
      setFrequency("");
      setDurationDays("");
      setQuantity("");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreatePrescription"), t("networkRequestFailed"));
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 items-start" data-testid="prescription-page">
      <ConsultationJourneySidebar steps={steps} />
      <div className="flex-1 min-w-0 space-y-6">
        <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultations")}
        </Button>

        <h1 className="text-2xl font-display font-bold text-foreground">{t("prescriptionMedicaleTitle")}</h1>

        <div className="glass-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bold text-foreground">{patient.firstName} {patient.lastName}</p>
            <p className="text-xs text-muted-foreground">{t("patientIdentifierLabel")} {patient.dossierNumber ?? t("pendingSync")}</p>
          </div>
          {patient.allergyDetails && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
              <span className="text-sm font-semibold text-red-800">{t("allergyBannerLabel")} {patient.allergyDetails}</span>
            </div>
          )}
        </div>

        {patient.currentTreatments && (
          <div className="glass-card rounded-xl p-5 space-y-2">
            <h2 className="font-bold text-sm text-foreground">{t("currentTreatmentsFromRecord")}</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{patient.currentTreatments}</p>
          </div>
        )}

        <div className="glass-card rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-foreground">{t("newPrescriptionTitle")}</h2>
            <span className="text-sm font-semibold text-primary">{t("medicationsAddedLabel").replace("{count}", String(prescriptions.length))}</span>
          </div>

          {prescriptions.length > 0 && (
            <div className="space-y-2">
              {prescriptions.map((prescription) => (
                <div key={prescription.id} className="rounded-lg border border-border p-3" data-testid={`prescription-line-${prescription.id}`}>
                  {prescription.lines.map((line, index) => (
                    <div key={index} className="flex items-center gap-2 text-sm">
                      <Pill className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="font-semibold text-foreground">{line.drugName}</span>
                      <span className="text-muted-foreground">{t("dosageLabel")} {line.dosage} · {t("frequencyLabel")} {line.frequency}</span>
                      {line.durationDays && <span className="text-muted-foreground">· {line.durationDays} {t("daysShortSuffix")}</span>}
                      {line.quantity && <span className="text-muted-foreground">· {t("quantityLabel")} {line.quantity}</span>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="drugName">{t("drugNameLabel")}</Label>
              <Input id="drugName" value={drugName} onChange={(e) => setDrugName(e.target.value)} data-testid="input-new-drug-name" />
            </div>
            <div>
              <Label htmlFor="dosage">{t("dosageLabel")}</Label>
              <Input id="dosage" value={dosage} onChange={(e) => setDosage(e.target.value)} data-testid="input-new-dosage" />
            </div>
            <div>
              <Label htmlFor="frequency">{t("frequencyLabel")}</Label>
              <Input id="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} data-testid="input-new-frequency" />
            </div>
            <div>
              <Label htmlFor="durationDays">{t("durationDaysLabel")}</Label>
              <Input id="durationDays" type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} data-testid="input-new-duration" />
            </div>
            <div>
              <Label htmlFor="quantity">{t("quantityLabel")}</Label>
              <Input id="quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-new-quantity" />
            </div>
          </div>
          <Button
            variant="outline"
            className="border-dashed border-primary text-primary"
            onClick={() => addMutation.mutate()}
            disabled={!drugName.trim() || !dosage.trim() || !frequency.trim() || addMutation.isPending}
            data-testid="button-add-prescription-line">
            {t("addMedicationAction")}
          </Button>
        </div>

        <div className="flex justify-between gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}`)}>{t("cancel")}</Button>
          <Button
            className="btn-primary"
            onClick={() => setLocation(`/consultations/${consultationId}`)}
            disabled={prescriptions.length === 0}
            data-testid="button-validate-prescription">
            {t("validatePrescriptionAction")}
          </Button>
        </div>
      </div>
    </div>
  );
}
