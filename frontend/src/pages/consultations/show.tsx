import React from "react";
import { ArrowLeft, ArrowRight, Edit, Printer, User, StickyNote, Ban } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { computeConsultationJourney, type JourneyStep } from "@/lib/consultationJourney";
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
  const completedCount = steps.filter((s) => s.state === "completed").length;

  function stepLabel(step: JourneyStep): string {
    return t(STEP_LABEL_KEYS[step.key]);
  }

  function currentStepAction() {
    if (!currentStep) return null;
    switch (currentStep.key) {
      case "queue":
        return (
          <Button className="btn-primary" onClick={() => queueMutation.mutate()} disabled={queueMutation.isPending} data-testid="button-hub-add-to-queue">
            {t("putInQueue")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
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

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("journeyPanelTitle")}</h2>
          <ol className="space-y-3">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-2 text-sm" data-testid={`journey-step-${step.key}`}>
                <span
                  className={
                    step.state === "completed"
                      ? "w-2 h-2 rounded-full bg-primary"
                      : step.state === "current"
                        ? "w-2 h-2 rounded-full border-2 border-primary"
                        : "w-2 h-2 rounded-full bg-muted"
                  }
                />
                <span className={step.state === "not_started" ? "text-muted-foreground" : "text-foreground"}>{stepLabel(step)}</span>
              </li>
            ))}
          </ol>
          <Progress value={(completedCount / steps.length) * 100} />
          <p className="text-xs text-muted-foreground">{completedCount} / {steps.length}</p>
        </Card>

        <div className="space-y-6">
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
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("viewLabel")}</Button>
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
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("viewLabel")}</Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {prescriptions.length === 0 ? t("notStartedYet") : prescriptions.flatMap((p) => p.lines.map((l) => l.drugName)).join(", ")}
            </p>
          </Card>
          <Card className="p-4 space-y-1 opacity-60" data-testid="card-hub-care-plan">
            <span className="text-sm font-medium">{t("carePlanCardTitle")}</span>
            <p className="text-sm text-muted-foreground">{t("notStartedYet")}</p>
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
