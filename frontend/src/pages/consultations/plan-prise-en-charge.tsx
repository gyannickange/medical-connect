import React, { useState } from "react";
import { Ambulance, ArrowLeft, ArrowRight, BedDouble, CalendarClock, CircleCheck, Home, UserPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
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

const ORIENTATION_ICONS: Record<CarePlanOrientation, React.ComponentType<{ className?: string }>> = {
  retour_domicile: Home,
  controle_suivi: CalendarClock,
  hospitalisation: BedDouble,
  orientation_specialiste: UserPlus,
  transfert_urgent: Ambulance,
  autre: CircleCheck,
};

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
  const [orientationSpecialiste, setOrientationSpecialiste] = useState({ recommendedSpecialty: "", recommendedDoctorOrFacility: "", clinicalReason: "", urgencyLevel: "routine" as "routine" | "semi_urgent" | "urgent", generateReferralLetter: false });
  const [transfertUrgent, setTransfertUrgent] = useState({ destinationFacility: "", vitalUrgencyLevel: "", medicalReason: "", transportType: "ambulance_simple" as "ambulance_simple" | "ambulance_medicalisee" | "samu_smur", onCallDoctorContacted: false, estimatedDepartureTime: "" });
  const [autre, setAutre] = useState({ decisionType: "", reevaluationFrequency: "", description: "", followUpNeeded: false });
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

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  if (consultation?.carePlan && !initialized) {
    const cp = consultation.carePlan;
    setOrientation(cp.orientation);
    if (cp.orientation === "retour_domicile") setRetourDomicile({ medicalRecommendations: cp.medicalRecommendations, patientInstructions: cp.patientInstructions });
    if (cp.orientation === "controle_suivi") setControleSuivi(cp);
    if (cp.orientation === "hospitalisation") setHospitalisation(cp);
    if (cp.orientation === "orientation_specialiste") setOrientationSpecialiste({ recommendedSpecialty: cp.recommendedSpecialty, recommendedDoctorOrFacility: cp.recommendedDoctorOrFacility, clinicalReason: cp.clinicalReason, urgencyLevel: cp.urgencyLevel, generateReferralLetter: cp.generateReferralLetter });
    if (cp.orientation === "transfert_urgent") setTransfertUrgent(cp);
    if (cp.orientation === "autre") setAutre({ decisionType: cp.decisionType, reevaluationFrequency: cp.reevaluationFrequency, description: cp.description, followUpNeeded: cp.followUpNeeded });
    setInitialized(true);
  }

  function buildCarePlan(): CarePlan | null {
    if (!orientation) return null;
    if (orientation === "retour_domicile") return { orientation, ...retourDomicile };
    if (orientation === "controle_suivi") return { orientation, ...controleSuivi };
    if (orientation === "hospitalisation") return { orientation, ...hospitalisation };
    if (orientation === "orientation_specialiste") return { orientation, ...orientationSpecialiste, attachedDocuments: [] };
    if (orientation === "transfert_urgent") return { orientation, ...transfertUrgent };
    return { orientation, ...autre, involvedParties: [] };
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

  function courrier(): string {
    if (orientation === "orientation_specialiste") {
      const parts = [orientationSpecialiste.recommendedSpecialty, orientationSpecialiste.clinicalReason].filter(Boolean);
      return parts.length > 0 ? parts.join(" — ") : t("noDataAvailable");
    }
    if (orientation === "transfert_urgent") {
      const parts = [transfertUrgent.destinationFacility, transfertUrgent.medicalReason].filter(Boolean);
      return parts.length > 0 ? parts.join(" — ") : t("noDataAvailable");
    }
    return t("noDataAvailable");
  }

  return (
    <div className="space-y-6 pb-24" data-testid="plan-prise-en-charge-form">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultationMedicaleTitle")}
        </Button>
        <Badge variant="secondary">{t("journeyStepCarePlan")} — 8/9</Badge>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("carePlanTitle")} — {consultation.number ?? t("pendingSync")}</h1>
        <p className="text-sm text-muted-foreground">{t("carePlanSubtitle")}</p>
      </div>

      <Card className="p-4 flex items-center justify-between">
        <div>
          <p className="font-semibold text-foreground">{patient.firstName} {patient.lastName}</p>
          <p className="text-sm text-muted-foreground">
            {patient.sex} · {calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()}
            {patient.bloodGroup ? ` · ${t("bloodGroup")}: ${patient.bloodGroup}` : ""}
          </p>
        </div>
        <Badge>{patient.dossierNumber ?? t("pendingSync")}</Badge>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("orientationSectionTitle")}</h2>
        <RadioGroup value={orientation ?? ""} onValueChange={(value) => setOrientation(value as CarePlanOrientation)} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ORIENTATIONS.map((value) => {
            const Icon = ORIENTATION_ICONS[value];
            return (
              <Label
                key={value}
                htmlFor={`orientation-${value}`}
                className="flex items-center gap-2 rounded-md border border-border p-3 cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                <RadioGroupItem value={value} id={`orientation-${value}`} data-testid={`radio-orientation-${value}`} />
                <Icon className="w-4 h-4 text-muted-foreground" />
                {t(ORIENTATION_LABEL_KEYS[value])}
              </Label>
            );
          })}
        </RadioGroup>
      </Card>

      {orientation === "retour_domicile" && (
        <Card className="p-6 space-y-4" data-testid="card-retour-domicile">
          <div>
            <Label htmlFor="rd-recommendations">{t("medicalRecommendationsField")}</Label>
            <Textarea id="rd-recommendations" className="glass-input" value={retourDomicile.medicalRecommendations} onChange={(e) => setRetourDomicile((p) => ({ ...p, medicalRecommendations: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="rd-instructions">{t("patientInstructionsField")}</Label>
            <Textarea id="rd-instructions" className="glass-input" value={retourDomicile.patientInstructions} onChange={(e) => setRetourDomicile((p) => ({ ...p, patientInstructions: e.target.value }))} />
          </div>
        </Card>
      )}

      {orientation === "controle_suivi" && (
        <Card className="p-6 space-y-4" data-testid="card-controle-suivi">
          <div>
            <Label htmlFor="cs-recommendations">{t("medicalRecommendationsField")}</Label>
            <Textarea id="cs-recommendations" className="glass-input" value={controleSuivi.medicalRecommendations} onChange={(e) => setControleSuivi((p) => ({ ...p, medicalRecommendations: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cs-instructions">{t("patientInstructionsField")}</Label>
            <Textarea id="cs-instructions" className="glass-input" value={controleSuivi.patientInstructions} onChange={(e) => setControleSuivi((p) => ({ ...p, patientInstructions: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cs-date">{t("appointmentDateField")}</Label>
              <Input id="cs-date" type="date" className="glass-input" value={controleSuivi.appointmentDate} onChange={(e) => setControleSuivi((p) => ({ ...p, appointmentDate: e.target.value }))} data-testid="input-appointment-date" />
            </div>
            <div>
              <Label htmlFor="cs-specialty">{t("specialtyField")}</Label>
              <Input id="cs-specialty" className="glass-input" value={controleSuivi.specialty} onChange={(e) => setControleSuivi((p) => ({ ...p, specialty: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cs-doctor">{t("doctorField")}</Label>
              <Input id="cs-doctor" className="glass-input" value={controleSuivi.doctor} onChange={(e) => setControleSuivi((p) => ({ ...p, doctor: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cs-reason">{t("followUpReasonField")}</Label>
              <Input id="cs-reason" className="glass-input" value={controleSuivi.followUpReason} onChange={(e) => setControleSuivi((p) => ({ ...p, followUpReason: e.target.value }))} />
            </div>
          </div>
        </Card>
      )}

      {orientation === "hospitalisation" && (
        <Card className="p-6 space-y-4" data-testid="card-hospitalisation">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="h-service">{t("targetServiceField")}</Label>
              <Input id="h-service" className="glass-input" value={hospitalisation.targetService} onChange={(e) => setHospitalisation((p) => ({ ...p, targetService: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="h-duration">{t("estimatedStayDurationField")}</Label>
              <Input id="h-duration" className="glass-input" value={hospitalisation.estimatedStayDuration} onChange={(e) => setHospitalisation((p) => ({ ...p, estimatedStayDuration: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="h-reason">{t("admissionReasonField")}</Label>
            <Textarea id="h-reason" className="glass-input" value={hospitalisation.admissionReason} onChange={(e) => setHospitalisation((p) => ({ ...p, admissionReason: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="h-bed" checked={hospitalisation.bedUrgentlyRequired} onCheckedChange={(v) => setHospitalisation((p) => ({ ...p, bedUrgentlyRequired: v === true }))} />
            <Label htmlFor="h-bed">{t("bedUrgentlyRequiredField")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="h-family" checked={hospitalisation.familyNotified} onCheckedChange={(v) => setHospitalisation((p) => ({ ...p, familyNotified: v === true }))} />
            <Label htmlFor="h-family">{t("familyNotifiedField")}</Label>
          </div>
          <div>
            <Label htmlFor="h-instructions">{t("preAdmissionInstructionsField")}</Label>
            <Textarea id="h-instructions" className="glass-input" value={hospitalisation.preAdmissionInstructions} onChange={(e) => setHospitalisation((p) => ({ ...p, preAdmissionInstructions: e.target.value }))} />
          </div>
        </Card>
      )}

      {orientation === "orientation_specialiste" && (
        <Card className="p-6 space-y-4" data-testid="card-orientation-specialiste">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="os-specialty">{t("recommendedSpecialtyField")}</Label>
              <Input id="os-specialty" className="glass-input" value={orientationSpecialiste.recommendedSpecialty} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, recommendedSpecialty: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="os-doctor">{t("recommendedDoctorOrFacilityField")}</Label>
              <Input id="os-doctor" className="glass-input" value={orientationSpecialiste.recommendedDoctorOrFacility} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, recommendedDoctorOrFacility: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="os-reason">{t("clinicalReasonField")}</Label>
            <Textarea id="os-reason" className="glass-input" value={orientationSpecialiste.clinicalReason} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, clinicalReason: e.target.value }))} />
          </div>
          <div>
            <Label>{t("urgencyLevelField")}</Label>
            <RadioGroup value={orientationSpecialiste.urgencyLevel} onValueChange={(value) => setOrientationSpecialiste((p) => ({ ...p, urgencyLevel: value as "routine" | "semi_urgent" | "urgent" }))} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="routine" id="urgency-routine" />
                <Label htmlFor="urgency-routine">{t("urgencyLevelRoutine")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="semi_urgent" id="urgency-semi-urgent" />
                <Label htmlFor="urgency-semi-urgent">{t("urgencyLevelSemiUrgent")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="urgent" id="urgency-urgent" />
                <Label htmlFor="urgency-urgent">{t("urgencyLevelUrgent")}</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="os-letter" checked={orientationSpecialiste.generateReferralLetter} onCheckedChange={(v) => setOrientationSpecialiste((p) => ({ ...p, generateReferralLetter: v === true }))} />
            <Label htmlFor="os-letter">{t("generateReferralLetterField")}</Label>
          </div>
        </Card>
      )}

      {orientation === "transfert_urgent" && (
        <Card className="p-6 space-y-4 border-destructive/40" data-testid="card-transfert-urgent">
          <Badge variant="destructive">{t("carePlanOrientationTransfertUrgent")}</Badge>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tu-destination">{t("destinationFacilityField")}</Label>
              <Input id="tu-destination" className="glass-input" value={transfertUrgent.destinationFacility} onChange={(e) => setTransfertUrgent((p) => ({ ...p, destinationFacility: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tu-vital">{t("vitalUrgencyLevelField")}</Label>
              <Input id="tu-vital" className="glass-input" value={transfertUrgent.vitalUrgencyLevel} onChange={(e) => setTransfertUrgent((p) => ({ ...p, vitalUrgencyLevel: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="tu-reason">{t("medicalReasonField")}</Label>
            <Textarea id="tu-reason" className="glass-input" value={transfertUrgent.medicalReason} onChange={(e) => setTransfertUrgent((p) => ({ ...p, medicalReason: e.target.value }))} />
          </div>
          <div>
            <Label>{t("transportTypeField")}</Label>
            <RadioGroup value={transfertUrgent.transportType} onValueChange={(value) => setTransfertUrgent((p) => ({ ...p, transportType: value as "ambulance_simple" | "ambulance_medicalisee" | "samu_smur" }))} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ambulance_simple" id="transport-simple" />
                <Label htmlFor="transport-simple">{t("transportTypeAmbulanceSimple")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ambulance_medicalisee" id="transport-medicalisee" />
                <Label htmlFor="transport-medicalisee">{t("transportTypeAmbulanceMedicalisee")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="samu_smur" id="transport-samu" />
                <Label htmlFor="transport-samu">{t("transportTypeSamuSmur")}</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="tu-contacted" checked={transfertUrgent.onCallDoctorContacted} onCheckedChange={(v) => setTransfertUrgent((p) => ({ ...p, onCallDoctorContacted: v === true }))} />
            <Label htmlFor="tu-contacted">{t("onCallDoctorContactedField")}</Label>
          </div>
          <div>
            <Label htmlFor="tu-departure">{t("estimatedDepartureTimeField")}</Label>
            <Input id="tu-departure" className="glass-input" value={transfertUrgent.estimatedDepartureTime} onChange={(e) => setTransfertUrgent((p) => ({ ...p, estimatedDepartureTime: e.target.value }))} />
          </div>
        </Card>
      )}

      {orientation === "autre" && (
        <Card className="p-6 space-y-4" data-testid="card-autre">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="a-type">{t("decisionTypeField")}</Label>
              <Input id="a-type" className="glass-input" value={autre.decisionType} onChange={(e) => setAutre((p) => ({ ...p, decisionType: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="a-frequency">{t("reevaluationFrequencyField")}</Label>
              <Input id="a-frequency" className="glass-input" value={autre.reevaluationFrequency} onChange={(e) => setAutre((p) => ({ ...p, reevaluationFrequency: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="a-description">{t("descriptionField")}</Label>
            <Textarea id="a-description" className="glass-input" value={autre.description} onChange={(e) => setAutre((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="a-followup" checked={autre.followUpNeeded} onCheckedChange={(v) => setAutre((p) => ({ ...p, followUpNeeded: v === true }))} />
            <Label htmlFor="a-followup">{t("followUpNeededField")}</Label>
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{t("autoGeneratedActionsTitle")}</h2>
          <Badge variant="secondary">
            <CircleCheck className="w-3 h-3 mr-1" />
            {t("statusAfterClosure")}
          </Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">{t("generatedPrescriptionsLabel")}</p>
              <p className="text-sm text-muted-foreground">{prescriptions.length}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
            <div>
              <p className="text-sm font-medium">{t("consultationSummaryLabel")}</p>
              <p className="text-sm text-muted-foreground">{synthese()}</p>
            </div>
          </div>
          {(orientation === "orientation_specialiste" || orientation === "transfert_urgent") && (
            <div className="flex items-start gap-2">
              <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
              <div>
                <p className="text-sm font-medium">{t("referralLetterLabel")}</p>
                <p className="text-sm text-muted-foreground">{courrier()}</p>
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-background border-t border-border p-4 flex items-center justify-end gap-2">
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
  );
}
