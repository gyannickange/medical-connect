import React, { useRef, useState } from "react";
import { ArrowLeft, CheckCircle, ChevronRight, ClipboardCheck, AlertTriangle, Paperclip, Printer, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { cn } from "@/lib/utils";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Consultation, ExamResultStatus, LabOrder, LabOrderExamLine, Patient, User } from "@shared/schema";

function statusLabelKey(status: string): string {
  return "labOrderStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const RESULT_STATUSES: ExamResultStatus[] = ["normal", "bas", "eleve", "anormal"];

function resultStatusLabelKey(status: ExamResultStatus): string {
  return "examResultStatus" + status[0].toUpperCase() + status.slice(1);
}

function resultStatusPillClass(status: ExamResultStatus | null): string {
  switch (status) {
    case "normal":
      return "bg-emerald-500/15 text-success";
    case "bas":
    case "eleve":
      return "bg-amber-500/15 text-warning";
    case "anormal":
      return "bg-destructive/15 text-destructive";
    default:
      return "";
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function LabOrderDetails() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [examLines, setExamLines] = useState<LabOrderExamLine[] | null>(null);
  const [labComment, setLabComment] = useState<string | null>(null);
  const [problemDialogOpen, setProblemDialogOpen] = useState(false);
  const [problemReport, setProblemReport] = useState("");
  const [uploading, setUploading] = useState(false);

  const { data: labOrder } = useQuery<LabOrder>({
    queryKey: ["/api/lab-orders/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/lab-orders/detail/${id}`, { credentials: "include" });
      return response.json();
    },
  });

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", labOrder?.consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${labOrder?.consultationId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!labOrder?.consultationId,
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
  const prescriber = staffList.find((member) => member.id === labOrder?.requestedByUserId);

  if (labOrder && examLines === null) {
    setExamLines(labOrder.examLines.map((line) => ({ ...line, parameters: line.parameters ?? [] })));
    setLabComment(labOrder.labComment);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await offlineApiRequest("PUT", `/api/lab-orders/${id}`, data, { collection: "lab-orders", entityId: id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders/detail", id] });
      queryClient.invalidateQueries({ queryKey: [`/api/lab-orders/${currentTenant?.id}`] });
      if (labOrder) {
        queryClient.invalidateQueries({ queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${labOrder.consultationId}`] });
      }
      toast({ title: t("success"), description: t("labOrderUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateLabOrder"), t("networkRequestFailed"));
    },
  });

  async function handleFileSelected(file: File) {
    setUploading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      await offlineApiRequest(
        "POST",
        `/api/lab-orders/${id}/attachments`,
        { fileName: file.name, contentType: file.type || "application/octet-stream", fileBase64 },
        { collection: "lab-orders", entityId: id }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders/detail", id] });
      toast({ title: t("success"), description: t("labOrderUpdatedSuccessfully") });
    } catch (error) {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateLabOrder"), t("networkRequestFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function openAttachment(attachmentId: string) {
    const response = await fetch(`/api/lab-orders/${id}/attachments/${attachmentId}/url`, { credentials: "include" });
    if (!response.ok) return;
    const body = await response.json();
    window.open(body.url, "_blank", "noopener,noreferrer");
  }

  function updateResult(index: number, resultText: string) {
    setExamLines((prev) => (prev ? prev.map((line, i) => (i === index ? { ...line, resultText } : line)) : prev));
  }

  function updateParameterResult(lineIndex: number, paramIndex: number, patch: { value?: string; status?: ExamResultStatus }) {
    setExamLines((prev) =>
      prev
        ? prev.map((line, i) =>
            i === lineIndex
              ? { ...line, parameters: line.parameters.map((p, pi) => (pi === paramIndex ? { ...p, ...patch } : p)) }
              : line
          )
        : prev
    );
  }

  if (!labOrder || !examLines) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const locked = labOrder.status === "termine";

  return (
    <div className="space-y-6" data-testid="lab-order-detail-page">
      <Button variant="ghost" onClick={() => setLocation("/laboratoire")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("laboratoireTitle")}
      </Button>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>{t("laboratoireTitle")}</span>
        <ChevronRight className="w-3 h-3" />
        <span className="font-medium text-foreground">{t("breadcrumbResultsEntryLabel")}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("labOrderDetailTitle")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{t(statusLabelKey(labOrder.status))}</Badge>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-lab-order">
            <Printer className="w-4 h-4 mr-2" />
            {t("printLabOrder")}
          </Button>
        </div>
      </div>

      {patient && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-foreground">{patient.firstName} {patient.lastName}</p>
            <p className="text-xs text-muted-foreground">{t("patientIdentifierLabel")} {patient.dossierNumber ?? t("pendingSync")}</p>
          </div>
          <div className="text-right">
            {prescriber && (
              <p className="text-sm text-foreground">
                {t("prescribedByLabel")} {prescriber.firstName} {prescriber.lastName}
                {prescriber.specialty && <span className="text-muted-foreground"> ({prescriber.specialty})</span>}
              </p>
            )}
            <p className="text-xs text-muted-foreground">{t("requestedAtLabel")}: {new Date(labOrder.requestedAt).toLocaleString()}</p>
          </div>
        </Card>
      )}

      {labOrder.clinicalContext && (
        <Card className="p-4 space-y-1">
          <p className="text-sm font-medium text-foreground">{t("clinicalContextLabel")}</p>
          <p className="text-sm text-muted-foreground">{labOrder.clinicalContext}</p>
        </Card>
      )}
      {labOrder.specialInstructions && (
        <Card className="p-4 space-y-1">
          <p className="text-sm font-medium text-foreground">{t("specialInstructionsLabel")}</p>
          <p className="text-sm text-muted-foreground">{labOrder.specialInstructions}</p>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="font-semibold text-foreground">{t("examResultsSection")}</h2>
        {examLines.map((line, index) => (
          <Card key={index} className="rounded-xl overflow-hidden p-0" data-testid={`exam-group-card-${index}`}>
            <div className="flex">
              <div className="w-1.5 bg-primary shrink-0" />
              <div className="flex-1 p-5 space-y-3 min-w-0">
                <p className="font-semibold text-foreground">{line.examName}</p>
                {line.parameters.length > 0 ? (
                  <div className="space-y-1.5">
                    <div className="hidden sm:grid grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] gap-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <span>{t("parameterColumnLabel")}</span>
                      <span>{t("resultColumnLabel")}</span>
                      <span>{t("unitColumnLabel")}</span>
                      <span>{t("referenceRangeLabel")}</span>
                      <span>{t("statusColumnLabel")}</span>
                    </div>
                    {line.parameters.map((parameter, paramIndex) => (
                      <div
                        key={paramIndex}
                        className={cn(
                          "grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_0.8fr_1fr_1fr] gap-2 items-center rounded-lg p-3",
                          parameter.status && parameter.status !== "normal" ? "bg-amber-50 dark:bg-amber-950/20" : "bg-muted/40"
                        )}
                        data-testid={`exam-parameter-result-${index}-${paramIndex}`}>
                        <p className="text-sm font-medium text-foreground">{parameter.name}</p>
                        <Input
                          placeholder={t("resultValuePlaceholder")}
                          value={parameter.value ?? ""}
                          onChange={(e) => updateParameterResult(index, paramIndex, { value: e.target.value })}
                          disabled={locked}
                          data-testid={`input-parameter-result-value-${index}-${paramIndex}`}
                        />
                        <p className="text-sm text-muted-foreground">{parameter.unit || "—"}</p>
                        <p className="text-sm text-muted-foreground">{parameter.referenceRange || "—"}</p>
                        <Select
                          value={parameter.status ?? undefined}
                          onValueChange={(value) => updateParameterResult(index, paramIndex, { status: value as ExamResultStatus })}
                          disabled={locked}>
                          <SelectTrigger
                            className={cn("rounded-full border-transparent font-medium", resultStatusPillClass(parameter.status))}
                            data-testid={`select-parameter-status-${index}-${paramIndex}`}>
                            <SelectValue placeholder={t("resultStatusPlaceholder")} />
                          </SelectTrigger>
                          <SelectContent>
                            {RESULT_STATUSES.map((status) => (
                              <SelectItem key={status} value={status}>{t(resultStatusLabelKey(status))}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Textarea
                      placeholder={t("resultPlaceholder")}
                      value={line.resultText ?? ""}
                      onChange={(e) => updateResult(index, e.target.value)}
                      disabled={locked}
                      data-testid={`textarea-result-${index}`}
                    />
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-2">
          <Label htmlFor="lab-comment">{t("labCommentLabel")}</Label>
          <Textarea
            id="lab-comment"
            placeholder={t("labCommentPlaceholder")}
            value={labComment ?? ""}
            onChange={(e) => setLabComment(e.target.value)}
            disabled={locked}
            data-testid="textarea-lab-comment"
          />
        </Card>
        <Card className="p-4 space-y-2">
          <Label>{t("attachDocumentLabel")}</Label>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFileSelected(file);
              e.target.value = "";
            }}
            data-testid="input-attachment-file"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || locked}
            className="w-full rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors disabled:opacity-50"
            data-testid="button-attach-document">
            <Paperclip className="w-4 h-4 mx-auto mb-1" />
            {uploading ? t("uploadingLabel") : t("attachDocumentAction")}
          </button>
          {(labOrder.attachments ?? []).length > 0 && (
            <div className="space-y-1">
              {(labOrder.attachments ?? []).map((attachment) => (
                <Button
                  key={attachment.id}
                  type="button"
                  variant="link"
                  size="sm"
                  className="h-auto p-0 flex items-center gap-1.5 text-primary"
                  onClick={() => void openAttachment(attachment.id)}
                  data-testid={`link-attachment-${attachment.id}`}>
                  <Paperclip className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{attachment.fileName}</span>
                </Button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <PolicyGuard policy={LabOrdersPolicy} action="canUpdate">
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
          {labOrder.status === "demande" && (
            <Button className="btn-primary" onClick={() => updateMutation.mutate({ status: "en_cours" })} disabled={updateMutation.isPending} data-testid="button-take-in-charge">
              <ClipboardCheck className="w-4 h-4 mr-2" />
              {t("takeInCharge")}
            </Button>
          )}
          {!locked && labOrder.status !== "annule" && (
            <Button
              variant="outline"
              onClick={() => updateMutation.mutate({ examLines, labComment })}
              disabled={updateMutation.isPending}
              data-testid="button-save-draft">
              <Save className="w-4 h-4 mr-2" />
              {t("saveAsDraftAction")}
            </Button>
          )}
          {(labOrder.status === "en_cours" || labOrder.status === "a_valider") && (
            <Button
              className="btn-primary"
              onClick={() => updateMutation.mutate({ status: "termine", examLines, labComment })}
              disabled={updateMutation.isPending}
              data-testid="button-validate-results">
              <CheckCircle className="w-4 h-4 mr-2" />
              {t("validateResults")}
            </Button>
          )}
          {labOrder.status !== "termine" && labOrder.status !== "annule" && (
            <Button variant="outline" onClick={() => setProblemDialogOpen(true)} data-testid="button-report-problem">
              <AlertTriangle className="w-4 h-4 mr-2" />
              {t("reportProblem")}
            </Button>
          )}
        </div>
        {!locked && <p className="text-xs text-muted-foreground text-right">{t("draftSaveHintNote")}</p>}
      </PolicyGuard>

      <Dialog open={problemDialogOpen} onOpenChange={setProblemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reportProblem")}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={t("problemReportPlaceholder")}
            value={problemReport}
            onChange={(e) => setProblemReport(e.target.value)}
            data-testid="textarea-problem-report"
          />
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                updateMutation.mutate({ status: "probleme_signale", problemReport });
                setProblemDialogOpen(false);
              }}
              data-testid="button-confirm-problem-report">
              {t("reportProblem")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
