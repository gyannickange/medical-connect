import React, { useState } from "react";
import { ArrowLeft, Bell } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PolicyGuard } from "@/components/PolicyGuard";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { LabOrder, LabOrderFollowUpAction } from "@shared/schema";

const FOLLOW_UP_ACTIONS: LabOrderFollowUpAction[] = ["aucune_action", "contacter_patient", "modifier_traitement", "programmer_rdv", "nouvel_examen"];

const FOLLOW_UP_ACTION_LABEL_KEYS: Record<LabOrderFollowUpAction, string> = {
  aucune_action: "followUpActionAucuneAction",
  contacter_patient: "followUpActionContacterPatient",
  modifier_traitement: "followUpActionModifierTraitement",
  programmer_rdv: "followUpActionProgrammerRdv",
  nouvel_examen: "followUpActionNouvelExamen",
};

export default function SuiviResultat() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId, labOrderId } = useParams<{ id: string; labOrderId: string }>();

  const [action, setAction] = useState<LabOrderFollowUpAction>("aucune_action");
  const [note, setNote] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: labOrder } = useQuery<LabOrder>({
    queryKey: ["/api/lab-orders/detail", labOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/lab-orders/detail/${labOrderId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!labOrderId,
  });

  if (labOrder && !initialized) {
    setAction(labOrder.followUpAction ?? "aucune_action");
    setNote(labOrder.followUpNote ?? "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PATCH", `/api/lab-orders/${labOrderId}/follow-up`, { followUpAction: action, followUpNote: note || undefined }, { collection: "labOrders", entityId: labOrderId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders/detail", labOrderId] });
      toast({ title: t("success"), description: t("followUpSavedSuccessfully") });
      setLocation(`/consultations/${consultationId}/suivi`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveFollowUp"), t("networkRequestFailed"));
    },
  });

  if (!labOrder) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="suivi-resultat-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/suivi`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("suiviTitle")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("resultDetailTitle")}</h1>
      </div>

      <Card className="p-4 flex items-start gap-3 border-primary/40 bg-primary/5">
        <Bell className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <p className="text-sm">
          {t("patientTimelineLabResult")} — {labOrder.examLines.map((l) => l.examName).join(", ")}
        </p>
      </Card>

      <Card className="p-6 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{t("examTypesRequested")}</h2>
          <Badge>{t("labOrderStatus" + labOrder.status[0].toUpperCase() + labOrder.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
        </div>
        {labOrder.examLines.map((line, index) => (
          <p key={index} className="text-sm">
            <span className="font-medium">{line.examName}: </span>
            <span className="text-muted-foreground">{line.resultText ?? t("notStartedYet")}</span>
          </p>
        ))}
      </Card>

      <PolicyGuard policy={LabOrdersPolicy} action="canRecordFollowUp">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("actionToTakeTitle")}</h2>
          <RadioGroup value={action} onValueChange={(value) => setAction(value as LabOrderFollowUpAction)} className="space-y-2">
            {FOLLOW_UP_ACTIONS.map((value) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`followup-${value}`} data-testid={`radio-followup-${value}`} />
                <Label htmlFor={`followup-${value}`}>{t(FOLLOW_UP_ACTION_LABEL_KEYS[value])}</Label>
              </div>
            ))}
          </RadioGroup>
          <div>
            <Label htmlFor="followup-note">{t("followUpNoteField")}</Label>
            <Textarea id="followup-note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="textarea-followup-note" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/suivi`)}>
              {t("cancel")}
            </Button>
            <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-validate-followup">
              {t("validateAction")}
            </Button>
          </div>
        </Card>
      </PolicyGuard>
    </div>
  );
}
