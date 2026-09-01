import React, { useRef } from "react";
import { Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../lib/i18n";
import { calculateAge } from "@/lib/patientAge";
import type { Patient } from "@shared/schema";

function statusVariant(status: Patient["status"]): "default" | "secondary" | "destructive" {
  if (status === "hospitalise") return "destructive";
  if (status === "inactif") return "secondary";
  return "default";
}

export interface PatientProfileCardProps {
  patient: Patient;
  photoUrl?: string | null;
  uploading: boolean;
  onPhotoSelected: (file: File) => void;
}

export default function PatientProfileCard({ patient, photoUrl, uploading, onPhotoSelected }: PatientProfileCardProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const allergyList = patient.allergyDetails
    ? patient.allergyDetails.split(",").map((a) => a.trim()).filter(Boolean)
    : [];

  return (
    <Card className="p-6 space-y-5" data-testid="patient-profile-card">
      <div className="flex flex-col items-center text-center gap-3">
        <Avatar className="h-24 w-24">
          <AvatarImage src={photoUrl ?? undefined} />
          <AvatarFallback className="text-xl">{patient.firstName[0]}{patient.lastName[0]}</AvatarFallback>
        </Avatar>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onPhotoSelected(e.target.files[0])}
        />
        <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()} data-testid="button-upload-photo">
          <Upload className="w-4 h-4 mr-2" />
          {patient.photoS3Key ? t("changePhoto") : t("uploadPhoto")}
        </Button>
        <h2 className="text-lg font-semibold text-foreground">{patient.firstName} {patient.lastName}</h2>
        <p className="text-sm text-muted-foreground">
          {calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()} · {patient.sex === "M" ? t("sexMale") : t("sexFemale")}
        </p>
      </div>

      <div className="space-y-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">{t("dossierNumber")}</p>
          <p className="font-mono">{patient.dossierNumber ?? t("pendingSync")}</p>
        </div>

        <Badge variant={statusVariant(patient.status)} className="gap-1">
          {t(`patientStatus${patient.status[0].toUpperCase()}${patient.status.slice(1)}`)}
        </Badge>

        {patient.bloodGroup && (
          <div>
            <p className="text-xs text-muted-foreground">{t("bloodGroup")}</p>
            <Badge variant="outline" className="mt-1">{patient.bloodGroup}</Badge>
          </div>
        )}

        {allergyList.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground">{t("allergiesLabel")}</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {allergyList.map((allergy) => (
                <Badge key={allergy} variant="danger">{allergy}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
