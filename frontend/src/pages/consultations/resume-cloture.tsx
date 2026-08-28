import React, { useState } from "react";
import { AlertTriangle, ArrowLeft, Ban, CheckCircle2, FileText, Folder, Pill } from "lucide-react";
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
      setConfirmOpen(false);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCloseConsultation"), t("networkRequestFailed"));
      setConfirmOpen(false);
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pendingLabOrders = labOrders.filter((o) => !RESOLVED_LAB_ORDER_STATUSES.has(o.status));

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
    <div className="space-y-6" data-testid="resume-cloture-form">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultationMedicaleTitle")}
        </Button>
        <Badge variant="secondary">{t("journeyStepClosure")} — 9/9</Badge>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("resumeClotureTitle")} — {consultation.number ?? t("pendingSync")}</h1>
        <p className="text-sm text-muted-foreground">{t("resumeClotureSubtitle")}</p>
      </div>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("patients")}</h2>
        <p className="text-sm text-muted-foreground">{patient.firstName} {patient.lastName}</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("visitReason")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.reason}</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("diagnosisCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.diagnosisPrincipal?.label ?? t("notStartedYet")}</p>
      </Card>
      <Card className="p-6 space-y-2" data-testid="card-resume-exams">
        <h2 className="font-semibold text-foreground">{t("examsCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {labOrders.length === 0 ? t("notStartedYet") : labOrders.map((o) => o.examLines.map((l) => l.examName).join(", ")).join(" · ")}
        </p>
      </Card>
      <Card className="p-6 space-y-2" data-testid="card-resume-prescriptions">
        <h2 className="font-semibold text-foreground">{t("prescriptionCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {prescriptions.length === 0 ? t("notStartedYet") : prescriptions.flatMap((p) => p.lines.map((l) => l.drugName)).join(", ")}
        </p>
      </Card>
      <Card className="p-6 space-y-2" data-testid="card-resume-care-plan">
        <h2 className="font-semibold text-foreground">{t("carePlanCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {consultation.carePlan ? t(carePlanOrientationLabelKey(consultation.carePlan.orientation)) : t("notStartedYet")}
        </p>
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
  );
}
