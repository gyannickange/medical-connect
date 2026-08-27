import React, { useState } from "react";
import { ArrowLeft, CheckCircle, ClipboardCheck, AlertTriangle, Printer } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { LabOrder, LabOrderExamLine } from "@shared/schema";

function statusLabelKey(status: string): string {
  return "labOrderStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function LabOrderDetails() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const [examLines, setExamLines] = useState<LabOrderExamLine[] | null>(null);
  const [problemDialogOpen, setProblemDialogOpen] = useState(false);
  const [problemReport, setProblemReport] = useState("");

  const { data: labOrder } = useQuery<LabOrder>({
    queryKey: ["/api/lab-orders/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/lab-orders/detail/${id}`, { credentials: "include" });
      return response.json();
    },
  });

  if (labOrder && examLines === null) {
    setExamLines(labOrder.examLines);
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

  function updateResult(index: number, resultText: string) {
    setExamLines((prev) => (prev ? prev.map((line, i) => (i === index ? { ...line, resultText } : line)) : prev));
  }

  if (!labOrder || !examLines) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="lab-order-detail-page">
      <Button variant="ghost" onClick={() => setLocation("/laboratoire")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("laboratoireTitle")}
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("labOrderDetailTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("requestedAtLabel")}: {new Date(labOrder.requestedAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{t(statusLabelKey(labOrder.status))}</Badge>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-lab-order">
            <Printer className="w-4 h-4 mr-2" />
            {t("printLabOrder")}
          </Button>
        </div>
      </div>

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

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("examResultsSection")}</h2>
        {examLines.map((line, index) => (
          <div key={index} className="space-y-1">
            <Label>{line.examName}</Label>
            <Textarea
              className="glass-input"
              placeholder={t("resultPlaceholder")}
              value={line.resultText ?? ""}
              onChange={(e) => updateResult(index, e.target.value)}
              disabled={labOrder.status === "termine"}
              data-testid={`textarea-result-${index}`}
            />
          </div>
        ))}
      </Card>

      <PolicyGuard policy={LabOrdersPolicy} action="canUpdate">
        <div className="flex flex-wrap justify-end gap-2">
          {labOrder.status === "demande" && (
            <Button className="btn-primary" onClick={() => updateMutation.mutate({ status: "en_cours" })} disabled={updateMutation.isPending} data-testid="button-take-in-charge">
              <ClipboardCheck className="w-4 h-4 mr-2" />
              {t("takeInCharge")}
            </Button>
          )}
          {(labOrder.status === "en_cours" || labOrder.status === "a_valider") && (
            <Button
              className="btn-primary"
              onClick={() => updateMutation.mutate({ status: "termine", examLines })}
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
      </PolicyGuard>

      <Dialog open={problemDialogOpen} onOpenChange={setProblemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reportProblem")}</DialogTitle>
          </DialogHeader>
          <Textarea
            className="glass-input"
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
