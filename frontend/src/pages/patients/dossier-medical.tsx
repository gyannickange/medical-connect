import React, { useState } from "react";
import { AlertTriangle, BookOpen, Clock, FileText, Sparkles, TrendingDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { calculateAge } from "@/lib/patientAge";
import { buildPatientTimeline } from "@/lib/patientTimeline";
import { buildSparklinePoints } from "@/lib/sparkline";
import type { Consultation, LabOrder, Patient, Prescription, User } from "@shared/schema";

export default function DossierMedical() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: patientId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("resume");

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!patientId,
  });

  const { data: consultations = [] } = useQuery<Consultation[]>({
    queryKey: [`/api/consultations/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  if (!patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const sortedConsultations = [...consultations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const mostRecent = sortedConsultations[0];

  const diagnosisRows = sortedConsultations
    .filter((c) => c.diagnosisPrincipal?.label)
    .reduce<{ label: string; since: string }[]>((acc, c) => {
      if (!acc.some((row) => row.label === c.diagnosisPrincipal!.label)) {
        acc.push({ label: c.diagnosisPrincipal!.label, since: new Date(c.createdAt).toLocaleDateString() });
      }
      return acc;
    }, []);

  const treatmentsByDrug = new Map<string, { dosage: string; frequency: string; prescribedAt: string }>();
  for (const prescription of [...prescriptions].sort((a, b) => new Date(a.prescribedAt).getTime() - new Date(b.prescribedAt).getTime())) {
    for (const line of prescription.lines) {
      treatmentsByDrug.set(line.drugName, { dosage: line.dosage, frequency: line.frequency, prescribedAt: prescription.prescribedAt as unknown as string });
    }
  }

  const latestResults = [...labOrders]
    .filter((o) => o.status === "termine")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  const vitalsSeries = sortedConsultations
    .filter((c) => c.vitals?.bloodPressureSystolic != null)
    .slice(0, 6)
    .reverse();
  const systolicValues = vitalsSeries.map((c) => c.vitals!.bloodPressureSystolic!);
  const sparklinePoints = buildSparklinePoints(systolicValues, 320, 80);
  const latestVitals = vitalsSeries[vitalsSeries.length - 1]?.vitals ?? null;

  const hospitalisations = sortedConsultations.filter((c) => c.carePlan?.orientation === "hospitalisation");

  const timeline = buildPatientTimeline(consultations, labOrders, prescriptions);
  const labelKeyByType: Record<string, string> = {
    consultation_created: "patientTimelineConsultationCreated",
    consultation_closed: "patientTimelineConsultationClosed",
    lab_result: "patientTimelineLabResult",
    prescription_delivered: "patientTimelinePrescriptionDelivered",
  };

  const mostRecentDoctor = mostRecent ? staffList.find((member) => member.id === mostRecent.assignedDoctorId) : undefined;

  return (
    <div className="space-y-6" data-testid="dossier-medical">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => setLocation("/patients")}>{t("patients")}</Button>
        <span>›</span>
        <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" onClick={() => setLocation(`/patients/${patientId}`)}>{patient.firstName} {patient.lastName}</Button>
        <span>›</span>
        <span className="font-medium text-primary">{t("dossierMedicalTitle")}</span>
      </div>

      <Card className="p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center rounded-full border-2 border-primary bg-primary/10 size-14 shrink-0">
            <span className="font-bold text-primary text-lg">{`${patient.firstName[0]}${patient.lastName[0]}`.toUpperCase()}</span>
          </div>
          <div>
            <h1 className="text-lg font-display font-bold text-foreground">{patient.firstName} {patient.lastName}</h1>
            <p className="text-sm text-muted-foreground">
              {calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()} · {patient.sex}
              {patient.dossierNumber ? ` · ${t("dossierNumberFieldLabel")}: ${patient.dossierNumber}` : ""}
              {patient.bloodGroup ? ` · ${t("bloodGroup")}: ${patient.bloodGroup}` : ""}
            </p>
          </div>
        </div>
        {mostRecent && (
          <div className="text-sm text-right space-y-0.5">
            <p><span className="font-semibold text-foreground">{t("lastConsultationLabel")} </span><span className="text-muted-foreground">{new Date(mostRecent.createdAt).toLocaleDateString()} - {mostRecent.specialty}</span></p>
            {mostRecentDoctor && (
              <p><span className="font-semibold text-foreground">{t("lastDoctorLabel")} </span><span className="text-muted-foreground">{mostRecentDoctor.firstName} {mostRecentDoctor.lastName}</span></p>
            )}
          </div>
        )}
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="resume">{t("clinicalSummaryAutoTitle")}</TabsTrigger>
          <TabsTrigger value="constantes">{t("tabConstantes")}</TabsTrigger>
          <TabsTrigger value="traitements">{t("tabTraitements")}</TabsTrigger>
          <TabsTrigger value="examens">{t("tabExamens")}</TabsTrigger>
          <TabsTrigger value="documents">{t("tabDocuments")}</TabsTrigger>
          <TabsTrigger value="hospitalisations">{t("tabHospitalisations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="resume">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <div className="space-y-6">
              <Card className="p-6 space-y-2">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  {t("clinicalSummaryAutoTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {mostRecent
                    ? `${mostRecent.specialty} — ${mostRecent.diagnosisPrincipal?.label ?? t("noDataAvailable")}`
                    : t("noDataAvailable")}
                </p>
              </Card>

              <Card className="p-6 space-y-3">
                <h2 className="font-semibold text-foreground">{t("activeDiagnosesTitle")}</h2>
                {diagnosisRows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
                ) : (
                  diagnosisRows.map((row, index) => (
                    <div key={row.label} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                      <div>
                        <p>{row.label}</p>
                        <p className="text-xs text-muted-foreground">{t("startDateLabel")}: {row.since}</p>
                      </div>
                      <Badge variant={index === 0 ? "default" : "secondary"}>{index === 0 ? t("diagnosisStatusActive") : t("diagnosisStatusMonitoring")}</Badge>
                    </div>
                  ))
                )}
              </Card>

              <Card className="p-6 space-y-3">
                <h2 className="font-semibold text-foreground">{t("activeTreatmentsTitle")}</h2>
                {treatmentsByDrug.size === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
                ) : (
                  Array.from(treatmentsByDrug.entries()).map(([drugName, info]) => (
                    <div key={drugName} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                      <div>
                        <p>{drugName} — {info.dosage} — {info.frequency}</p>
                        <p className="text-xs text-muted-foreground">{t("startDateLabel")}: {new Date(info.prescribedAt).toLocaleDateString()}</p>
                      </div>
                      <Badge>{t("diagnosisStatusActive")}</Badge>
                    </div>
                  ))
                )}
              </Card>

              <Card className="p-6 space-y-2">
                <h2 className="font-semibold text-foreground">{t("latestResultsTitle")}</h2>
                {latestResults.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
                ) : (
                  latestResults.map((order) => (
                    <div key={order.id} className="flex items-center justify-between text-sm">
                      <span>{order.examLines.map((l) => l.examName).join(", ")}</span>
                      <span className="text-muted-foreground">{new Date(order.updatedAt).toLocaleDateString()}</span>
                    </div>
                  ))
                )}
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="p-6 space-y-3">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  {t("vitalsEvolutionTitle")}
                </h2>
                {systolicValues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
                ) : (
                  <>
                    <svg viewBox="0 0 320 80" className="w-full h-20" data-testid="svg-vitals-sparkline">
                      <polyline points={sparklinePoints} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
                    </svg>
                    {latestVitals && (
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center">
                        <div>
                          <p className="text-xs text-muted-foreground">FC</p>
                          <p className="text-sm font-medium">{latestVitals.heartRate ?? "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">SpO₂</p>
                          <p className="text-sm font-medium">{latestVitals.oxygenSaturation ?? "—"}%</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">T°</p>
                          <p className="text-sm font-medium">{latestVitals.temperature ?? "—"}°C</p>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </Card>

              {patient.allergyDetails && (
                <Card className="p-4 space-y-2 border-destructive/40">
                  <h2 className="font-semibold text-foreground flex items-center gap-2 text-sm">
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    {t("allergyDetails")}
                  </h2>
                  <Badge variant="destructive">{patient.allergyDetails}</Badge>
                </Card>
              )}

              <Card className="p-6 space-y-3">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  {t("antecedentsLabel")}
                </h2>
                {patient.medicalHistory && (
                  <p className="text-sm"><span className="text-muted-foreground">{t("medicalHistory")}: </span>{patient.medicalHistory}</p>
                )}
                {patient.surgicalHistory && (
                  <p className="text-sm"><span className="text-muted-foreground">{t("surgicalHistory")}: </span>{patient.surgicalHistory}</p>
                )}
                {!patient.medicalHistory && !patient.surgicalHistory && (
                  <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
                )}
              </Card>

              <Card className="p-6 space-y-3">
                <h2 className="font-semibold text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t("historiqueTab")}
                </h2>
                {timeline.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noHistoryEvents")}</p>
                ) : (
                  <ol className="space-y-2 max-h-80 overflow-y-auto">
                    {timeline.slice(0, 8).map((entry, index) => (
                      <li key={index} className="flex items-start gap-2 text-sm">
                        <span className="w-2 h-2 mt-1.5 rounded-full bg-primary shrink-0" />
                        <div>
                          <p className="text-xs text-muted-foreground">{new Date(entry.occurredAt).toLocaleDateString()}</p>
                          <p>{t(labelKeyByType[entry.type])} — {entry.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="constantes" className="space-y-2">
          {vitalsSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
          ) : (
            vitalsSeries.map((c) => (
              <Card key={c.id} className="p-4 text-sm">
                {new Date(c.createdAt).toLocaleDateString()} — TA {c.vitals?.bloodPressureSystolic}/{c.vitals?.bloodPressureDiastolic} · FC {c.vitals?.heartRate}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="traitements" className="space-y-2">
          {treatmentsByDrug.size === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
          ) : (
            Array.from(treatmentsByDrug.entries()).map(([drugName, info]) => (
              <Card key={drugName} className="p-4 text-sm">{drugName} — {info.dosage} — {info.frequency}</Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="examens" className="space-y-2">
          {labOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
          ) : (
            labOrders.map((order) => (
              <Card key={order.id} className="p-4 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                {order.examLines.map((l) => l.examName).join(", ")} — {new Date(order.updatedAt).toLocaleDateString()}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="documents">
          <p className="text-sm text-muted-foreground">{t("availableInFuturePhase")}</p>
        </TabsContent>

        <TabsContent value="hospitalisations" className="space-y-2">
          {hospitalisations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hospitalisationsEmptyState")}</p>
          ) : (
            hospitalisations.map((c) => (
              <Card key={c.id} className="p-4 text-sm">
                {new Date(c.createdAt).toLocaleDateString()} — {c.carePlan?.orientation === "hospitalisation" ? c.carePlan.targetService : ""}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
