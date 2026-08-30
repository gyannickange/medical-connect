import React from "react";
import { ArrowLeft, ArrowRight, Edit, Printer, User, StickyNote, Ban, ListPlus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { computeConsultationJourney, type JourneyStep } from "@/lib/consultationJourney";
import { ConsultationJourneySidebar } from "./ConsultationJourneySidebar";
import type { Consultation, LabOrder, Patient, Prescription, QueueItem } from "@shared/schema";

const STEP_LABEL_KEYS: Record<string, string> = {
  patientIdentified: "journeyStepPatientIdentified",
  consultationRegistered: "journeyStepConsultationRegistered",
  queue: "journeyStepQueue",
  preConsultation: "journeyStepPreConsultation",
  medicalConsultation: "journeyStepMedicalConsultation",
  exams: "journeyStepExams",
  prescription: "journeyStepPrescription",
  carePlan: "journeyStepCarePlan",
  closure: "journeyStepClosure",
};

export default function ConsultationHub() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

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

  const { data: queueItems = [] } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { status: "annulee" }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationCancelledSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCancelConsultation"), t("networkRequestFailed"));
    },
  });

  const queueMutation = useMutation({
    mutationFn: async () =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId, patientId: consultation?.patientId, eventType: "arrived", tenantId: currentTenant?.id },
        { collection: "queue" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      toast({ title: t("success"), description: t("queueEntryAddedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const queueItem = queueItems.find((item) => item.consultationId === consultationId);
  const steps = computeConsultationJourney(patient, consultation, queueItem, labOrders, prescriptions);
  const currentStep = steps.find((s) => s.state === "current");

  function stepLabel(step: JourneyStep): string {
    return t(STEP_LABEL_KEYS[step.key]);
  }

  function currentStepAction() {
    if (!currentStep) return null;
    switch (currentStep.key) {
      case "queue":
        return null;
      case "preConsultation":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/pre-consultation`)} data-testid="button-hub-continue-pre-consultation">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "medicalConsultation":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)} data-testid="button-hub-continue-medical-consultation">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "exams":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/laboratoire/new?consultationId=${consultationId}`)} data-testid="button-hub-continue-exams">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "prescription":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/prescription`)} data-testid="button-hub-continue-prescription">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "carePlan":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/plan-prise-en-charge`)} data-testid="button-hub-continue-care-plan">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "closure":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/resume-cloture`)} data-testid="button-hub-continue-closure">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      default:
        return <Badge variant="secondary">{t("availableInFuturePhase")}</Badge>;
    }
  }

  return (
    <div className="space-y-6" data-testid="consultation-hub">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation("/consultations")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultations")}
        </Button>
        <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
          <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/edit`)} data-testid="button-edit-consultation">
            <Edit className="w-4 h-4 mr-2" />
            {t("editConsultation")}
          </Button>
        </PolicyGuard>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("consultation")} — {consultation.number ?? t("pendingSync")}</h1>
        <p className="text-sm text-muted-foreground">{patient.firstName} {patient.lastName} · {consultation.specialty}</p>
      </div>

      <div className="flex gap-6 items-start">
        <ConsultationJourneySidebar steps={steps} />

        <div className="flex-1 min-w-0 space-y-6">
          <div>
            <h2 className="font-semibold text-foreground">{t("quickViewTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("quickViewSubtitle")}</p>
          </div>

          <Card className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("motifCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">{consultation.reason}</p>
          </Card>

          <Card className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("vitalsCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/pre-consultation`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">
              {consultation.vitals
                ? `TA ${consultation.vitals.bloodPressureSystolic ?? "—"}/${consultation.vitals.bloodPressureDiastolic ?? "—"} | FC ${consultation.vitals.heartRate ?? "—"} | SpO₂ ${consultation.vitals.oxygenSaturation ?? "—"}%`
                : t("notStartedYet")}
            </p>
          </Card>

          {steps.find((s) => s.key === "queue")?.state !== "completed" && (
            <Card className="p-4 space-y-1 flex flex-col justify-between" data-testid="card-hub-queue">
              <span className="text-sm font-medium">{t("queueTitle")}</span>
              <Button variant="outline" size="sm" className="w-fit" onClick={() => queueMutation.mutate()} disabled={queueMutation.isPending} data-testid="button-add-to-queue">
                <ListPlus className="w-4 h-4 mr-2" />
                {t("putInQueue")}
              </Button>
            </Card>
          )}

          <Card className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("diagnosisCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">{consultation.diagnosisPrincipal?.label ?? t("notStartedYet")}</p>
          </Card>

          <Card className="p-4 space-y-1" data-testid="card-hub-exams">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("examsCardTitle")}</span>
              {labOrders.length > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/resultats-examens`)}>{t("viewLabel")}</Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {labOrders.length === 0 ? t("notStartedYet") : labOrders.map((o) => o.examLines.map((l) => l.examName).join(", ")).join(" · ")}
            </p>
          </Card>
          <Card className="p-4 space-y-1" data-testid="card-hub-prescription">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("prescriptionCardTitle")}</span>
              {prescriptions.length > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/prescription`)}>{t("viewLabel")}</Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {prescriptions.length === 0 ? t("notStartedYet") : prescriptions.flatMap((p) => p.lines.map((l) => l.drugName)).join(", ")}
            </p>
          </Card>
          <Card className="p-4 space-y-1" data-testid="card-hub-care-plan">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("carePlanCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/plan-prise-en-charge`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">
              {consultation.carePlan
                ? t(`carePlanOrientation${consultation.carePlan.orientation.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`)
                : t("notStartedYet")}
            </p>
          </Card>

          <Card className="p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{t("currentStepCta")}</h3>
              {currentStep && <p className="text-sm text-muted-foreground">{stepLabel(currentStep)}</p>}
            </div>
            {currentStepAction()}
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="flex gap-2">
          <Button variant="outline" disabled data-testid="button-add-note">
            <StickyNote className="w-4 h-4 mr-2" />
            {t("addNote")}
          </Button>
          <Button variant="outline" onClick={() => window.print()} data-testid="button-print-consultation">
            <Printer className="w-4 h-4 mr-2" />
            {t("printConsultation")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}`)} data-testid="button-patient-history">
            <User className="w-4 h-4 mr-2" />
            {t("patientHistory")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}/dossier-medical`)} data-testid="button-view-dossier-medical">
            {t("viewDossierMedicalAction")}
          </Button>
        </div>
        <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
          <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} data-testid="button-cancel-consultation">
            <Ban className="w-4 h-4 mr-2" />
            {t("cancelConsultationAction")}
          </Button>
        </PolicyGuard>
      </div>
    </div>
  );
}
