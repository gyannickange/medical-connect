import React, { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation, Patient, VitalSigns } from "@shared/schema";

const EMPTY_VITALS: VitalSigns = {
  bloodPressureSystolic: null,
  bloodPressureDiastolic: null,
  heartRate: null,
  temperature: null,
  oxygenSaturation: null,
  respiratoryRate: null,
  weightKg: null,
  heightCm: null,
  bmi: null,
  capillaryGlycemia: null,
  painScoreEva: null,
  isPregnant: null,
};

function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export default function PreConsultationForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();
  const [vitals, setVitals] = useState<VitalSigns>(EMPTY_VITALS);
  const [symptoms, setSymptoms] = useState("");
  const [nurseNotes, setNurseNotes] = useState("");
  const [initialized, setInitialized] = useState(false);

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

  if (consultation && !initialized) {
    setVitals(consultation.vitals ?? EMPTY_VITALS);
    setSymptoms(consultation.symptoms ?? "");
    setNurseNotes(consultation.nurseNotes ?? "");
    setInitialized(true);
  }

  const bmi = useMemo(() => computeBmi(vitals.weightKg, vitals.heightCm), [vitals.weightKg, vitals.heightCm]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest(
        "PUT",
        `/api/consultations/${consultationId}`,
        { vitals: { ...vitals, bmi }, symptoms, nurseNotes },
        { collection: "consultations", entityId: consultationId }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("vitalsSavedSuccessfully") });
      setLocation(`/consultations/${consultationId}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveVitals"), t("networkRequestFailed"));
    },
  });

  function numberField(label: string, unit: string, key: keyof VitalSigns) {
    const value = vitals[key] as number | null;
    return (
      <div>
        <Label htmlFor={`vital-${key}`}>{label}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`vital-${key}`}
            type="number"
            className="glass-input"
            value={value ?? ""}
            onChange={(e) => setVitals((prev) => ({ ...prev, [key]: e.target.value === "" ? null : Number(e.target.value) }))}
            data-testid={`input-vital-${key}`}
          />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </div>
    );
  }

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="pre-consultation-form">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultations")}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("preConsultationTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("preConsultationSubtitle")}</p>
      </div>

      <Card className="p-6 space-y-1">
        <p className="font-semibold text-foreground">{patient.firstName} {patient.lastName}</p>
        <p className="text-sm text-muted-foreground">{patient.dossierNumber ?? t("pendingSync")} · {consultation.specialty}</p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("vitalSignsSection")}</h2>
          <div className="grid grid-cols-2 gap-4">
            {numberField(t("bloodPressureSystolic"), "mmHg", "bloodPressureSystolic")}
            {numberField(t("bloodPressureDiastolic"), "mmHg", "bloodPressureDiastolic")}
            {numberField(t("heartRateField"), "bpm", "heartRate")}
            {numberField(t("temperatureField"), "°C", "temperature")}
            {numberField(t("oxygenSaturationField"), "%", "oxygenSaturation")}
            {numberField(t("respiratoryRateField"), "/min", "respiratoryRate")}
            {numberField(t("weightKgField"), "kg", "weightKg")}
            {numberField(t("heightCmField"), "cm", "heightCm")}
          </div>
          <div>
            <Label>{t("bmiCalculatedField")}</Label>
            <Input value={bmi ?? ""} disabled className="glass-input" data-testid="input-vital-bmi" />
          </div>
          {numberField(t("capillaryGlycemiaField"), "g/L", "capillaryGlycemia")}
          <div>
            <div className="flex items-center justify-between">
              <Label>{t("painScaleField")}</Label>
              <span className="text-sm text-muted-foreground">{vitals.painScoreEva ?? 0} / 10</span>
            </div>
            <Slider
              value={[vitals.painScoreEva ?? 0]}
              min={0}
              max={10}
              step={1}
              onValueChange={([v]) => setVitals((prev) => ({ ...prev, painScoreEva: v }))}
              data-testid="slider-pain-score"
            />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("clinicalInfoSection")}</h2>
          <div>
            <Label htmlFor="symptoms">{t("symptomsComplaints")}</Label>
            <Textarea id="symptoms" className="glass-input" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} data-testid="textarea-symptoms" />
          </div>
          <div>
            <Label>{t("knownAllergiesFromRecord")}</Label>
            <p className="text-sm text-muted-foreground">{patient.allergyDetails || "—"}</p>
          </div>
          <div>
            <Label>{t("currentTreatmentsFromRecord")}</Label>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{patient.currentTreatments || "—"}</p>
          </div>
          <div>
            <Label htmlFor="nurseNotes">{t("nurseNotesObservations")}</Label>
            <Textarea id="nurseNotes" className="glass-input" value={nurseNotes} onChange={(e) => setNurseNotes(e.target.value)} data-testid="textarea-nurse-notes" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("pregnancyInProgress")}</Label>
              <p className="text-xs text-muted-foreground">{t("pregnancyHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{vitals.isPregnant ? t("pregnancyYes") : t("pregnancyNo")}</span>
              <Switch
                checked={vitals.isPregnant ?? false}
                onCheckedChange={(checked) => setVitals((prev) => ({ ...prev, isPregnant: checked }))}
                data-testid="switch-pregnancy"
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}`)}>{t("cancel")}</Button>
        <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-validate-patient-ready">
          <CheckCircle className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? t("saving") : t("validatePatientReady")}
        </Button>
      </div>
    </div>
  );
}
