import React, { useState } from "react";
import { Ambulance, ArrowLeft, ArrowRight, AlertTriangle, BedDouble, CalendarClock, ClipboardList, Home, Lock, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
import { cn } from "@/lib/utils";
import { ConsultationJourneySidebar } from "./ConsultationJourneySidebar";
import { useConsultationJourney } from "./useConsultationJourney";
import type { CarePlan, CarePlanOrientation, Consultation, Patient, Prescription } from "@shared/schema";

const ORIENTATIONS: CarePlanOrientation[] = ["retour_domicile", "controle_suivi", "hospitalisation", "orientation_specialiste", "transfert_urgent", "autre"];

const ORIENTATION_LABEL_KEYS: Record<CarePlanOrientation, string> = {
  retour_domicile: "carePlanOrientationRetourDomicile",
  controle_suivi: "carePlanOrientationControleSuivi",
  hospitalisation: "carePlanOrientationHospitalisation",
  orientation_specialiste: "carePlanOrientationOrientationSpecialiste",
  transfert_urgent: "carePlanOrientationTransfertUrgent",
  autre: "carePlanOrientationAutre",
};

const ORIENTATION_SECTION_TITLE_KEYS: Record<CarePlanOrientation, string> = {
  retour_domicile: "retourDomicileSectionTitle",
  controle_suivi: "controleSuiviSectionTitle",
  hospitalisation: "hospitalisationSectionTitle",
  orientation_specialiste: "orientationSpecialisteSectionTitle",
  transfert_urgent: "transfertUrgentSectionTitle",
  autre: "autreSectionTitle",
};

const ORIENTATION_ICONS: Record<CarePlanOrientation, React.ComponentType<{ className?: string }>> = {
  retour_domicile: Home,
  controle_suivi: CalendarClock,
  hospitalisation: BedDouble,
  orientation_specialiste: UserPlus,
  transfert_urgent: Ambulance,
  autre: ClipboardList,
};

const DOCUMENT_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "resultats_examens", labelKey: "documentExamResults" },
  { value: "compte_rendu_consultation", labelKey: "documentConsultationReport" },
  { value: "imagerie", labelKey: "documentImaging" },
];

const PARTY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "medecin_traitant", labelKey: "partyTreatingDoctor" },
  { value: "infirmier_liberal", labelKey: "partyHomeNurse" },
  { value: "equipe_mobile", labelKey: "partyMobileTeam" },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{children}</p>;
}

function YesNoToggle({ checked, onChange, testId }: { checked: boolean; onChange: (value: boolean) => void; testId: string }) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-2 gap-2">
      {[false, true].map((value) => (
        <button
          key={String(value)}
          type="button"
          onClick={() => onChange(value)}
          className={cn(
            "rounded-lg border-2 py-2 text-sm font-medium",
            checked === value ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-foreground"
          )}
          data-testid={`${testId}-${value}`}>
          {value ? t("yesOption") : t("noOption")}
        </button>
      ))}
    </div>
  );
}

function ChipToggleGroup({
  options,
  selected,
  onToggle,
  testIdPrefix,
}: {
  options: { value: string; labelKey: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  testIdPrefix: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onToggle(option.value)}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-sm font-medium",
              active ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"
            )}
            data-testid={`${testIdPrefix}-${option.value}`}>
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

function PillRadioGroup<T extends string>({
  options,
  value,
  onChange,
  testIdPrefix,
}: {
  options: { value: T; labelKey: string; tone?: "danger" }[];
  value: T;
  onChange: (value: T) => void;
  testIdPrefix: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium",
              active && option.tone === "danger" ? "border-red-500 bg-red-500/10 text-red-600 font-semibold" : "",
              active && option.tone !== "danger" ? "border-primary bg-primary/10 text-primary font-semibold" : "",
              !active ? "border-border text-foreground" : ""
            )}
            data-testid={`${testIdPrefix}-${option.value}`}>
            <span className={cn("size-1.5 rounded-full", active ? (option.tone === "danger" ? "bg-red-600" : "bg-primary") : "bg-muted-foreground")} />
            {t(option.labelKey)}
          </button>
        );
      })}
    </div>
  );
}

export default function PlanPriseEnCharge() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

  const [orientation, setOrientation] = useState<CarePlanOrientation | null>(null);
  const [retourDomicile, setRetourDomicile] = useState({ medicalRecommendations: "", patientInstructions: "" });
  const [controleSuivi, setControleSuivi] = useState({ medicalRecommendations: "", patientInstructions: "", appointmentDate: "", specialty: "", doctor: "", followUpReason: "" });
  const [hospitalisation, setHospitalisation] = useState({ targetService: "", estimatedStayDuration: "", admissionReason: "", bedUrgentlyRequired: false, familyNotified: false, preAdmissionInstructions: "" });
  const [orientationSpecialiste, setOrientationSpecialiste] = useState({ recommendedSpecialty: "", recommendedDoctorOrFacility: "", clinicalReason: "", urgencyLevel: "routine" as "routine" | "semi_urgent" | "urgent", generateReferralLetter: false, attachedDocuments: [] as string[] });
  const [transfertUrgent, setTransfertUrgent] = useState({ destinationFacility: "", vitalUrgencyLevel: "", medicalReason: "", transportType: "ambulance_simple" as "ambulance_simple" | "ambulance_medicalisee" | "samu_smur", onCallDoctorContacted: false, estimatedDepartureTime: "" });
  const [autre, setAutre] = useState({ decisionType: "", reevaluationFrequency: "", description: "", followUpNeeded: false, involvedParties: [] as string[] });
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

  const { data: photoUrl } = useQuery<string | null>({
    queryKey: ["/api/patients/photo-url", consultation?.patientId, patient?.photoS3Key],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${consultation?.patientId}/photo-url`, { credentials: "include" });
      if (!response.ok) return null;
      const body = await response.json();
      return body.url;
    },
    enabled: !!patient?.photoS3Key,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const steps = useConsultationJourney(consultation, patient);

  if (consultation?.carePlan && !initialized) {
    const cp = consultation.carePlan;
    setOrientation(cp.orientation);
    if (cp.orientation === "retour_domicile") setRetourDomicile({ medicalRecommendations: cp.medicalRecommendations, patientInstructions: cp.patientInstructions });
    if (cp.orientation === "controle_suivi") setControleSuivi(cp);
    if (cp.orientation === "hospitalisation") setHospitalisation(cp);
    if (cp.orientation === "orientation_specialiste") setOrientationSpecialiste(cp);
    if (cp.orientation === "transfert_urgent") setTransfertUrgent(cp);
    if (cp.orientation === "autre") setAutre(cp);
    setInitialized(true);
  }

  function buildCarePlan(): CarePlan | null {
    if (!orientation) return null;
    if (orientation === "retour_domicile") return { orientation, ...retourDomicile };
    if (orientation === "controle_suivi") return { orientation, ...controleSuivi };
    if (orientation === "hospitalisation") return { orientation, ...hospitalisation };
    if (orientation === "orientation_specialiste") return { orientation, ...orientationSpecialiste };
    if (orientation === "transfert_urgent") return { orientation, ...transfertUrgent };
    return { orientation, ...autre };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const carePlan = buildCarePlan();
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { carePlan }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("carePlanSavedSuccessfully") });
      setLocation(`/consultations/${consultationId}/resume-cloture`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveCarePlan"), t("networkRequestFailed"));
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  function synthese(): string {
    const parts = [consultation!.reason, consultation!.diagnosisPrincipal?.label, consultation!.physicalExam?.generalState].filter(Boolean);
    return parts.length > 0 ? parts.join(" — ") : t("noDataAvailable");
  }

  function toggleDocument(value: string) {
    setOrientationSpecialiste((p) => ({
      ...p,
      attachedDocuments: p.attachedDocuments.includes(value) ? p.attachedDocuments.filter((v) => v !== value) : [...p.attachedDocuments, value],
    }));
  }

  function toggleParty(value: string) {
    setAutre((p) => ({
      ...p,
      involvedParties: p.involvedParties.includes(value) ? p.involvedParties.filter((v) => v !== value) : [...p.involvedParties, value],
    }));
  }

  return (
    <div className="flex gap-6 items-start" data-testid="plan-prise-en-charge-page">
      <ConsultationJourneySidebar steps={steps} />
      <div className="flex-1 min-w-0 space-y-6" data-testid="plan-prise-en-charge-form">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setLocation(`/consultations/${consultationId}`)}>
              {t("consultation")} {consultation.number ?? t("pendingSync")}
            </Button>
            <span className="text-xs text-muted-foreground">›</span>
            <span className="text-xs font-medium text-primary">{t("carePlanTitle")}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="w-3.5 h-3.5" />
            {t("secureRecordBadge")}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold text-foreground">{t("carePlanTitle")}</h1>
          <Badge variant="success">{t("journeyStepCarePlan")} — 8/9</Badge>
        </div>

        <div className="glass-card rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              {photoUrl && <AvatarImage src={photoUrl} alt={`${patient.firstName} ${patient.lastName}`} />}
              <AvatarFallback>{`${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-bold text-foreground">{patient.firstName} {patient.lastName}</p>
              <p className="text-xs text-muted-foreground">{patient.dossierNumber ?? t("pendingSync")}</p>
            </div>
          </div>
          <div className="flex items-center gap-6 text-sm">
            <div>
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("genderAgeFieldLabel")}</p>
              <p className="text-foreground">{patient.sex === "F" ? t("genreFeminin") : t("genreMasculin")}, {calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()}</p>
            </div>
            {patient.idDocumentNumber && (
              <div>
                <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("idNumberFieldLabel")}</p>
                <p className="text-foreground">{patient.idDocumentNumber}</p>
              </div>
            )}
            {patient.bloodGroup && (
              <div>
                <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("bloodGroup")}</p>
                <p className="font-semibold text-red-500">{patient.bloodGroup}</p>
              </div>
            )}
          </div>
          <Badge variant="outline" className="border-primary text-primary">{t("activeRecordBadge")}</Badge>
        </div>

        <div className="glass-card rounded-xl p-6 space-y-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground">{t("orientationSectionTitle")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {ORIENTATIONS.map((value) => {
              const Icon = ORIENTATION_ICONS[value];
              const selected = orientation === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setOrientation(value)}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-left",
                    selected ? "border-primary bg-primary/5" : "border-border"
                  )}
                  data-testid={`radio-orientation-${value}`}>
                  <span className={cn("flex items-center justify-center rounded-md size-4 shrink-0 border-2", selected ? "border-primary bg-primary" : "border-muted-foreground")}>
                    {selected && <span className="size-1.5 rounded-full bg-primary-foreground" />}
                  </span>
                  <Icon className={cn("w-4 h-4 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
                  <span className={cn("text-sm", selected ? "font-semibold text-foreground" : "font-medium text-foreground")}>
                    {t(ORIENTATION_LABEL_KEYS[value])}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {orientation === "transfert_urgent" && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {t("transfertUrgentAlertBanner")}
          </div>
        )}

        {orientation && (
          <div className="glass-card rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = ORIENTATION_ICONS[orientation];
                return <Icon className="w-4 h-4 text-primary" />;
              })()}
              <h2 className="font-bold text-foreground">{t(ORIENTATION_SECTION_TITLE_KEYS[orientation])}</h2>
            </div>

            {orientation === "retour_domicile" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="card-retour-domicile">
                <div>
                  <FieldLabel>{t("medicalRecommendationsField")}</FieldLabel>
                  <Textarea value={retourDomicile.medicalRecommendations} onChange={(e) => setRetourDomicile((p) => ({ ...p, medicalRecommendations: e.target.value }))} />
                </div>
                <div>
                  <FieldLabel>{t("patientInstructionsField")}</FieldLabel>
                  <Textarea value={retourDomicile.patientInstructions} onChange={(e) => setRetourDomicile((p) => ({ ...p, patientInstructions: e.target.value }))} />
                </div>
              </div>
            )}

            {orientation === "controle_suivi" && (
              <div className="space-y-4" data-testid="card-controle-suivi">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("medicalRecommendationsField")}</FieldLabel>
                    <Textarea value={controleSuivi.medicalRecommendations} onChange={(e) => setControleSuivi((p) => ({ ...p, medicalRecommendations: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>{t("patientInstructionsField")}</FieldLabel>
                    <Textarea value={controleSuivi.patientInstructions} onChange={(e) => setControleSuivi((p) => ({ ...p, patientInstructions: e.target.value }))} />
                  </div>
                </div>
                <div className="border-t border-border pt-4 space-y-4">
                  <h3 className="text-sm font-bold text-foreground">{t("scheduledConsultationDetailsTitle")}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <FieldLabel>{t("appointmentDateField")}</FieldLabel>
                      <DatePicker value={controleSuivi.appointmentDate} onValueChange={(value) => setControleSuivi((p) => ({ ...p, appointmentDate: value }))} data-testid="input-appointment-date" />
                    </div>
                    <div>
                      <FieldLabel>{t("specialtyField")}</FieldLabel>
                      <Input value={controleSuivi.specialty} onChange={(e) => setControleSuivi((p) => ({ ...p, specialty: e.target.value }))} />
                    </div>
                    <div>
                      <FieldLabel>{t("doctorField")}</FieldLabel>
                      <Input value={controleSuivi.doctor} onChange={(e) => setControleSuivi((p) => ({ ...p, doctor: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>{t("followUpReasonField")}</FieldLabel>
                    <Input value={controleSuivi.followUpReason} onChange={(e) => setControleSuivi((p) => ({ ...p, followUpReason: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            {orientation === "hospitalisation" && (
              <div className="space-y-4" data-testid="card-hospitalisation">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("targetServiceField")}</FieldLabel>
                    <Input value={hospitalisation.targetService} onChange={(e) => setHospitalisation((p) => ({ ...p, targetService: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>{t("estimatedStayDurationField")}</FieldLabel>
                    <Input value={hospitalisation.estimatedStayDuration} onChange={(e) => setHospitalisation((p) => ({ ...p, estimatedStayDuration: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("admissionReasonField")}</FieldLabel>
                  <Textarea value={hospitalisation.admissionReason} onChange={(e) => setHospitalisation((p) => ({ ...p, admissionReason: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("bedUrgentlyRequiredField")}</FieldLabel>
                    <YesNoToggle checked={hospitalisation.bedUrgentlyRequired} onChange={(v) => setHospitalisation((p) => ({ ...p, bedUrgentlyRequired: v }))} testId="toggle-bed-urgent" />
                  </div>
                  <div>
                    <FieldLabel>{t("familyNotifiedField")}</FieldLabel>
                    <YesNoToggle checked={hospitalisation.familyNotified} onChange={(v) => setHospitalisation((p) => ({ ...p, familyNotified: v }))} testId="toggle-family-notified" />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("preAdmissionInstructionsField")}</FieldLabel>
                  <Textarea value={hospitalisation.preAdmissionInstructions} onChange={(e) => setHospitalisation((p) => ({ ...p, preAdmissionInstructions: e.target.value }))} />
                </div>
              </div>
            )}

            {orientation === "orientation_specialiste" && (
              <div className="space-y-4" data-testid="card-orientation-specialiste">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("recommendedSpecialtyField")}</FieldLabel>
                    <Input value={orientationSpecialiste.recommendedSpecialty} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, recommendedSpecialty: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>{t("recommendedDoctorOrFacilityField")}</FieldLabel>
                    <Input value={orientationSpecialiste.recommendedDoctorOrFacility} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, recommendedDoctorOrFacility: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("clinicalReasonField")}</FieldLabel>
                  <Textarea value={orientationSpecialiste.clinicalReason} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, clinicalReason: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("urgencyLevelField")}</FieldLabel>
                    <PillRadioGroup
                      testIdPrefix="urgency"
                      value={orientationSpecialiste.urgencyLevel}
                      onChange={(value) => setOrientationSpecialiste((p) => ({ ...p, urgencyLevel: value }))}
                      options={[
                        { value: "routine", labelKey: "urgencyLevelRoutine" },
                        { value: "semi_urgent", labelKey: "urgencyLevelSemiUrgent" },
                        { value: "urgent", labelKey: "urgencyLevelUrgent" },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel>{t("generateReferralLetterField")}</FieldLabel>
                    <YesNoToggle checked={orientationSpecialiste.generateReferralLetter} onChange={(v) => setOrientationSpecialiste((p) => ({ ...p, generateReferralLetter: v }))} testId="toggle-referral-letter" />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("documentsToAttachLabel")}</FieldLabel>
                  <ChipToggleGroup options={DOCUMENT_OPTIONS} selected={orientationSpecialiste.attachedDocuments} onToggle={toggleDocument} testIdPrefix="chip-document" />
                </div>
              </div>
            )}

            {orientation === "transfert_urgent" && (
              <div className="space-y-4" data-testid="card-transfert-urgent">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("destinationFacilityField")}</FieldLabel>
                    <Input value={transfertUrgent.destinationFacility} onChange={(e) => setTransfertUrgent((p) => ({ ...p, destinationFacility: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>{t("vitalUrgencyLevelField")}</FieldLabel>
                    <Input value={transfertUrgent.vitalUrgencyLevel} onChange={(e) => setTransfertUrgent((p) => ({ ...p, vitalUrgencyLevel: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("medicalReasonField")}</FieldLabel>
                  <Textarea value={transfertUrgent.medicalReason} onChange={(e) => setTransfertUrgent((p) => ({ ...p, medicalReason: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("transportTypeField")}</FieldLabel>
                    <PillRadioGroup
                      testIdPrefix="transport"
                      value={transfertUrgent.transportType}
                      onChange={(value) => setTransfertUrgent((p) => ({ ...p, transportType: value }))}
                      options={[
                        { value: "ambulance_simple", labelKey: "transportTypeAmbulanceSimple" },
                        { value: "ambulance_medicalisee", labelKey: "transportTypeAmbulanceMedicalisee" },
                        { value: "samu_smur", labelKey: "transportTypeSamuSmur", tone: "danger" },
                      ]}
                    />
                  </div>
                  <div>
                    <FieldLabel>{t("onCallDoctorContactedField")}</FieldLabel>
                    <YesNoToggle checked={transfertUrgent.onCallDoctorContacted} onChange={(v) => setTransfertUrgent((p) => ({ ...p, onCallDoctorContacted: v }))} testId="toggle-on-call-doctor" />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("estimatedDepartureTimeField")}</FieldLabel>
                  <Input value={transfertUrgent.estimatedDepartureTime} onChange={(e) => setTransfertUrgent((p) => ({ ...p, estimatedDepartureTime: e.target.value }))} />
                </div>
              </div>
            )}

            {orientation === "autre" && (
              <div className="space-y-4" data-testid="card-autre">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("decisionTypeField")}</FieldLabel>
                    <Input value={autre.decisionType} onChange={(e) => setAutre((p) => ({ ...p, decisionType: e.target.value }))} />
                  </div>
                  <div>
                    <FieldLabel>{t("reevaluationFrequencyField")}</FieldLabel>
                    <Input value={autre.reevaluationFrequency} onChange={(e) => setAutre((p) => ({ ...p, reevaluationFrequency: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <FieldLabel>{t("descriptionField")}</FieldLabel>
                  <Textarea value={autre.description} onChange={(e) => setAutre((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel>{t("followUpNeededField")}</FieldLabel>
                    <YesNoToggle checked={autre.followUpNeeded} onChange={(v) => setAutre((p) => ({ ...p, followUpNeeded: v }))} testId="toggle-followup-needed" />
                  </div>
                  <div>
                    <FieldLabel>{t("involvedPartiesLabel")}</FieldLabel>
                    <ChipToggleGroup options={PARTY_OPTIONS} selected={autre.involvedParties} onToggle={toggleParty} testIdPrefix="chip-party" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="glass-card rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-sm text-foreground">{t("autoGeneratedActionsTitle")}</h2>
            </div>
            <Badge variant="secondary">{t("systemConnectedBadge")}</Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("generatedPrescriptionsLabel")}</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mt-1">
                <span className="size-1.5 rounded-full bg-primary shrink-0" />
                {prescriptions.length}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("consultationSummaryLabel")}</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mt-1 truncate">
                <span className="size-1.5 rounded-full bg-primary shrink-0" />
                {synthese()}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-[11px] uppercase font-semibold text-muted-foreground">{t("referralLetterLabel")}</p>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground mt-1">
                <span className="size-1.5 rounded-full bg-primary shrink-0" />
                {orientation === "orientation_specialiste" || orientation === "transfert_urgent" ? t("defineCarePlanAction") : t("noDataAvailable")}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("cancel")}
          </Button>
          <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={!orientation || saveMutation.isPending} data-testid="button-save-care-plan">
            {t("saveCarePlanAction")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
