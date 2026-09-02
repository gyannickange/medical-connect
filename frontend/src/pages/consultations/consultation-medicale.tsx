import React, { useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, FileText, History as HistoryIcon, Plus, ShieldAlert, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { ConsultationJourneySidebar } from "./ConsultationJourneySidebar";
import { useConsultationJourney } from "./useConsultationJourney";
import type { Consultation, DiagnosisPrincipal, ExamSystem, LabOrder, Patient, PhysicalExam, Prescription } from "@shared/schema";
import { GENERAL_STATE_OPTIONS, CONSCIOUSNESS_OPTIONS, HYDRATION_OPTIONS } from "@/lib/physicalExamOptions";

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

  const steps = useConsultationJourney(consultation, patient);

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
    const sanitizedDiagnosisPrincipal = diagnosisPrincipal?.label.trim() ? diagnosisPrincipal : null;
    return { relevantHistory, presentIllnessHistory, physicalExam, diagnosisPrincipal: sanitizedDiagnosisPrincipal, diagnosisSecondary, diagnosisHypothesis };
  }

  function markInConsultation() {
    if (!consultation) return;
    void offlineApiRequest(
      "POST",
      "/api/queue/events",
      { consultationId, patientId: consultation.patientId, eventType: "in_consultation", tenantId: consultation.tenantId },
      { collection: "queue" }
    );
    queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
  }

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, payload(), { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("draftSavedSuccessfully") });
      markInConsultation();
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
      markInConsultation();
      setLocation(`/consultations/${consultationId}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveConsultation"), t("networkRequestFailed"));
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
  const vitals = consultation.vitals;

  return (
    <div className="space-y-6" data-testid="consultation-medicale-page">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div className="flex gap-6 items-start">
        <ConsultationJourneySidebar steps={steps} />
        <div className="flex-1 min-w-0 space-y-6" data-testid="consultation-medicale-form">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("consultationMedicaleTitle")} — {consultation.number ?? t("pendingSync")}</h1>
          <p className="text-sm text-muted-foreground">{t("sessionActiveLabel")} · {consultation.specialty}</p>
        </div>

        <div className="glass-card rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                {photoUrl && <AvatarImage src={photoUrl} alt={`${patient.firstName} ${patient.lastName}`} />}
                <AvatarFallback>{`${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-bold text-foreground text-sm">{patient.firstName} {patient.lastName}</p>
                <p className="text-xs text-muted-foreground">{calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()} · {patient.sex === "F" ? t("genreFeminin") : t("genreMasculin")} · {patient.dossierNumber ?? t("pendingSync")}</p>
              </div>
            </div>
            {vitals && (
              <div className="flex flex-wrap items-center gap-2">
                {vitals.bloodPressureSystolic != null && <Badge variant="outline" className="rounded-full">TA {vitals.bloodPressureSystolic}/{vitals.bloodPressureDiastolic}</Badge>}
                {vitals.heartRate != null && <Badge variant="outline" className="rounded-full">FC {vitals.heartRate}</Badge>}
                {vitals.temperature != null && <Badge variant="outline" className="rounded-full">T° {vitals.temperature}</Badge>}
                {vitals.oxygenSaturation != null && <Badge variant="outline" className="rounded-full">SpO₂ {vitals.oxygenSaturation}</Badge>}
                {vitals.painScoreEva != null && vitals.painScoreEva > 0 && <Badge variant="destructive" className="rounded-full">{t("painScaleField")} {vitals.painScoreEva}/10</Badge>}
              </div>
            )}
          </div>
          {(patient.allergyDetails || patient.chronicDiseases || patient.currentTreatments) && (
            <div className="flex flex-wrap items-center gap-2">
              {patient.allergyDetails && (
                <Badge variant="warning" className="rounded-full gap-1"><AlertTriangle className="w-3 h-3" /> {patient.allergyDetails}</Badge>
              )}
              {patient.chronicDiseases && <Badge variant="destructive" className="rounded-full">{patient.chronicDiseases}</Badge>}
              {patient.currentTreatments && <Badge variant="secondary" className="rounded-full">{patient.currentTreatments}</Badge>}
            </div>
          )}
        </div>

        <div className="glass-card rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-[18px] h-[18px] text-primary" />
            <h2 className="font-bold text-foreground">{t("clinicalSummaryCardTitle")}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">{t("antecedentsLabel")}</p>
              {[patient.medicalHistory, patient.surgicalHistory].filter(Boolean).length > 0 ? (
                [patient.medicalHistory, patient.surgicalHistory].filter(Boolean).map((entry, i) => (
                  <div key={i} className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-semibold text-foreground">{entry}</div>
                ))
              ) : <p className="text-xs text-muted-foreground">—</p>}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">{t("allergiesLabel")}</p>
              {patient.allergyDetails ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">{patient.allergyDetails}</div>
              ) : <p className="text-xs text-muted-foreground">—</p>}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-muted-foreground">{t("currentTreatmentsLabel")}</p>
              {patient.currentTreatments ? (
                <div className="rounded-md border border-border bg-muted/50 px-2.5 py-1 text-xs font-semibold text-foreground">{patient.currentTreatments}</div>
              ) : <p className="text-xs text-muted-foreground">—</p>}
            </div>
          </div>
        </div>

        <div className="glass-card rounded-xl p-6 space-y-2">
          <div className="flex items-center gap-2">
            <FileText className="w-[18px] h-[18px] text-primary" />
            <h2 className="font-bold text-foreground">{t("visitReason")}</h2>
          </div>
          <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-foreground">{consultation.reason}</div>
        </div>

        <div className="glass-card rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-[18px] h-[18px] text-primary" />
            <h2 className="font-bold text-foreground">{t("anamneseSection")}</h2>
          </div>
          <div>
            <Label htmlFor="presentIllnessHistory">{t("presentIllnessHistoryField")}</Label>
            <Textarea id="presentIllnessHistory" value={presentIllnessHistory} onChange={(e) => setPresentIllnessHistory(e.target.value)} data-testid="textarea-present-illness-history" />
          </div>
          <div>
            <Label>{t("pertinentHistoryFieldLabel")}</Label>
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
        </div>

        <div className="glass-card rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-[18px] h-[18px] text-primary" />
            <h2 className="font-bold text-foreground">{t("physicalExamSection")}</h2>
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">{t("generalExamSection")}</h3>
            <div className="grid grid-cols-3 gap-4 mt-2">
              <div>
                <Label htmlFor="generalState">{t("generalStateField")}</Label>
                <Select
                  value={physicalExam.generalState ?? ""}
                  onValueChange={(value) => setPhysicalExam((prev) => ({ ...prev, generalState: value }))}>
                  <SelectTrigger id="generalState" data-testid="select-general-state">
                    <SelectValue placeholder={t("generalStateSelectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERAL_STATE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="consciousness">{t("consciousnessField")}</Label>
                <Select
                  value={physicalExam.consciousness ?? ""}
                  onValueChange={(value) => setPhysicalExam((prev) => ({ ...prev, consciousness: value }))}>
                  <SelectTrigger id="consciousness" data-testid="select-consciousness">
                    <SelectValue placeholder={t("consciousnessSelectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSCIOUSNESS_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="hydration">{t("hydrationField")}</Label>
                <Select
                  value={physicalExam.hydration ?? ""}
                  onValueChange={(value) => setPhysicalExam((prev) => ({ ...prev, hydration: value }))}>
                  <SelectTrigger id="hydration" data-testid="select-hydration">
                    <SelectValue placeholder={t("hydrationSelectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {HYDRATION_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{t(option.labelKey)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {vitals && (vitals.weightKg != null || vitals.heightCm != null || vitals.bmi != null) && (
              <div className="flex gap-6 mt-3">
                {vitals.weightKg != null && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground">{t("weightKgField")}</p>
                    <p className="text-sm font-bold text-foreground">{vitals.weightKg} kg</p>
                  </div>
                )}
                {vitals.heightCm != null && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground">{t("heightCmField")}</p>
                    <p className="text-sm font-bold text-foreground">{vitals.heightCm} cm</p>
                  </div>
                )}
                {vitals.bmi != null && (
                  <div>
                    <p className="text-[11px] font-semibold text-muted-foreground">{t("bmiCalculatedField")}</p>
                    <p className="text-sm font-bold text-foreground">{vitals.bmi}</p>
                  </div>
                )}
              </div>
            )}
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
        </div>

        <div className="glass-card rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-[18px] h-[18px] text-primary" />
            <h2 className="font-bold text-foreground">{t("medicalEvaluationSection")}</h2>
          </div>
          <div>
            <Label htmlFor="diagnosisPrincipalLabel">{t("diagnosisPrincipalLabel")}</Label>
            <div className="flex gap-2">
              <Input
                id="diagnosisPrincipalLabel"
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
              <Input value={newSecondaryDiagnosis} onChange={(e) => setNewSecondaryDiagnosis(e.target.value)} data-testid="input-new-secondary-diagnosis" />
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
            <Textarea id="diagnosisHypothesis" value={diagnosisHypothesis} onChange={(e) => setDiagnosisHypothesis(e.target.value)} data-testid="textarea-diagnosis-hypothesis" />
          </div>
        </div>

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
      </Card>

      <Card className="p-6 space-y-2" data-testid="card-care-plan">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{t("carePlanCardTitle")}</h2>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setLocation(`/consultations/${consultationId}/plan-prise-en-charge`)}
            data-testid="button-edit-care-plan">
            {consultation.carePlan ? t("modifyLabel") : t("defineCarePlanAction")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {consultation.carePlan
            ? t(`carePlanOrientation${consultation.carePlan.orientation.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`)
            : t("notStartedYet")}
        </p>
      </Card>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" onClick={() => saveDraftMutation.mutate()} disabled={isPending} data-testid="button-save-draft">
            {saveDraftMutation.isPending ? t("saving") : t("saveDraft")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/resume-cloture`)} data-testid="button-close-consultation">
            {t("closeConsultationAction")}
          </Button>
          <Button
            className="btn-primary"
            onClick={() => markCompletedMutation.mutate()}
            disabled={isPending || !diagnosisPrincipal?.label.trim()}
            data-testid="button-mark-completed">
            {markCompletedMutation.isPending ? t("saving") : t("markCompleted")}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
