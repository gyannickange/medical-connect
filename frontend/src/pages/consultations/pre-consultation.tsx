import React, { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { ConsultationJourneySidebar } from "./ConsultationJourneySidebar";
import { useConsultationJourney } from "./useConsultationJourney";
import type { Consultation, Patient, Room, User, VitalSigns } from "@shared/schema";

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

function painLevelKey(score: number): string {
  if (score === 0) return "painLevelNone";
  if (score <= 3) return "painLevelMild";
  if (score <= 6) return "painLevelModerate";
  if (score <= 9) return "painLevelSevere";
  return "painLevelExtreme";
}

export default function PreConsultationForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
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

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const assignedDoctor = staffList.find((member) => member.id === consultation?.assignedDoctorId);

  const { data: roomsList = [] } = useQuery<Room[]>({
    queryKey: ["/api/rooms", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const assignedRoom = roomsList.find((room) => room.id === consultation?.roomId);

  const steps = useConsultationJourney(consultation, patient);

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
      if (consultation) {
        void offlineApiRequest(
          "POST",
          "/api/queue/events",
          { consultationId, patientId: consultation.patientId, eventType: "in_care", tenantId: consultation.tenantId },
          { collection: "queue" }
        );
        queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      }
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
    <div className="flex gap-6 items-start" data-testid="pre-consultation-page">
      <ConsultationJourneySidebar steps={steps} />
      <div className="flex-1 min-w-0 space-y-6" data-testid="pre-consultation-form">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("consultations")}
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{t("preConsultationTitle")}</h1>
            <p className="text-sm text-muted-foreground">{t("preConsultationSubtitle")}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1.5 shrink-0">
            <span className="size-2 rounded-full bg-primary" />
            <span className="text-xs font-semibold text-primary">
              {t("vitalsRecordedAtLabel")} {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        </div>

        <Card className="p-5 flex flex-wrap items-center gap-6">
          <p className="font-bold text-foreground text-base">{patient.firstName} {patient.lastName}</p>
          <div className="h-8 w-px bg-border hidden md:block" />
          <div>
            <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("dossierNumberFieldLabel")}</p>
            <p className="text-sm text-foreground">{patient.dossierNumber ?? t("pendingSync")}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("assignedDoctorFieldLabel")}</p>
            <p className="text-sm text-foreground">{assignedDoctor ? `${assignedDoctor.firstName} ${assignedDoctor.lastName}` : "—"} · {consultation.specialty}</p>
          </div>
          {assignedRoom && (
            <div>
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("locationFieldLabel")}</p>
              <p className="text-sm font-semibold text-primary">{assignedRoom.number}</p>
            </div>
          )}
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
            <Input value={bmi ?? ""} disabled data-testid="input-vital-bmi" />
          </div>
          {numberField(t("capillaryGlycemiaField"), "g/L", "capillaryGlycemia")}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("painScaleField")}</Label>
              <span className="text-sm font-bold text-amber-600">{vitals.painScoreEva ?? 0} / 10 — {t(painLevelKey(vitals.painScoreEva ?? 0))}</span>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {Array.from({ length: 11 }, (_, level) => level).map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setVitals((prev) => ({ ...prev, painScoreEva: level }))}
                  className={cn(
                    "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
                    (vitals.painScoreEva ?? 0) === level ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                  )}
                  data-testid={`button-pain-level-${level}`}>
                  {level}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("clinicalInfoSection")}</h2>
          <div>
            <Label htmlFor="symptoms">{t("symptomsComplaints")}</Label>
            <Textarea id="symptoms" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} data-testid="textarea-symptoms" />
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
            <Textarea id="nurseNotes" value={nurseNotes} onChange={(e) => setNurseNotes(e.target.value)} data-testid="textarea-nurse-notes" />
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
    </div>
  );
}
