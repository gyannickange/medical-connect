import React, { useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, FlaskConical } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
import type { Consultation, LabOrder, Patient } from "@shared/schema";

function statusLabelKey(status: string): string {
  return "labOrderStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function resultStatusLabelKey(status: string): string {
  return "examResultStatus" + status[0].toUpperCase() + status.slice(1);
}

function resultStatusBadgeVariant(status: string): "success" | "warning" | "destructive" {
  if (status === "normal") return "success";
  if (status === "bas" || status === "eleve") return "warning";
  return "destructive";
}

export default function ResultatExamens() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

  const [interpretation, setInterpretation] = useState<string | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
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

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  if (consultation && !initialized) {
    setInterpretation(consultation.examInterpretation);
    setDecision(consultation.examDecision);
    setInitialized(true);
  }

  const reviewMutation = useMutation({
    mutationFn: async (markReviewed: boolean) => {
      const response = await offlineApiRequest(
        "PUT",
        `/api/consultations/${consultationId}`,
        { examInterpretation: interpretation, examDecision: decision, ...(markReviewed ? { examsReviewedAt: new Date().toISOString() } : {}) },
        { collection: "consultations", entityId: consultationId }
      );
      return response.json();
    },
    onSuccess: (_, markReviewed) => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: markReviewed ? t("examsMarkedReviewedSuccessfully") : t("labOrderUpdatedSuccessfully") });
      if (markReviewed) setLocation(`/consultations/${consultationId}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateLabOrder"), t("networkRequestFailed"));
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const completedOrders = labOrders.filter((order) => order.status === "termine");
  const totalResultParameters = completedOrders.reduce(
    (sum, order) => sum + order.examLines.reduce((lineSum, line) => lineSum + Math.max((line.parameters ?? []).length, line.resultText ? 1 : 0), 0),
    0
  );

  return (
    <div className="space-y-6" data-testid="resultat-examens-page">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t("consultations")}</span>
        <ChevronRight className="w-3 h-3" />
        <span>{consultation.number ?? t("pendingSync")}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-foreground">{t("resultatExamensTitle")}</span>
      </div>

      <h1 className="text-2xl font-display font-bold text-foreground">{t("resultatExamensTitle")}</h1>

      <Card className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11">
            {photoUrl && <AvatarImage src={photoUrl} alt={`${patient.firstName} ${patient.lastName}`} />}
            <AvatarFallback>{`${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-bold text-foreground">{patient.firstName} {patient.lastName}</p>
            <p className="text-xs text-muted-foreground">{t("patientIdentifierLabel")} {patient.dossierNumber ?? t("pendingSync")}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">{t("ageGenderLabel")}</p>
          <p className="text-sm font-semibold text-foreground">{calculateAge(patient.dateOfBirth)}{t("yearsOldSuffix")} • {patient.sex === "F" ? t("genreFeminin") : t("genreMasculin")}</p>
        </div>
      </Card>

      {completedOrders.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 text-success px-4 py-3" data-testid="banner-results-available">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span className="text-sm font-medium">{t("resultsAvailableBannerLabel").replace("{count}", String(totalResultParameters))}</span>
        </div>
      )}

      {labOrders.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noLabOrders")}</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr] gap-6 items-start">
          <div className="space-y-4">
            <Card className="p-4 space-y-3" data-testid="card-exams-requested">
              <h2 className="font-semibold text-foreground">{t("examsRequestedSectionTitle")}</h2>
              <div className="space-y-2">
                {labOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{order.examLines.map((l) => l.examName).join(", ")}</p>
                      <Badge variant={order.status === "termine" ? "success" : "secondary"} className="mt-1">{t(statusLabelKey(order.status))}</Badge>
                    </div>
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 shrink-0"
                      onClick={() => document.getElementById(`result-detail-${order.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                      data-testid={`link-view-result-${order.id}`}>
                      {t("viewLabel")}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            {completedOrders.some((order) => order.labComment) && (
              <Card className="p-4 space-y-2">
                <h2 className="font-semibold text-foreground">{t("labCommentLabel")}</h2>
                {completedOrders
                  .filter((order) => order.labComment)
                  .map((order) => (
                    <p key={order.id} className="text-sm text-muted-foreground whitespace-pre-line">{order.labComment}</p>
                  ))}
              </Card>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="font-semibold text-foreground">{t("detailedResultsSectionTitle")}</h2>
            {labOrders.map((order) => (
              <Card key={order.id} id={`result-detail-${order.id}`} className="p-6 space-y-4 scroll-mt-4" data-testid={`result-order-${order.id}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-primary" />
                    <span className="font-semibold text-foreground">{order.examLines.map((l) => l.examName).join(", ")}</span>
                  </div>
                  <Badge>{t(statusLabelKey(order.status))}</Badge>
                </div>

                {order.status !== "termine" ? (
                  <p className="text-sm text-muted-foreground">{t("resultsPendingLabel")}</p>
                ) : (
                  <div className="space-y-4">
                    {order.examLines.map((line, index) =>
                      (line.parameters ?? []).length > 0 ? (
                        <div key={index} className="space-y-1.5">
                          <p className="text-sm font-medium text-foreground">{line.examName}</p>
                          <div className="hidden sm:grid grid-cols-[1.4fr_0.8fr_0.6fr_1fr_1fr] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <span>{t("parameterColumnLabel")}</span>
                            <span>{t("resultColumnLabel")}</span>
                            <span>{t("unitColumnLabel")}</span>
                            <span>{t("referenceRangeLabel")}</span>
                            <span>{t("statusColumnLabel")}</span>
                          </div>
                          {(line.parameters ?? []).map((parameter, paramIndex) => (
                            <div
                              key={paramIndex}
                              className="grid grid-cols-1 sm:grid-cols-[1.4fr_0.8fr_0.6fr_1fr_1fr] gap-2 items-center rounded-lg bg-muted/40 p-3"
                              data-testid={`result-parameter-${order.id}-${index}-${paramIndex}`}>
                              <p className="text-sm text-foreground">{parameter.name}</p>
                              <p className="text-sm font-semibold text-foreground">{parameter.value ?? "—"}</p>
                              <p className="text-sm text-muted-foreground">{parameter.unit || "—"}</p>
                              <p className="text-sm text-muted-foreground">{parameter.referenceRange || "—"}</p>
                              {parameter.status ? (
                                <Badge variant={resultStatusBadgeVariant(parameter.status)} className="w-fit">
                                  {t(resultStatusLabelKey(parameter.status))}
                                </Badge>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div key={index} className="space-y-1">
                          <p className="text-sm font-medium text-foreground">{line.examName}</p>
                          <p className="text-sm text-muted-foreground whitespace-pre-line">{line.resultText || t("resultPlaceholder")}</p>
                        </div>
                      )
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <Label htmlFor="exam-interpretation">{t("medicalInterpretationLabel")}</Label>
          <Textarea
            id="exam-interpretation"
            placeholder={t("medicalInterpretationPlaceholder")}
            value={interpretation ?? ""}
            onChange={(e) => setInterpretation(e.target.value)}
            data-testid="textarea-exam-interpretation"
          />
        </Card>
        <Card className="p-4 space-y-2">
          <Label htmlFor="exam-decision">{t("examDecisionLabel")}</Label>
          <Textarea
            id="exam-decision"
            placeholder={t("examDecisionPlaceholder")}
            value={decision ?? ""}
            onChange={(e) => setDecision(e.target.value)}
            data-testid="textarea-exam-decision"
          />
        </Card>
      </div>

      {consultation.examsReviewedAt && (
        <p className="text-xs text-muted-foreground text-right">{t("reviewedAtLabel")}: {new Date(consultation.examsReviewedAt).toLocaleString()}</p>
      )}

      <div className="flex justify-between gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}`)} data-testid="button-back-to-consultation">
          {t("backToConsultationAction")}
        </Button>
        <Button className="btn-primary" onClick={() => reviewMutation.mutate(true)} disabled={reviewMutation.isPending} data-testid="button-mark-reviewed">
          {t("markAsReviewedAction")}
        </Button>
      </div>
    </div>
  );
}
