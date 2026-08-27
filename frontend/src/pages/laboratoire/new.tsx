import React, { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation, Patient } from "@shared/schema";

export default function NewLabOrder() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const consultationId = searchParams.get("consultationId") ?? "";

  const [examNames, setExamNames] = useState<string[]>([]);
  const [newExamName, setNewExamName] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [clinicalContext, setClinicalContext] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultationId,
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", consultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${consultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultation?.patientId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest(
        "POST",
        "/api/lab-orders",
        { consultationId, examLines: examNames.map((examName) => ({ examName })), priority, clinicalContext, specialInstructions },
        { collection: "lab-orders" }
      );
      return response.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: [`/api/lab-orders/${currentTenant?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`] });
      toast({ title: t("success"), description: t("labOrderCreatedSuccessfully") });
      setLocation(`/laboratoire/${created.id}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateLabOrder"), t("networkRequestFailed"));
    },
  });

  function addExamName() {
    if (!newExamName.trim()) return;
    setExamNames((prev) => [...prev, newExamName.trim()]);
    setNewExamName("");
  }

  if (!consultationId) {
    return <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noLabOrders")}</div>;
  }

  return (
    <div className="space-y-6" data-testid="new-lab-order-page">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("newLabOrderTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("newLabOrderSubtitle")}</p>
      </div>

      {patient && (
        <Card className="p-4">
          <p className="font-semibold text-foreground">{patient.firstName} {patient.lastName}</p>
          <p className="text-sm text-muted-foreground">{patient.dossierNumber ?? t("pendingSync")}</p>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div>
          <Label>{t("examTypesRequested")}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {examNames.map((name, index) => (
              <Badge key={`${name}-${index}`} variant="secondary" className="gap-1">
                {name}
                <button type="button" onClick={() => setExamNames((prev) => prev.filter((_, i) => i !== index))} aria-label={t("cancel")}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={newExamName}
              onChange={(e) => setNewExamName(e.target.value)}
              placeholder={t("newExamNamePlaceholder")}
              className="glass-input"
              data-testid="input-new-exam-name"
            />
            <Button type="button" variant="outline" onClick={addExamName} data-testid="button-add-exam-line">
              <Plus className="w-4 h-4 mr-1" />
              {t("addExamLine")}
            </Button>
          </div>
        </div>

        <div>
          <Label>{t("priorityLevelLabel")}</Label>
          <RadioGroup value={priority} onValueChange={(v) => setPriority(v as "normal" | "urgent")} className="flex gap-4 mt-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="normal" id="priority-normal" />
              <Label htmlFor="priority-normal">{t("priorityNormal")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="urgent" id="priority-urgent" />
              <Label htmlFor="priority-urgent">{t("priorityUrgent")}</Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label htmlFor="clinicalContext">{t("clinicalContextLabel")}</Label>
          <Textarea id="clinicalContext" className="glass-input" value={clinicalContext} onChange={(e) => setClinicalContext(e.target.value)} data-testid="textarea-clinical-context" />
        </div>

        <div>
          <Label htmlFor="specialInstructions">{t("specialInstructionsLabel")}</Label>
          <Textarea id="specialInstructions" className="glass-input" value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} data-testid="textarea-special-instructions" />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("cancel")}</Button>
        <Button
          className="btn-primary"
          onClick={() => createMutation.mutate()}
          disabled={examNames.length === 0 || createMutation.isPending}
          data-testid="button-send-to-lab">
          {createMutation.isPending ? t("saving") : t("sendToLab")}
        </Button>
      </div>
    </div>
  );
}
