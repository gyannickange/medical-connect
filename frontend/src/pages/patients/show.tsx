import React, { useState } from "react";
import { ArrowLeft, Edit } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import PatientHeader from "./PatientHeader";
import PatientProfileCard from "./PatientProfileCard";
import ConsultationsTab from "./tabs/ConsultationsTab";
import PrescriptionsTab from "./tabs/PrescriptionsTab";
import ResultatsLaboTab from "./tabs/ResultatsLaboTab";
import HistoriqueTab from "./tabs/HistoriqueTab";
import ProfilTab from "./tabs/ProfilTab";
import type { Consultation, LabOrder, Patient, Prescription, User } from "@shared/schema";

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
  const [uploading, setUploading] = useState(false);
  const { currentTenant } = useTenant();

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

  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const staffNameById = Object.fromEntries(staffList.map((member) => [member.id, `${member.firstName} ${member.lastName}`]));

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
        <Button variant="outline" onClick={() => setLocation(`/patients/${patientId}/edit`)} data-testid="button-edit-patient">
          <Edit className="w-4 h-4 mr-2" />
          {t("editPatient")}
        </Button>
      </div>

      <PatientHeader patient={patient} />

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        <PatientProfileCard patient={patient} photoUrl={photoUrl} uploading={uploading} onPhotoSelected={handlePhotoSelected} />

        <Tabs defaultValue="profil">
          <TabsList>
            <TabsTrigger value="profil" data-testid="tab-profil">{t("profilTab")}</TabsTrigger>
            <TabsTrigger value="consultations" data-testid="tab-consultations">{t("consultations")}</TabsTrigger>
            <TabsTrigger value="prescriptions" data-testid="tab-prescriptions">{t("prescriptionsTab")}</TabsTrigger>
            <TabsTrigger value="resultats-labo" data-testid="tab-resultats-labo">{t("resultatsLaboTab")}</TabsTrigger>
            <TabsTrigger value="historique" data-testid="tab-historique">{t("historiqueTab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="profil">
            <ProfilTab patient={patient} />
          </TabsContent>

          <TabsContent value="consultations">
            <ConsultationsTab consultations={patientConsultations} staffNameById={staffNameById} />
          </TabsContent>

          <TabsContent value="prescriptions">
            <PrescriptionsTab prescriptions={patientPrescriptions} staffNameById={staffNameById} />
          </TabsContent>

          <TabsContent value="resultats-labo">
            <ResultatsLaboTab labOrders={patientLabOrders} />
          </TabsContent>

          <TabsContent value="historique">
            <HistoriqueTab consultations={patientConsultations} labOrders={patientLabOrders} prescriptions={patientPrescriptions} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
