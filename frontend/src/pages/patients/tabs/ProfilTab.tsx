import React from "react";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useTranslation } from "../../../lib/i18n";
import { useStaffDirectory } from "@/hooks/useStaffDirectory";
import type { Patient } from "@shared/schema";

function capitalizedKey(prefix: string, value: string): string {
  return `${prefix}${value[0].toUpperCase()}${value.slice(1)}`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value ?? "—"}</p>
    </div>
  );
}

function CardTitle({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <h3 className={`font-semibold mb-4 ${muted ? "text-muted-foreground" : "text-primary"}`}>{children}</h3>;
}

export interface ProfilTabProps {
  patient: Patient;
}

const FINANCIALLY_RESPONSIBLE_KEYS: Record<string, string> = {
  patient: "financiallyResponsiblePatient",
  parent: "financiallyResponsibleParent",
  epoux_epouse: "financiallyResponsibleSpouse",
  autre: "financiallyResponsibleAutre",
};

export default function ProfilTab({ patient }: ProfilTabProps) {
  const { t } = useTranslation();
  const staffList = useStaffDirectory();
  const doctorNameById = Object.fromEntries(staffList.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));
  const hasPediatricInfo = !!patient.pediatricInfo;
  const idDocumentTypeLabel = patient.idDocumentType
    ? patient.idDocumentType === "autre"
      ? patient.idDocumentTypeOther
      : t(capitalizedKey("idDocumentType", patient.idDocumentType))
    : null;
  const guardianRelationLabel = patient.pediatricInfo?.guardianRelation
    ? patient.pediatricInfo.guardianRelation === "autre"
      ? patient.pediatricInfo.guardianRelationOther
      : t(capitalizedKey("guardianOption", patient.pediatricInfo.guardianRelation))
    : null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-testid="tab-content-profil">
      <Card className="p-6 space-y-3">
        <CardTitle>{t("identificationCardTitle")}</CardTitle>
        <Field label={t("dateOfBirth")} value={patient.dateOfBirth} />
        <Field label={t("birthPlace")} value={patient.birthPlace} />
        <Field label={t("nationality")} value={patient.nationality} />
        <Field label={t("profession")} value={patient.profession} />
        <Field label={t("maritalStatus")} value={patient.maritalStatus ? t(capitalizedKey("maritalStatus", patient.maritalStatus)) : null} />
        <Field label={t("idDocumentType")} value={idDocumentTypeLabel} />
        <Field label={t("idDocumentNumber")} value={patient.idDocumentNumber} />
        <Field label={t("idDocumentExpiry")} value={patient.idDocumentExpiry} />
      </Card>

      <Card className="p-6 space-y-3">
        <CardTitle>{t("contactCardTitle")}</CardTitle>
        <Field label={t("primaryPhone")} value={patient.primaryPhone} />
        <Field label={t("email")} value={patient.email} />
        <Field label={t("secondaryPhone")} value={patient.secondaryPhone} />
        <Field label={t("residenceZone")} value={patient.residenceZone} />
        <Field label={t("fullAddress")} value={patient.fullAddress} />
      </Card>

      <Card className="p-6 space-y-3">
        <CardTitle>{t("medicalInfoCardTitle")}</CardTitle>
        <Field label={t("medicalHistory")} value={patient.medicalHistory} />
        <Field label={t("surgicalHistory")} value={patient.surgicalHistory} />
        <Field label={t("chronicDiseases")} value={patient.chronicDiseases} />
        <Field label={t("currentTreatments")} value={patient.currentTreatments} />
        <Field label={t("disabilities")} value={patient.disabilities} />
      </Card>

      <Card className="p-6 space-y-3">
        <CardTitle>{t("emergencyContactCardTitle")}</CardTitle>
        <Field label={t("emergencyContactName")} value={patient.emergencyContact?.name} />
        <Field
          label={t("emergencyContactRelation")}
          value={
            patient.emergencyContact?.relation
              ? patient.emergencyContact.relation === "autre"
                ? patient.emergencyContact.relationOther
                : t(capitalizedKey("emergencyContactRelation", patient.emergencyContact.relation))
              : null
          }
        />
        <Field label={t("emergencyContactPhone")} value={patient.emergencyContact?.phone} />
        <Field label={t("emergencyContactAddress")} value={patient.emergencyContact?.address} />
        <div>
          <p className="text-xs text-muted-foreground">{t("emergencyContactIsPriority")}</p>
          {patient.emergencyContact ? (
            <p className="text-sm text-foreground flex items-center gap-1">
              {patient.emergencyContact.isPriority && <Check className="w-3.5 h-3.5 text-primary" />}
              {patient.emergencyContact.isPriority ? t("yesLabel") : t("noLabel")}
            </p>
          ) : (
            <p className="text-sm text-foreground">—</p>
          )}
        </div>
      </Card>

      <Card className="p-6 space-y-3">
        <CardTitle>{t("administrativeInfoCardTitle")}</CardTitle>
        <Field label={t("fileCreationDate")} value={new Date(patient.createdAt).toLocaleDateString()} />
        <Field label={t("facilityService")} value={patient.facilityService} />
        <Field label={t("referringDoctor")} value={patient.referringDoctorId ? doctorNameById[patient.referringDoctorId] ?? patient.referringDoctorId : null} />
        <Field label={t("patientType")} value={t(`patientType${patient.patientType[0].toUpperCase()}${patient.patientType.slice(1)}`)} />
        <Field
          label={t("paymentMode")}
          value={patient.paymentMode ? t(`paymentMode${patient.paymentMode[0].toUpperCase()}${patient.paymentMode.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())}`) : null}
        />
        <Field label={t("insuranceName")} value={patient.insuranceName} />
        <Field label={t("insuranceNumber")} value={patient.insuranceNumber} />
        <Field
          label={t("financiallyResponsible")}
          value={
            patient.financiallyResponsible
              ? t(FINANCIALLY_RESPONSIBLE_KEYS[patient.financiallyResponsible] ?? patient.financiallyResponsible)
              : null
          }
        />
      </Card>

      <Card className={`p-6 space-y-3 ${!hasPediatricInfo ? "opacity-60" : ""}`} data-testid="card-pediatric-info">
        <CardTitle muted={!hasPediatricInfo}>{t("pediatricInfoCardTitle")}</CardTitle>
        {!hasPediatricInfo ? (
          <p className="text-sm text-muted-foreground">{t("pediatricNotApplicable")}</p>
        ) : (
          <>
            <Field label={t("pediatricFatherName")} value={patient.pediatricInfo?.fatherName} />
            <Field label={t("pediatricMotherName")} value={patient.pediatricInfo?.motherName} />
            <Field
              label={t("pediatricLegalGuardian")}
              value={patient.pediatricInfo?.legalGuardian ? t(capitalizedKey("guardianOption", patient.pediatricInfo.legalGuardian)) : null}
            />
            <Field label={t("pediatricGuardianRelation")} value={guardianRelationLabel} />
            <Field label={t("pediatricGuardianPhone")} value={patient.pediatricInfo?.guardianPhone} />
            <Field label={t("pediatricWeightKg")} value={patient.pediatricInfo?.weightKg} />
            <Field label={t("pediatricHeightCm")} value={patient.pediatricInfo?.heightCm} />
          </>
        )}
      </Card>
    </div>
  );
}
