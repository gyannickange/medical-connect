import React, { useRef, useState } from "react";
import { ArrowLeft, Edit, Upload } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
import { buildPatientTimeline } from "@/lib/patientTimeline";
import type { Consultation, LabOrder, Patient, Prescription } from "@shared/schema";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function PatientDetails() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: patientId } = useParams<{ id: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { currentTenant } = useTenant();
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!patientId,
  });

  const { data: photoUrl } = useQuery<string | null>({
    queryKey: ["/api/patients/photo-url", patientId, patient?.photoS3Key],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${patientId}/photo-url`, { credentials: "include" });
      if (!response.ok) return null;
      const body = await response.json();
      return body.url;
    },
    enabled: !!patient?.photoS3Key,
  });

  const { data: patientConsultations = [] } = useQuery<Consultation[]>({
    queryKey: [`/api/consultations/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: patientLabOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: patientPrescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  async function handlePhotoSelected(file: File) {
    setUploading(true);
    try {
      const photoBase64 = await fileToBase64(file);
      await offlineApiRequest(
        "PUT",
        `/api/patients/${patientId}/photo`,
        { photoBase64, contentType: file.type === "image/png" ? "image/png" : "image/jpeg" },
        { collection: "patients", entityId: patientId }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/patients/detail", patientId] });
      toast({ title: t("success"), description: t("patientUpdatedSuccessfully") });
    } catch (error) {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdatePatient"), t("networkRequestFailed"));
    } finally {
      setUploading(false);
    }
  }

  if (isLoading || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="patient-details">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation("/patients")} data-testid="button-back-to-patients">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("patients")}
        </Button>
        <Button onClick={() => setLocation(`/patients/${patientId}/edit`)} data-testid="button-edit-patient">
          <Edit className="w-4 h-4 mr-2" />
          {t("editPatient")}
        </Button>
      </div>

      <Tabs defaultValue="informations">
        <TabsList>
          <TabsTrigger value="informations" data-testid="tab-informations">{t("informationsTab")}</TabsTrigger>
          <TabsTrigger value="historique" data-testid="tab-historique">{t("historiqueTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="informations">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 flex flex-col items-center text-center gap-3">
              <Avatar className="h-24 w-24">
                <AvatarImage src={photoUrl ?? undefined} />
                <AvatarFallback>{patient.firstName[0]}{patient.lastName[0]}</AvatarFallback>
              </Avatar>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])}
              />
              <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                {patient.photoS3Key ? t("changePhoto") : t("uploadPhoto")}
              </Button>
              <h2 className="text-lg font-semibold">{patient.firstName} {patient.lastName}</h2>
              <p className="text-sm text-muted-foreground">
                {calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()} · {patient.sex}
              </p>
              <p className="font-mono text-sm">{patient.dossierNumber ?? t("pendingSync")}</p>
              <Badge>{t(`patientStatus${patient.status[0].toUpperCase()}${patient.status.slice(1)}`)}</Badge>
            </Card>

            <Card className="p-6 md:col-span-2 space-y-2">
              <h3 className="font-semibold text-primary">{t("sectionIdentification")}</h3>
              <p>{t("dateOfBirth")}: {patient.dateOfBirth}</p>
              <p>{t("primaryPhone")}: {patient.primaryPhone}</p>
              <p>{t("residenceAddress")}: {patient.residenceAddress}</p>
              {patient.bloodGroup && <p>{t("bloodGroup")}: {patient.bloodGroup}</p>}
              {patient.allergyDetails && <p>{t("allergyDetails")}: {patient.allergyDetails}</p>}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="historique" className="space-y-4">
          <Card className="p-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">{t("startDateLabel")}</label>
              <Input type="date" value={historyStartDate} onChange={(e) => setHistoryStartDate(e.target.value)} data-testid="input-history-start-date" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">{t("endDateLabel")}</label>
              <Input type="date" value={historyEndDate} onChange={(e) => setHistoryEndDate(e.target.value)} data-testid="input-history-end-date" />
            </div>
            <Button variant="outline" onClick={() => { setAppliedStartDate(historyStartDate); setAppliedEndDate(historyEndDate); }} data-testid="button-apply-history-filter">
              {t("applyFilterAction")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setHistoryStartDate(""); setHistoryEndDate(""); setAppliedStartDate(""); setAppliedEndDate(""); }}
              data-testid="button-reset-history-filter">
              {t("resetFilterAction")}
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            {(() => {
              const entries = buildPatientTimeline(patientConsultations, patientLabOrders, patientPrescriptions).filter((entry) => {
                if (appliedStartDate && entry.occurredAt < new Date(appliedStartDate)) return false;
                if (appliedEndDate && entry.occurredAt > new Date(`${appliedEndDate}T23:59:59`)) return false;
                return true;
              });
              if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t("noHistoryEvents")}</p>;
              const labelKeyByType: Record<string, string> = {
                consultation_created: "patientTimelineConsultationCreated",
                consultation_closed: "patientTimelineConsultationClosed",
                lab_result: "patientTimelineLabResult",
                prescription_delivered: "patientTimelinePrescriptionDelivered",
              };
              return entries.map((entry, index) => (
                <div key={index} className="flex items-start gap-3 border-b border-border pb-3 last:border-0" data-testid={`history-entry-${index}`}>
                  <Badge variant="secondary">{new Date(entry.occurredAt).toLocaleDateString()}</Badge>
                  <p className="text-sm">
                    {t(labelKeyByType[entry.type])} — {entry.detail}
                  </p>
                </div>
              ));
            })()}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
