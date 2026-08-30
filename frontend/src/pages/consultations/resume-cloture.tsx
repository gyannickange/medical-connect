import React, { useState } from "react";
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, ChevronRight, FileText, Folder, Pill } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { ConsultationJourneySidebar } from "./ConsultationJourneySidebar";
import { useConsultationJourney } from "./useConsultationJourney";
import type { Consultation, LabOrder, Patient, Prescription } from "@shared/schema";

const RESOLVED_LAB_ORDER_STATUSES = new Set(["termine", "annule"]);

function carePlanOrientationLabelKey(orientation: string): string {
  return `carePlanOrientation${orientation.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`;
}

export default function ResumeCloture() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { status: "terminee" }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationClosedSuccessfully") });
      if (consultation) {
        void offlineApiRequest(
          "POST",
          "/api/queue/events",
          { consultationId, patientId: consultation.patientId, eventType: "completed", tenantId: consultation.tenantId },
          { collection: "queue" }
        );
        queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      }
      setConfirmOpen(false);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCloseConsultation"), t("networkRequestFailed"));
      setConfirmOpen(false);
    },
  });

  const steps = useConsultationJourney(consultation, patient);

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pendingLabOrders = labOrders.filter((o) => !RESOLVED_LAB_ORDER_STATUSES.has(o.status));
  const vitals = consultation.vitals;
  const vitalCards = [
    { label: t("bloodPressureSystolic"), value: vitals?.bloodPressureSystolic == null ? "—" : `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic ?? "—"} mmHg`, className: "bg-blue-50 text-blue-700" },
    { label: t("heartRateField"), value: vitals?.heartRate == null ? "—" : `${vitals.heartRate} bpm`, className: "bg-green-50 text-green-700" },
    { label: t("oxygenSaturationField"), value: vitals?.oxygenSaturation == null ? "—" : `${vitals.oxygenSaturation}%`, className: "bg-emerald-50 text-emerald-700" },
    { label: t("temperatureField"), value: vitals?.temperature == null ? "—" : `${vitals.temperature} °C`, className: "bg-amber-50 text-amber-700" },
  ];
  const physicalFindings = consultation.physicalExam?.systemFindings.filter((finding) => finding.notes) ?? [];

  if (consultation.status === "terminee" && consultation.closedAt) {
    const closedAtDate = new Date(consultation.closedAt);
    return (
      <div className="space-y-6" data-testid="resume-cloture-success">
        <div className="flex flex-col items-center text-center gap-2 py-8">
          <CheckCircle2 className="w-16 h-16 text-primary" />
          <h1 className="text-2xl font-display font-bold text-foreground">{t("closureSuccessTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("closureSuccessSubtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Card className="p-6 space-y-3">
            <h2 className="font-semibold text-foreground">{t("resumeClotureTitle")}</h2>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">#</span><span>{consultation.number ?? t("pendingSync")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("patients")}</span><span>{patient.firstName} {patient.lastName}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("specialtyField")}</span><span>{consultation.specialty}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("dateOfBirth")}</span><span>{closedAtDate.toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("startDateLabel")}</span><span>{closedAtDate.toLocaleTimeString()}</span></div>
            </div>
          </Card>
          <Card className="p-6 space-y-3">
            <h2 className="font-semibold text-foreground">{t("statusAfterClosure")}</h2>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{t("statusBeforeClosure")}</Badge>
              <span>→</span>
              <Badge>{t("statusAfterClosure")}</Badge>
            </div>
            <div className="space-y-1 text-sm pt-2 border-t border-border">
              {prescriptions.map((p) => (
                <div key={p.id} className="flex justify-between">
                  <span className="text-muted-foreground">{t("prescriptionCardTitle")}</span>
                  <Badge variant="secondary">{t("prescriptionStatus" + p.status[0].toUpperCase() + p.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
                </div>
              ))}
              {labOrders.map((o) => (
                <div key={o.id} className="flex justify-between">
                  <span className="text-muted-foreground">{o.examLines.map((l) => l.examName).join(", ")}</span>
                  <Badge variant="secondary">{t("labOrderStatus" + o.status[0].toUpperCase() + o.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
                </div>
              ))}
              {consultation.carePlan?.orientation === "controle_suivi" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("appointmentDateField")}</span>
                  <Badge variant="secondary">{consultation.carePlan.appointmentDate}</Badge>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button className="btn-primary" onClick={() => setLocation("/consultations")} data-testid="button-back-to-consultations">
            {t("backToConsultationsAction")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}/dossier-medical`)}>
            <Folder className="w-4 h-4 mr-2" />
            {t("viewPatientRecordAction")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
            <FileText className="w-4 h-4 mr-2" />
            {t("consultationMedicaleTitle")}
          </Button>
          {prescriptions.length > 0 && (
            <Button variant="outline" onClick={() => setLocation(`/pharmacie/${prescriptions[0].id}`)}>
              <Pill className="w-4 h-4 mr-2" />
              {t("prescriptionCardTitle")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 items-start" data-testid="resume-cloture-page">
      <ConsultationJourneySidebar steps={steps} />
      <div className="flex-1 min-w-0 space-y-6 pb-10" data-testid="resume-cloture-form">
      <div className="flex flex-col gap-4 border-b border-border bg-card px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div>
          <Button variant="link" size="sm" className="h-auto p-0 text-xs font-medium text-muted-foreground" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
            {consultation.number ?? t("pendingSync")} <span className="mx-1">›</span> {t("journeyStepClosure")}
          </Button>
          <h1 className="mt-1 text-2xl font-bold leading-8 text-foreground">{t("resumeClotureTitle")}</h1>
        </div>
        <Badge className="w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">{t("journeyStepClosure")} 9/9</Badge>
      </div>

      <Card className="space-y-4 p-5">
        <h2 className="text-[15px] font-semibold text-foreground">{t("patients")}</h2>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-base font-bold text-gray-600">{patient.firstName[0]}{patient.lastName[0]}</div>
            <div>
              <p className="font-bold text-foreground">{patient.firstName} {patient.lastName}</p>
              <p className="text-sm text-muted-foreground">{patient.dossierNumber ?? t("pendingSync")}</p>
            </div>
          </div>
          <div className="text-sm sm:text-right">
            <p className="font-semibold text-foreground">{consultation.specialty}</p>
            <p className="text-xs text-muted-foreground">{new Date(consultation.updatedAt).toLocaleString()}</p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionTitle label={t("visitReason")} onClick={() => setLocation(`/consultations/${consultationId}/edit`)} action={t("modifyLabel")} />
        <p className="text-sm leading-6 text-muted-foreground">{consultation.reason || t("notStartedYet")}</p>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionTitle label={t("vitalsCardTitle")} onClick={() => setLocation(`/consultations/${consultationId}/pre-consultation`)} action={t("viewDetailsAction")} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {vitalCards.map((vital) => (
            <div key={vital.label} className={`rounded-lg p-3 ${vital.className}`}>
              <p className="text-xs font-medium">{vital.label}</p>
              <p className="mt-1 text-base font-bold">{vital.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionTitle label={t("anamneseSection")} onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)} action={t("modifyLabel")} />
        <p className="text-sm leading-6 text-muted-foreground">{consultation.presentIllnessHistory || consultation.symptoms || t("notStartedYet")}</p>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionTitle label={t("physicalExamSection")} onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)} action={t("modifyLabel")} />
        <div className="space-y-2 text-sm leading-6 text-muted-foreground">
          {physicalFindings.length > 0 ? physicalFindings.map((finding) => <p key={finding.system}><span className="font-semibold text-foreground">{finding.system}: </span>{finding.notes}</p>) : <p>{consultation.physicalExam?.generalState || t("notStartedYet")}</p>}
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <SectionTitle label={t("diagnosisCardTitle")} onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)} action={t("modifyLabel")} />
        <div className="space-y-2 text-sm text-foreground">
          <p><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" /><span className="font-semibold">{consultation.diagnosisPrincipal?.label ?? t("notStartedYet")}</span></p>
          {consultation.diagnosisSecondary.map((diagnosis) => <p key={diagnosis} className="text-muted-foreground"><span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-gray-400 align-middle" />{diagnosis}</p>)}
        </div>
      </Card>

      <Card className="space-y-4 p-5" data-testid="card-resume-exams">
        <SectionTitle label={t("examsCardTitle")} onClick={() => setLocation(`/laboratoire/new?consultationId=${consultationId}`)} action={t("viewDetailsAction")} />
        <p className="text-sm leading-6 text-muted-foreground">{labOrders.length === 0 ? t("notStartedYet") : labOrders.map((order) => order.examLines.map((line) => line.examName).join(", ")).join(" · ")}</p>
      </Card>

      <Card className="space-y-4 p-5" data-testid="card-resume-prescriptions">
        <SectionTitle label={t("prescriptionCardTitle")} onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)} action={t("viewDetailsAction")} />
        <p className="text-sm leading-6 text-muted-foreground">{prescriptions.length === 0 ? t("notStartedYet") : prescriptions.flatMap((prescription) => prescription.lines.map((line) => line.drugName)).join(", ")}</p>
      </Card>

      <Card className="space-y-4 p-5" data-testid="card-resume-care-plan">
        <SectionTitle label={t("carePlanCardTitle")} onClick={() => setLocation(`/consultations/${consultationId}/plan-prise-en-charge`)} action={t("modifyLabel")} />
        <p className="text-sm leading-6 text-muted-foreground">{consultation.carePlan ? t(carePlanOrientationLabelKey(consultation.carePlan.orientation)) : t("notStartedYet")}</p>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button className="btn-primary" data-testid="button-open-close-confirm">
            <Ban className="w-4 h-4 mr-2" />
            {t("confirmCloseConsultationAction")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 text-destructive shrink-0" />
              <AlertDialogTitle>{t("closeConsultationConfirmTitle")}</AlertDialogTitle>
            </div>
            <AlertDialogDescription>
              {pendingLabOrders.length > 0 && (
                <span className="block mb-2">{pendingLabOrders.length} {t("closeConsultationPendingExamsWarning")}</span>
              )}
              {t("closeConsultationArchiveNotice")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending} data-testid="button-confirm-close-consultation">
              {t("confirmCloseConsultationAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}

function SectionTitle({ label, action, onClick }: { label: string; action: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-[15px] font-semibold text-foreground">{label}</h2>
      <Button variant="link" size="sm" className="h-auto p-0 text-[13px] font-semibold text-primary" onClick={onClick}>
        {action}<ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
