import React, { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PrescriptionsPolicy } from "@/lib/policies/prescriptions.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Consultation, DiagnosisPrincipal, ExamSystem, LabOrder, Patient, PhysicalExam, Prescription } from "@shared/schema";

const EXAM_SYSTEMS: ExamSystem[] = ["cardiovasculaire", "respiratoire", "neurologique", "digestif", "orl", "dermatologique"];

const EMPTY_PHYSICAL_EXAM: PhysicalExam = {
  generalState: null,
  consciousness: null,
  hydration: null,
  systemFindings: EXAM_SYSTEMS.map((system) => ({ system, status: "non_examine", notes: null })),
};

export default function ConsultationMedicaleForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

  const [relevantHistory, setRelevantHistory] = useState<string[]>([]);
  const [newHistoryEntry, setNewHistoryEntry] = useState("");
  const [presentIllnessHistory, setPresentIllnessHistory] = useState("");
  const [physicalExam, setPhysicalExam] = useState<PhysicalExam>(EMPTY_PHYSICAL_EXAM);
  const [diagnosisPrincipal, setDiagnosisPrincipal] = useState<DiagnosisPrincipal | null>(null);
  const [diagnosisSecondary, setDiagnosisSecondary] = useState<string[]>([]);
  const [newSecondaryDiagnosis, setNewSecondaryDiagnosis] = useState("");
  const [diagnosisHypothesis, setDiagnosisHypothesis] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [newDrugName, setNewDrugName] = useState("");
  const [newDosage, setNewDosage] = useState("");
  const [newFrequency, setNewFrequency] = useState("");

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

  if (consultation && !initialized) {
    setRelevantHistory(consultation.relevantHistory ?? []);
    setPresentIllnessHistory(consultation.presentIllnessHistory ?? "");
    setPhysicalExam(consultation.physicalExam ?? EMPTY_PHYSICAL_EXAM);
    setDiagnosisPrincipal(consultation.diagnosisPrincipal ?? null);
    setDiagnosisSecondary(consultation.diagnosisSecondary ?? []);
    setDiagnosisHypothesis(consultation.diagnosisHypothesis ?? "");
    setInitialized(true);
  }

  function payload() {
    return { relevantHistory, presentIllnessHistory, physicalExam, diagnosisPrincipal, diagnosisSecondary, diagnosisHypothesis };
  }

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, payload(), { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("draftSavedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveConsultation"), t("networkRequestFailed"));
    },
  });

  const markCompletedMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { ...payload(), status: "terminee" }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationMarkedCompleted") });
      setLocation(`/consultations/${consultationId}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveConsultation"), t("networkRequestFailed"));
    },
  });

  const addPrescriptionLineMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest(
        "POST",
        "/api/prescriptions",
        { consultationId, lines: [{ drugName: newDrugName, dosage: newDosage, frequency: newFrequency }] },
        { collection: "prescriptions" }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`] });
      toast({ title: t("success"), description: t("prescriptionCreatedSuccessfully") });
      setNewDrugName("");
      setNewDosage("");
      setNewFrequency("");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreatePrescription"), t("networkRequestFailed"));
    },
  });

  function updateFinding(system: ExamSystem, patch: Partial<{ status: "normal" | "anormal" | "non_examine"; notes: string }>) {
    setPhysicalExam((prev) => ({
      ...prev,
      systemFindings: prev.systemFindings.map((f) => (f.system === system ? { ...f, ...patch } : f)),
    }));
  }

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isPending = saveDraftMutation.isPending || markCompletedMutation.isPending;

  return (
    <div className="space-y-6 pb-24" data-testid="consultation-medicale-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("consultationMedicaleTitle")} — {consultation.number ?? t("pendingSync")}</h1>
      </div>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("clinicalSummaryCardTitle")}</h2>
        <p className="text-sm"><span className="text-muted-foreground">{t("antecedentsLabel")}: </span>{[patient.medicalHistory, patient.surgicalHistory, patient.chronicDiseases].filter(Boolean).join(" · ") || "—"}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("allergiesLabel")}: </span>{patient.allergyDetails || "—"}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("currentTreatmentsLabel")}: </span>{patient.currentTreatments || "—"}</p>
      </Card>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("visitReason")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.reason}</p>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("anamneseSection")}</h2>
        <div>
          <Label htmlFor="presentIllnessHistory">{t("presentIllnessHistoryField")}</Label>
          <Textarea id="presentIllnessHistory" className="glass-input" value={presentIllnessHistory} onChange={(e) => setPresentIllnessHistory(e.target.value)} data-testid="textarea-present-illness-history" />
        </div>
        <div>
          <Label>{t("relevantHistoryTags")}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {relevantHistory.map((entry, index) => (
              <Badge key={`${entry}-${index}`} variant="secondary" className="gap-1">
                {entry}
                <button type="button" onClick={() => setRelevantHistory((prev) => prev.filter((_, i) => i !== index))} aria-label={t("cancel")}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={newHistoryEntry}
              onChange={(e) => setNewHistoryEntry(e.target.value)}
              placeholder={t("newHistoryEntryPlaceholder")}
              className="glass-input"
              data-testid="input-new-history-entry"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!newHistoryEntry.trim()) return;
                setRelevantHistory((prev) => [...prev, newHistoryEntry.trim()]);
                setNewHistoryEntry("");
              }}
              data-testid="button-add-history-entry">
              <Plus className="w-4 h-4 mr-1" />
              {t("addHistoryEntry")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("physicalExamSection")}</h2>
        <div>
          <h3 className="text-sm font-medium text-foreground">{t("generalExamSection")}</h3>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div>
              <Label htmlFor="generalState">{t("generalStateField")}</Label>
              <Input id="generalState" className="glass-input" value={physicalExam.generalState ?? ""} onChange={(e) => setPhysicalExam((prev) => ({ ...prev, generalState: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="consciousness">{t("consciousnessField")}</Label>
              <Input id="consciousness" className="glass-input" value={physicalExam.consciousness ?? ""} onChange={(e) => setPhysicalExam((prev) => ({ ...prev, consciousness: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="hydration">{t("hydrationField")}</Label>
              <Input id="hydration" className="glass-input" value={physicalExam.hydration ?? ""} onChange={(e) => setPhysicalExam((prev) => ({ ...prev, hydration: e.target.value }))} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground">{t("examBySystemSection")}</h3>
          <Tabs defaultValue={EXAM_SYSTEMS[0]} className="mt-2">
            <TabsList>
              {EXAM_SYSTEMS.map((system) => (
                <TabsTrigger key={system} value={system} data-testid={`tab-exam-system-${system}`}>
                  {t(`examSystem${system[0].toUpperCase()}${system.slice(1)}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {EXAM_SYSTEMS.map((system) => {
              const finding = physicalExam.systemFindings.find((f) => f.system === system)!;
              return (
                <TabsContent key={system} value={system} className="space-y-3">
                  <RadioGroup
                    value={finding.status}
                    onValueChange={(value) => updateFinding(system, { status: value as "normal" | "anormal" | "non_examine" })}
                    className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="normal" id={`${system}-normal`} />
                      <Label htmlFor={`${system}-normal`}>{t("examStatusNormal")}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="anormal" id={`${system}-anormal`} />
                      <Label htmlFor={`${system}-anormal`}>{t("examStatusAnormal")}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="non_examine" id={`${system}-non-examine`} />
                      <Label htmlFor={`${system}-non-examine`}>{t("examStatusNonExamine")}</Label>
                    </div>
                  </RadioGroup>
                  <Textarea
                    className="glass-input"
                    placeholder={t("examSystemNotesPlaceholder")}
                    value={finding.notes ?? ""}
                    onChange={(e) => updateFinding(system, { notes: e.target.value })}
                    data-testid={`textarea-exam-notes-${system}`}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("medicalEvaluationSection")}</h2>
        <div>
          <Label htmlFor="diagnosisPrincipalLabel">{t("diagnosisPrincipalLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="diagnosisPrincipalLabel"
              className="glass-input"
              value={diagnosisPrincipal?.label ?? ""}
              onChange={(e) => setDiagnosisPrincipal({ label: e.target.value, certainty: diagnosisPrincipal?.certainty ?? "suspecte" })}
              data-testid="input-diagnosis-principal-label"
            />
            <RadioGroup
              value={diagnosisPrincipal?.certainty ?? "suspecte"}
              onValueChange={(value) => setDiagnosisPrincipal({ label: diagnosisPrincipal?.label ?? "", certainty: value as "confirme" | "suspecte" })}
              className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="confirme" id="diagnosis-confirme" />
                <Label htmlFor="diagnosis-confirme">{t("diagnosisCertaintyConfirme")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="suspecte" id="diagnosis-suspecte" />
                <Label htmlFor="diagnosis-suspecte">{t("diagnosisCertaintySuspecte")}</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <div>
          <Label>{t("diagnosisSecondaryLabel")}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {diagnosisSecondary.map((entry, index) => (
              <Badge key={`${entry}-${index}`} variant="secondary" className="gap-1">
                {entry}
                <button type="button" onClick={() => setDiagnosisSecondary((prev) => prev.filter((_, i) => i !== index))} aria-label={t("cancel")}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input value={newSecondaryDiagnosis} onChange={(e) => setNewSecondaryDiagnosis(e.target.value)} className="glass-input" data-testid="input-new-secondary-diagnosis" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!newSecondaryDiagnosis.trim()) return;
                setDiagnosisSecondary((prev) => [...prev, newSecondaryDiagnosis.trim()]);
                setNewSecondaryDiagnosis("");
              }}
              data-testid="button-add-secondary-diagnosis">
              <Plus className="w-4 h-4 mr-1" />
              {t("addHistoryEntry")}
            </Button>
          </div>
        </div>
        <div>
          <Label htmlFor="diagnosisHypothesis">{t("diagnosisHypothesisLabel")}</Label>
          <Textarea id="diagnosisHypothesis" className="glass-input" value={diagnosisHypothesis} onChange={(e) => setDiagnosisHypothesis(e.target.value)} data-testid="textarea-diagnosis-hypothesis" />
        </div>
      </Card>

      <Card className="p-6 space-y-4" data-testid="card-lab-orders">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{t("examTypesRequested")}</h2>
          <PolicyGuard policy={LabOrdersPolicy} action="canCreate">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/laboratoire/new?consultationId=${consultationId}`)} data-testid="button-request-exams">
              {t("newLabOrder")}
            </Button>
          </PolicyGuard>
        </div>
        {labOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noLabOrders")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("examTypesRequested")}</TableHead>
                <TableHead>{t("statusColumnLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labOrders.map((order) => (
                <TableRow key={order.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setLocation(`/laboratoire/${order.id}`)} data-testid={`row-lab-order-${order.id}`}>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {order.examLines.map((line, index) => (
                        <Badge key={index} variant="secondary">{line.examName}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge>{t("labOrderStatus" + order.status[0].toUpperCase() + order.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-6 space-y-4" data-testid="card-prescriptions">
        <h2 className="font-semibold text-foreground">{t("medicationsPrescribedSection")}</h2>
        {prescriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPrescriptions")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("drugNameLabel")}</TableHead>
                <TableHead>{t("dosageLabel")}</TableHead>
                <TableHead>{t("frequencyLabel")}</TableHead>
                <TableHead>{t("statusColumnLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((prescription) => (
                <TableRow key={prescription.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setLocation(`/pharmacie/${prescription.id}`)} data-testid={`row-prescription-${prescription.id}`}>
                  <TableCell>{prescription.lines.map((l) => l.drugName).join(", ")}</TableCell>
                  <TableCell>{prescription.lines.map((l) => l.dosage).join(", ")}</TableCell>
                  <TableCell>{prescription.lines.map((l) => l.frequency).join(", ")}</TableCell>
                  <TableCell>
                    <Badge>{t("prescriptionStatus" + prescription.status[0].toUpperCase() + prescription.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PolicyGuard policy={PrescriptionsPolicy} action="canCreate">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input value={newDrugName} onChange={(e) => setNewDrugName(e.target.value)} placeholder={t("drugNameLabel")} className="glass-input" data-testid="input-new-drug-name" />
            <Input value={newDosage} onChange={(e) => setNewDosage(e.target.value)} placeholder={t("dosageLabel")} className="glass-input" data-testid="input-new-dosage" />
            <Input value={newFrequency} onChange={(e) => setNewFrequency(e.target.value)} placeholder={t("frequencyLabel")} className="glass-input" data-testid="input-new-frequency" />
          </div>
          <Button
            variant="outline"
            onClick={() => addPrescriptionLineMutation.mutate()}
            disabled={!newDrugName.trim() || !newDosage.trim() || !newFrequency.trim() || addPrescriptionLineMutation.isPending}
            data-testid="button-prescribe">
            {t("addMedicationLine")}
          </Button>
        </PolicyGuard>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-background border-t border-border p-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => saveDraftMutation.mutate()} disabled={isPending} data-testid="button-save-draft">
          {saveDraftMutation.isPending ? t("saving") : t("saveDraft")}
        </Button>
        <Button variant="outline" disabled data-testid="button-close-consultation">{t("closeConsultationAction")}</Button>
        <Button className="btn-primary" onClick={() => markCompletedMutation.mutate()} disabled={isPending} data-testid="button-mark-completed">
          {markCompletedMutation.isPending ? t("saving") : t("markCompleted")}
        </Button>
      </div>
    </div>
  );
}
