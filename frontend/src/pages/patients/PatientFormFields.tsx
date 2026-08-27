import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertPatientSchema, type InsertPatient, type Patient } from "@shared/schema";

const inputClass = "bg-white border border-[#e2e8f0] rounded-[8px] px-[14px] py-[10px] text-[14px] text-[#0f172a] placeholder:text-[#94a3b8] h-auto";
const disabledFieldClass = "bg-[#f8fafc] border border-[#e2e8f0] rounded-[8px] px-[14px] py-[10px] flex items-center justify-between";
const labelClass = "font-semibold text-[#475569] text-[13px]";
const sectionTitleClass = "font-bold text-[#047857] text-[16px]";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function defaultValuesFor(patient: Patient | null, tenantId: string): InsertPatient {
  if (!patient) {
    return { lastName: "", firstName: "", dateOfBirth: "", sex: "M", primaryPhone: "", residenceAddress: "", tenantId } as InsertPatient;
  }
  const { id, dossierNumber, searchName, photoS3Key, status, isActive, createdAt, updatedAt, ...rest } = patient;
  return { ...rest, tenantId } as InsertPatient;
}

export interface PatientFormFieldsProps {
  patientId?: string;
}

export default function PatientFormFields({ patientId: editingId }: PatientFormFieldsProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);

  const { data: existingPatient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", editingId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${editingId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!editingId,
  });

  const form = useForm<InsertPatient>({
    resolver: zodResolver(insertPatientSchema),
    defaultValues: defaultValuesFor(null, currentTenant?.id ?? ""),
  });

  useEffect(() => {
    if (existingPatient) form.reset(defaultValuesFor(existingPatient, currentTenant?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingPatient, currentTenant?.id]);

  async function uploadPendingPhoto(patientId: string) {
    if (!pendingPhoto) return;
    const photoBase64 = await fileToBase64(pendingPhoto);
    await offlineApiRequest(
      "PUT",
      `/api/patients/${patientId}/photo`,
      { photoBase64, contentType: pendingPhoto.type === "image/png" ? "image/png" : "image/jpeg" },
      { collection: "patients", entityId: patientId }
    );
  }

  const saveMutation = useMutation({
    mutationFn: async (data: InsertPatient) => {
      const method = editingId ? "PUT" : "POST";
      const url = editingId ? `/api/patients/${editingId}` : "/api/patients";
      const response = await offlineApiRequest(method, url, { ...data, tenantId: currentTenant?.id }, { collection: "patients" });
      const saved = await response.json();
      if (saved?.id) await uploadPendingPhoto(saved.id);
      return saved;
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("patientSavedOffline") : editingId ? t("patientUpdatedSuccessfully") : t("patientCreatedSuccessfully"),
      });
      setLocation("/patients");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), editingId ? t("failedToUpdatePatient") : t("failedToCreatePatient"), t("networkRequestFailed"));
    },
  });

  const errors = form.formState.errors as any;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 max-w-[500px]">
        <h1 className="font-bold text-[#0f172a] text-[24px]">{editingId ? t("editPatient") : t("createPatient")}</h1>
        <p className="font-medium text-[#64748b] text-[14px]">{editingId ? t("editPatientSubtitle") : t("newPatientSubtitle")}</p>
      </div>

      <form
        onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
        className="bg-white border border-[#e2e8f0] rounded-[16px] shadow-sm flex flex-col gap-8 p-8 w-full"
        data-testid="patient-form">
        {/* Section 1 */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <p className={sectionTitleClass}>{t("sectionIdentification")}</p>
            <p className="font-medium text-[#64748b] text-[13px]">{t("requiredFieldsNote")}</p>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("patientIdAutoLabel")}</Label>
              <div className={disabledFieldClass}>
                <span className="text-[#94a3b8] text-[14px]">{existingPatient?.dossierNumber ?? "PT-000000"}</span>
                <span className="font-semibold text-[#64748b] text-[12px]">{t("autoGenerated")}</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("lastName")} *</Label>
              <Input className={inputClass} placeholder="Ex: Koffi" {...form.register("lastName")} data-testid="input-lastName" />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("firstName")} *</Label>
              <Input className={inputClass} placeholder="Ex: Emmanuel" {...form.register("firstName")} data-testid="input-firstName" />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("dateOfBirth")} *</Label>
              <Input type="date" className={inputClass} {...form.register("dateOfBirth")} data-testid="input-dateOfBirth" />
              {errors.dateOfBirth && <p className="text-sm text-destructive">{errors.dateOfBirth.message}</p>}
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("sex")} *</Label>
              <Select value={form.watch("sex")} onValueChange={(value) => form.setValue("sex", value as "M" | "F", { shouldValidate: true })}>
                <SelectTrigger className={inputClass} data-testid="select-sex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M">{t("sexMale")}</SelectItem>
                  <SelectItem value="F">{t("sexFemale")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("primaryPhone")} *</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("primaryPhone")} data-testid="input-primaryPhone" />
              {errors.primaryPhone && <p className="text-sm text-destructive">{errors.primaryPhone.message}</p>}
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("residenceAddress")} *</Label>
              <Input className={inputClass} placeholder="Ex: Rue 1204, Yaoundé" {...form.register("residenceAddress")} data-testid="input-residenceAddress" />
              {errors.residenceAddress && <p className="text-sm text-destructive">{errors.residenceAddress.message}</p>}
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("uploadPhoto")}</Label>
              <label className="bg-[#f8fafc] border border-dashed border-[#e2e8f0] rounded-[8px] h-[120px] flex flex-col gap-2 items-center justify-center cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && setPendingPhoto(e.target.files[0])}
                />
                <Upload className="w-5 h-5 text-[#64748b]" />
                <span className="font-semibold text-[#64748b] text-[13px]">{pendingPhoto ? pendingPhoto.name : t("dragDropPhoto")}</span>
                <span className="text-[#94a3b8] text-[12px]">{t("photoFormatHint")}</span>
              </label>
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("usualName")}</Label>
              <Input className={inputClass} placeholder="Ex: Manu" {...form.register("usualName")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("birthPlace")}</Label>
              <Input className={inputClass} placeholder="Ex: Yaoundé" {...form.register("birthPlace")} />
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("nationality")}</Label>
              <Input className={inputClass} placeholder="Camerounaise" {...form.register("nationality")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("profession")}</Label>
              <Input className={inputClass} placeholder="Ex: Étudiant" {...form.register("profession")} />
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("maritalStatus")}</Label>
              <Input className={inputClass} placeholder="Célibataire / Marié(e) / Divorcé(e) / Veuf(ve)" {...form.register("maritalStatus")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("idDocumentType")}</Label>
              <Select
                value={form.watch("idDocumentType") ?? ""}
                onValueChange={(value) => form.setValue("idDocumentType", value as InsertPatient["idDocumentType"], { shouldValidate: true })}>
                <SelectTrigger className={inputClass} data-testid="select-idDocumentType">
                  <SelectValue placeholder="CNI / Passeport / Permis" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cni">{t("idDocumentTypeCni")}</SelectItem>
                  <SelectItem value="passeport">{t("idDocumentTypePasseport")}</SelectItem>
                  <SelectItem value="permis">{t("idDocumentTypePermis")}</SelectItem>
                  <SelectItem value="autre">{t("idDocumentTypeAutre")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("idDocumentNumber")}</Label>
              <Input className={inputClass} placeholder="Ex: 00 00 00 00 00" {...form.register("idDocumentNumber")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("idDocumentExpiry")}</Label>
              <Input type="date" className={inputClass} {...form.register("idDocumentExpiry")} />
            </div>
          </div>

          <div className="flex items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("email")}</Label>
              <Input type="email" className={inputClass} placeholder="patient@hospital.com" {...form.register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>
        </div>

        {/* Section 2 */}
        <div className="flex flex-col gap-4 w-full">
          <p className={sectionTitleClass}>{t("sectionContact")}</p>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("primaryPhone")} *</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("primaryPhone")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("residenceZone")} *</Label>
              <Input className={inputClass} placeholder="Ex: Yaoundé" {...form.register("residenceZone")} />
            </div>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("secondaryPhone")}</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("secondaryPhone")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("email")}</Label>
              <Input type="email" className={inputClass} placeholder="patient@hospital.com" {...form.register("email")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("fullAddress")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Rue 1204, quartier Mokolo, Yaoundé" {...form.register("fullAddress")} />
          </div>
        </div>

        {/* Section 3 */}
        <div className="flex flex-col gap-4 w-full">
          <p className={sectionTitleClass}>{t("sectionEmergencyContact")}</p>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactName")} *</Label>
              <Input className={inputClass} placeholder="Ex: Marie Koffi" {...form.register("emergencyContact.name")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactRelation")} *</Label>
              <Input className={inputClass} placeholder="Époux / Épouse / Parent / Enfant / Autre" {...form.register("emergencyContact.relation")} />
            </div>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactPhone")} *</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("emergencyContact.phone")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactAddress")}</Label>
              <Input className={inputClass} placeholder="Ex: Rue 1204, Yaoundé" {...form.register("emergencyContact.address")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("emergencyContactIsPriority")}</Label>
            <div className="flex items-center justify-between w-full">
              <span className="text-[#475569] text-[14px]">{t("contactPriorityHint")}</span>
              <Switch
                checked={!!form.watch("emergencyContact.isPriority")}
                onCheckedChange={(checked) => form.setValue("emergencyContact.isPriority", checked, { shouldValidate: true })}
                data-testid="switch-emergency-priority"
              />
            </div>
          </div>
        </div>

        {/* Section 4 */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <p className={sectionTitleClass}>{t("sectionMedical")}</p>
            <p className="font-medium text-[#64748b] text-[13px]">{t("medicalSectionHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("bloodGroup")}</Label>
            <Input className={inputClass} placeholder="A+ / A- / B+ / B- / AB+ / AB- / O+ / O- / Non renseigné" {...form.register("bloodGroup")} />
          </div>
          <div className="flex flex-col gap-2.5 w-full">
            <Label className={labelClass}>{t("allergyKnowledge")}</Label>
            <RadioGroup
              className="flex gap-3 items-center"
              value={form.watch("allergyKnowledge") ?? "non_renseigne"}
              onValueChange={(value) => form.setValue("allergyKnowledge", value as InsertPatient["allergyKnowledge"])}>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="aucune_connue" id="allergy-none" />
                <Label htmlFor="allergy-none" className="text-[#475569] text-[14px] font-normal">{t("allergyKnowledgeAucuneConnue")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="allergies_connues" id="allergy-known" />
                <Label htmlFor="allergy-known" className="text-[#475569] text-[14px] font-normal">{t("allergyKnowledgeAllergiesConnues")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="non_renseigne" id="allergy-unknown" />
                <Label htmlFor="allergy-unknown" className="text-[#475569] text-[14px] font-normal">{t("allergyKnowledgeNonRenseigne")}</Label>
              </div>
            </RadioGroup>
            <div className="flex flex-col gap-1.5 w-full">
              <Label className={labelClass}>{t("allergyDetails")}</Label>
              <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Pénicilline, arachides (séparer par des virgules)" {...form.register("allergyDetails")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("medicalHistory")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Hypertension artérielle diagnostiquée en 2021" {...form.register("medicalHistory")} />
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("surgicalHistory")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Appendicectomie en 2018" {...form.register("surgicalHistory")} />
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("chronicDiseases")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Diabète, asthme" {...form.register("chronicDiseases")} />
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("currentTreatments")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Médicaments réguliers, posologie" {...form.register("currentTreatments")} />
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("disabilities")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Déficit auditif, allergies alimentaires" {...form.register("disabilities")} />
          </div>
        </div>

        {/* Section 5 */}
        <div className="flex flex-col gap-4 w-full">
          <p className={sectionTitleClass}>{t("sectionAdministrative")}</p>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("dossierNumber")}</Label>
              <div className={disabledFieldClass}>
                <span className="text-[#94a3b8] text-[14px]">{existingPatient?.dossierNumber ?? "D-000000"}</span>
                <span className="font-semibold text-[#64748b] text-[12px]">{t("autoGenerated")}</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("fileCreationDate")}</Label>
              <div className={disabledFieldClass}>
                <span className="text-[#94a3b8] text-[14px]">
                  {existingPatient ? new Date(existingPatient.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}
                </span>
                <span className="font-semibold text-[#64748b] text-[12px]">{t("autoShort")}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("facilityService")}</Label>
              <Input className={inputClass} placeholder="Ex: Hôpital Général / Cardiologie" {...form.register("facilityService")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("referringDoctor")}</Label>
              <Input className={inputClass} placeholder="Ex: Dr. Mbarga" {...form.register("referringDoctorId")} />
            </div>
          </div>
          <div className="flex flex-col gap-2.5 w-full">
            <Label className={labelClass}>{t("patientType")}</Label>
            <RadioGroup
              className="flex gap-3 items-center"
              value={form.watch("patientType") ?? "externe"}
              onValueChange={(value) => form.setValue("patientType", value as InsertPatient["patientType"])}>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="externe" id="type-externe" />
                <Label htmlFor="type-externe" className="text-[#475569] text-[14px] font-normal">{t("patientTypeExterne")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="hospitalise" id="type-hospitalise" />
                <Label htmlFor="type-hospitalise" className="text-[#475569] text-[14px] font-normal">{t("patientTypeHospitalise")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="urgence" id="type-urgence" />
                <Label htmlFor="type-urgence" className="text-[#475569] text-[14px] font-normal">{t("patientTypeUrgence")}</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("paymentMode")}</Label>
              <Select
                value={form.watch("paymentMode") ?? ""}
                onValueChange={(value) => form.setValue("paymentMode", value as InsertPatient["paymentMode"])}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Assurance / Mutuelle / Tiers payant / Comptant" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assurance">{t("paymentModeAssurance")}</SelectItem>
                  <SelectItem value="mutuelle">{t("paymentModeMutuelle")}</SelectItem>
                  <SelectItem value="tiers_payant">{t("paymentModeTiersPayant")}</SelectItem>
                  <SelectItem value="comptant">{t("paymentModeComptant")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("insuranceName")}</Label>
              <Input className={inputClass} placeholder="Ex: CNPS / Mutuelle" {...form.register("insuranceName")} />
            </div>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("insuranceNumber")}</Label>
              <Input className={inputClass} placeholder="Ex: 00 00 00 00 00" {...form.register("insuranceNumber")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("financiallyResponsible")}</Label>
              <Input className={inputClass} placeholder="Ex: Patient / Parent / Époux" {...form.register("financiallyResponsible")} />
            </div>
          </div>
        </div>

        {/* Section 6 */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <p className={sectionTitleClass}>{t("sectionPediatric")}</p>
            <p className="font-medium text-[#64748b] text-[13px]">{t("pediatricSectionHint")}</p>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("pediatricFatherName")}</Label>
              <Input className={inputClass} placeholder="Ex: Jean Koffi" {...form.register("pediatricInfo.fatherName")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("pediatricMotherName")}</Label>
              <Input className={inputClass} placeholder="Ex: Marie Koffi" {...form.register("pediatricInfo.motherName")} />
            </div>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("pediatricLegalGuardian")}</Label>
              <Input className={inputClass} placeholder="Ex: Père / Mère / Tuteur" {...form.register("pediatricInfo.legalGuardian")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("pediatricGuardianPhone")}</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("pediatricInfo.guardianPhone")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("pediatricGuardianRelation")}</Label>
            <Input className={inputClass} placeholder="Père / Mère / Tuteur / Autre" {...form.register("pediatricInfo.guardianRelation")} />
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("pediatricWeightKg")}</Label>
              <Input className={inputClass} placeholder="Ex: 12.5" {...form.register("pediatricInfo.weightKg")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("pediatricHeightCm")}</Label>
              <Input className={inputClass} placeholder="Ex: 145" {...form.register("pediatricInfo.heightCm")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("pediatricBirthInfo")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Naissance à terme, poids de naissance, complications" {...form.register("pediatricInfo.birthInfo")} />
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("pediatricVaccinations")}</Label>
            <Textarea className={`${inputClass} h-[96px]`} placeholder="Ex: Calendrier vaccinal, dernières doses" {...form.register("pediatricInfo.vaccinations")} />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-[#e2e8f0] flex items-center justify-between pt-4 w-full">
          <p className="font-semibold text-[#64748b] text-[13px]">{t("autoSaveDisabled")}</p>
          <div className="flex gap-3 items-center">
            <Button type="button" variant="outline" className="border-[#e2e8f0] text-[#475569] font-semibold rounded-[8px] px-5 py-2.5 h-auto" onClick={() => setLocation("/patients")}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              className="bg-[#047857] hover:bg-[#065f46] text-white font-semibold rounded-[8px] px-6 py-2.5 h-auto shadow-sm"
              disabled={saveMutation.isPending}
              data-testid="button-save-patient">
              {saveMutation.isPending ? t("saving") : t("savePatientRecord")}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
