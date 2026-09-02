import React, { useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useAuth } from "../../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
import { cn } from "@/lib/utils";
import { ConsultationJourneySidebar } from "../consultations/ConsultationJourneySidebar";
import { useConsultationJourney } from "../consultations/useConsultationJourney";
import type { Consultation, ExamType, ExamTypeCategory, Patient } from "@shared/schema";

const EXAM_TYPE_OPTIONS: { key: ExamTypeCategory; icon: string; labelKey: string }[] = [
  { key: "laboratoire", icon: "🧪", labelKey: "examTypeLaboratoire" },
  { key: "imagerie", icon: "🩻", labelKey: "examTypeImagerie" },
  { key: "explorations_fonctionnelles", icon: "❤️", labelKey: "examTypeExplorations" },
  { key: "autre", icon: "📋", labelKey: "examTypeAutre" },
];

export default function NewLabOrder() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const consultationId = searchParams.get("consultationId") ?? "";

  const [examCategory, setExamCategory] = useState<ExamTypeCategory>("laboratoire");
  const [examNames, setExamNames] = useState<string[]>([]);
  const [search, setSearch] = useState("");
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

  const { data: examTypes = [] } = useQuery<ExamType[]>({
    queryKey: ["/api/exam-types", currentTenant?.id],
    enabled: !!currentTenant?.id,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/lab-orders/${currentTenant?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`] });
      toast({ title: t("success"), description: t("labOrderCreatedSuccessfully") });
      setLocation(`/consultations/${consultationId}/consultation-medicale`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateLabOrder"), t("networkRequestFailed"));
    },
  });

  function toggleExam(name: string) {
    setExamNames((prev) => (prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]));
  }

  const catalog = examTypes.filter((examType) => examType.category === examCategory && examType.isActive).map((examType) => examType.name);
  const filteredCatalog = catalog.filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()));
  const searchMatchesNothing = search.trim().length > 0 && filteredCatalog.length === 0;

  if (!consultationId) {
    return <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noLabOrders")}</div>;
  }

  return (
    <div className="flex gap-6 items-start" data-testid="new-lab-order-page">
      <ConsultationJourneySidebar steps={steps} />
      <div className="flex-1 min-w-0 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t("consultations")}
          </Button>
          <Badge variant="success">{t("simplifiedDoctorFlowBadge")}</Badge>
        </div>

        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("newLabOrderTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("newLabOrderSubtitle")}</p>
        </div>

        {patient && (
          <div className="glass-card rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
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
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-[11px] text-muted-foreground">{t("ageGenderLabel")}</p>
                <p className="text-sm font-semibold text-foreground">{calculateAge(patient.dateOfBirth)}{t("yearsOldSuffix")} • {patient.sex === "F" ? t("genreFeminin") : t("genreMasculin")}</p>
              </div>
              {patient.bloodGroup && (
                <div className="text-right">
                  <p className="text-[11px] text-muted-foreground">{t("bloodGroupLabel")}</p>
                  <p className="text-sm font-semibold text-red-500">{patient.bloodGroup}</p>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold size-6">1</span>
            <h2 className="font-bold text-foreground">{t("examTypeSectionTitle")}</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {EXAM_TYPE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => { setExamCategory(option.key); setExamNames([]); setSearch(""); }}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4",
                  examCategory === option.key ? "border-primary bg-primary/10" : "border-border bg-background"
                )}
                data-testid={`button-exam-type-${option.key}`}>
                <span className="text-2xl">{option.icon}</span>
                <span className={cn("text-sm font-semibold text-center", examCategory === option.key ? "text-primary" : "text-foreground")}>{t(option.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="glass-card rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold size-6">2</span>
              <h2 className="font-bold text-foreground">{t("examSearchSectionTitle")}</h2>
            </div>
            {examNames.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {examNames.map((name) => (
                  <Badge key={name} variant="success" className="gap-1 pr-1.5">
                    {name}
                    <button type="button" onClick={() => toggleExam(name)} aria-label={t("cancel")} data-testid={`button-remove-exam-${name}`}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="relative">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchExamPlaceholder")}
                className="pl-9"
                data-testid="input-search-exam"
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {filteredCatalog.map((name) => (
                <label
                  key={name}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 cursor-pointer",
                    examNames.includes(name) ? "border-primary bg-primary/10" : "border-border"
                  )}>
                  <input
                    type="checkbox"
                    checked={examNames.includes(name)}
                    onChange={() => toggleExam(name)}
                    className="size-5 accent-primary"
                    data-testid={`checkbox-exam-${name}`}
                  />
                  <span className={cn("text-sm font-medium flex-1", examNames.includes(name) ? "text-primary" : "text-foreground")}>{name}</span>
                </label>
              ))}
              {searchMatchesNothing && (
                <button
                  type="button"
                  onClick={() => { toggleExam(search.trim()); setSearch(""); }}
                  className="flex items-center gap-2 w-full rounded-lg border border-dashed border-border p-3 text-sm text-primary"
                  data-testid="button-add-custom-exam">
                  {t("addCustomExamAction").replace("{name}", search.trim())}
                </button>
              )}
            </div>
          </div>

          <div className="glass-card rounded-xl p-6 space-y-5">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold size-6">3</span>
              <h2 className="font-bold text-foreground">{t("requestDetailsSectionTitle")}</h2>
            </div>
            <div className="space-y-2">
              <Label>{t("priorityLevelLabel")}</Label>
              <div className="flex gap-2">
                {(["normal", "urgent"] as const).map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setPriority(level)}
                    className={cn(
                      "flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold",
                      priority === level ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground"
                    )}
                    data-testid={`button-priority-${level}`}>
                    {t(level === "normal" ? "priorityNormal" : "priorityUrgent")}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="clinicalContext">{t("clinicalIndicationLabel")} *</Label>
              <Textarea id="clinicalContext" value={clinicalContext} onChange={(e) => setClinicalContext(e.target.value)} data-testid="textarea-clinical-context" />
            </div>
            <div>
              <Label htmlFor="specialInstructions">{t("specialInstructionsLabel")} ({t("optionalFieldSuffix")})</Label>
              <Textarea id="specialInstructions" value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} data-testid="textarea-special-instructions" />
            </div>
          </div>
        </div>

        {examNames.length > 0 && patient && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold size-6">4</span>
              <h2 className="font-bold text-foreground">{t("examOrderSummaryTitle")}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[11px] uppercase font-semibold text-primary">{t("patientLabel")}</p>
                <p className="font-bold text-foreground">{patient.lastName} {patient.firstName} — {patient.dossierNumber}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-primary">{t("prescribingDoctorLabel")}</p>
                <p className="text-foreground">{user ? `${user.firstName} ${user.lastName}` : "—"}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-primary">{t("examsRequestedLabel").replace("{count}", String(examNames.length))}</p>
                <p className="text-foreground truncate">{examNames.join(", ")}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase font-semibold text-primary">{t("priorityLevelLabel")}</p>
                <p className="font-bold text-foreground">{t(priority === "normal" ? "priorityNormal" : "priorityUrgent")}</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between gap-2 border-t border-border pt-4">
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
    </div>
  );
}
