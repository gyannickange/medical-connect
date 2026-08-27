import React from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTranslation } from "../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation } from "@shared/schema";

interface ConsultationDetailsProps {
  consultationId: string;
  onBack: () => void;
}

function statusLabelKey(status: string): string {
  return "consultationStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function ConsultationDetails({ consultationId, onBack }: ConsultationDetailsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: consultation, isLoading } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (data: Partial<Consultation>) => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, data, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateConsultation"), t("networkRequestFailed"));
    },
  });

  if (isLoading || !consultation) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="consultation-details">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultations")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" disabled data-testid="button-put-in-queue">
            {t("putInQueue")}
          </Button>
          <Button
            className="btn-primary"
            onClick={() => patchMutation.mutate({ status: "terminee" })}
            disabled={patchMutation.isPending}
            data-testid="button-end-consultation">
            {t("endConsultation")}
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-1">
        <h2 className="text-lg font-semibold">{t("consultation")} — {consultation.number ?? t("pendingSync")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.specialty} · {t(statusLabelKey(consultation.status))}</p>
        <p>{consultation.reason}</p>
      </Card>

      <Card className="p-6 space-y-2">
        <Label htmlFor="clinicalObservations">{t("clinicalObservations")}</Label>
        <Textarea
          id="clinicalObservations"
          className="glass-input"
          defaultValue={consultation.clinicalObservations ?? ""}
          onBlur={(e) => patchMutation.mutate({ clinicalObservations: e.target.value })}
        />
      </Card>

      <Card className="p-6 space-y-2">
        <Label htmlFor="diagnosis">{t("diagnosisAndConclusion")}</Label>
        <Textarea
          id="diagnosis"
          className="glass-input"
          defaultValue={consultation.diagnosis ?? ""}
          onBlur={(e) => patchMutation.mutate({ diagnosis: e.target.value })}
        />
      </Card>
    </div>
  );
}
