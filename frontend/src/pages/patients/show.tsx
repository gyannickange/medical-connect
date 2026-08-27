import React, { useRef, useState } from "react";
import { ArrowLeft, Edit, Upload } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
import type { Patient } from "@shared/schema";

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
    </div>
  );
}
