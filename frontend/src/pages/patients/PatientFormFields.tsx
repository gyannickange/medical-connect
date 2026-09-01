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
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { useDoctors } from "@/hooks/useStaffDirectory";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertPatientSchema, type InsertPatient, type Patient, type Service } from "@shared/schema";

const inputClass = "bg-card border border-border rounded-[8px] px-[14px] py-[10px] text-[14px] text-foreground placeholder:text-muted-foreground h-auto";
const disabledFieldClass = "bg-muted border border-border rounded-[8px] px-[14px] py-[10px] flex items-center justify-between";
const labelClass = "font-semibold text-secondary-foreground text-[13px]";
const sectionTitleClass = "font-bold text-primary text-[16px]";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
const MARITAL_STATUSES = ["celibataire", "marie", "divorce", "veuf"] as const;
const GUARDIAN_OPTIONS = ["pere", "mere", "tuteur", "autre"] as const;

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
  const doctors = useDoctors();

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["/api/services", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const activeServices = services.filter((service) => service.isActive);

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
  const doctorOptions = doctors.map((doctor) => ({ value: doctor.id, label: `${doctor.firstName} ${doctor.lastName}` }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 max-w-[500px]">
        <h1 className="font-bold text-foreground text-[24px]">{editingId ? t("editPatient") : t("createPatient")}</h1>
        <p className="font-medium text-muted-foreground text-[14px]">{editingId ? t("editPatientSubtitle") : t("newPatientSubtitle")}</p>
      </div>

      <form
        onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
        className="bg-card border border-border rounded-[16px] shadow-sm flex flex-col gap-8 p-8 w-full"
        data-testid="patient-form">
        {/* Section 1 */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <p className={sectionTitleClass}>{t("sectionIdentification")}</p>
            <p className="font-medium text-muted-foreground text-[13px]">{t("requiredFieldsNote")}</p>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("patientIdAutoLabel")}</Label>
              <div className={disabledFieldClass}>
                <span className="text-muted-foreground text-[14px]">{existingPatient?.dossierNumber ?? "PT-000000"}</span>
                <span className="font-semibold text-muted-foreground text-[12px]">{t("autoGenerated")}</span>
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
              <DatePicker
                value={form.watch("dateOfBirth")}
                onValueChange={(value) => form.setValue("dateOfBirth", value, { shouldValidate: true })}
                className={inputClass}
                data-testid="input-dateOfBirth"
              />
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
              <label className="bg-muted border border-dashed border-border rounded-[8px] h-[120px] flex flex-col gap-2 items-center justify-center cursor-pointer">
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && setPendingPhoto(e.target.files[0])}
                />
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="font-semibold text-muted-foreground text-[13px]">{pendingPhoto ? pendingPhoto.name : t("dragDropPhoto")}</span>
                <span className="text-muted-foreground text-[12px]">{t("photoFormatHint")}</span>
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
              <Select
                value={form.watch("maritalStatus") ?? ""}
                onValueChange={(value) => form.setValue("maritalStatus", value, { shouldValidate: true })}>
                <SelectTrigger className={inputClass} data-testid="select-maritalStatus">
                  <SelectValue placeholder={t("maritalStatus")} />
                </SelectTrigger>
                <SelectContent>
                  {MARITAL_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>{t(`maritalStatus${status[0].toUpperCase()}${status.slice(1)}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("idDocumentType")}</Label>
              <Select
                value={form.watch("idDocumentType") ?? ""}
                onValueChange={(value) => form.setValue("idDocumentType", value as InsertPatient["idDocumentType"], { shouldValidate: true })}>
                <SelectTrigger className={inputClass} data-testid="select-idDocumentType">
                  <SelectValue placeholder="CNI / Passeport / Permis / ANIP" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cni">{t("idDocumentTypeCni")}</SelectItem>
                  <SelectItem value="passeport">{t("idDocumentTypePasseport")}</SelectItem>
                  <SelectItem value="permis">{t("idDocumentTypePermis")}</SelectItem>
                  <SelectItem value="anip">{t("idDocumentTypeAnip")}</SelectItem>
                  <SelectItem value="autre">{t("idDocumentTypeAutre")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {form.watch("idDocumentType") === "autre" && (
            <div className="flex items-start w-full">
              <div className="flex-1 flex flex-col gap-1.5">
                <Label className={labelClass}>{t("idDocumentTypeOtherPlaceholder")}</Label>
                <Input className={inputClass} placeholder={t("idDocumentTypeOtherPlaceholder")} {...form.register("idDocumentTypeOther")} data-testid="input-idDocumentTypeOther" />
              </div>
            </div>
          )}

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("idDocumentNumber")}</Label>
              <Input className={inputClass} placeholder="Ex: 00 00 00 00 00" {...form.register("idDocumentNumber")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("idDocumentExpiry")}</Label>
              <DatePicker
                value={form.watch("idDocumentExpiry") ?? ""}
                onValueChange={(value) => form.setValue("idDocumentExpiry", value, { shouldValidate: true })}
                fromYear={new Date().getFullYear()}
                toYear={new Date().getFullYear() + 20}
                className={inputClass}
              />
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("email")}</Label>
              <Input type="email" className={inputClass} placeholder="patient@hospital.com" {...form.register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("secondaryPhone")}</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("secondaryPhone")} />
            </div>
          </div>

          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("residenceZone")}</Label>
              <Input className={inputClass} placeholder="Ex: Yaoundé" {...form.register("residenceZone")} />
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("fullAddress")}</Label>
              <Textarea className={`${inputClass} h-[44px]`} placeholder="Ex: Rue 1204, quartier Mokolo, Yaoundé" {...form.register("fullAddress")} />
            </div>
          </div>
        </div>

        {/* Section 2 */}
        <div className="flex flex-col gap-4 w-full">
          <p className={sectionTitleClass}>{t("sectionEmergencyContact")}</p>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactName")} *</Label>
              <Input className={inputClass} placeholder="Ex: Marie Koffi" {...form.register("emergencyContact.name")} data-testid="input-emergencyContactName" />
              {errors.emergencyContact?.name && <p className="text-sm text-destructive">{errors.emergencyContact.name.message}</p>}
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactRelation")} *</Label>
              <Select
                value={form.watch("emergencyContact.relation") ?? ""}
                onValueChange={(value) => form.setValue("emergencyContact.relation", value, { shouldValidate: true })}>
                <SelectTrigger className={inputClass} data-testid="select-emergencyContactRelation">
                  <SelectValue placeholder="Époux / Épouse / Parent / Enfant / Autre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="epoux">{t("emergencyContactRelationEpoux")}</SelectItem>
                  <SelectItem value="epouse">{t("emergencyContactRelationEpouse")}</SelectItem>
                  <SelectItem value="parent">{t("emergencyContactRelationParent")}</SelectItem>
                  <SelectItem value="enfant">{t("emergencyContactRelationEnfant")}</SelectItem>
                  <SelectItem value="autre">{t("emergencyContactRelationAutre")}</SelectItem>
                </SelectContent>
              </Select>
              {errors.emergencyContact?.relation && <p className="text-sm text-destructive">{errors.emergencyContact.relation.message}</p>}
            </div>
          </div>
          {form.watch("emergencyContact.relation") === "autre" && (
            <div className="flex items-start w-full">
              <div className="flex-1 flex flex-col gap-1.5">
                <Label className={labelClass}>{t("emergencyContactRelationOtherPlaceholder")}</Label>
                <Input className={inputClass} placeholder={t("emergencyContactRelationOtherPlaceholder")} {...form.register("emergencyContact.relationOther")} data-testid="input-emergencyContactRelationOther" />
              </div>
            </div>
          )}
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactPhone")} *</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("emergencyContact.phone")} data-testid="input-emergencyContactPhone" />
              {errors.emergencyContact?.phone && <p className="text-sm text-destructive">{errors.emergencyContact.phone.message}</p>}
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("emergencyContactAddress")}</Label>
              <Input className={inputClass} placeholder="Ex: Rue 1204, Yaoundé" {...form.register("emergencyContact.address")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("emergencyContactIsPriority")}</Label>
            <div className="flex items-center justify-between w-full">
              <span className="text-secondary-foreground text-[14px]">{t("contactPriorityHint")}</span>
              <Switch
                checked={!!form.watch("emergencyContact.isPriority")}
                onCheckedChange={(checked) => form.setValue("emergencyContact.isPriority", checked, { shouldValidate: true })}
                data-testid="switch-emergency-priority"
              />
            </div>
          </div>
        </div>

        {/* Section 3 */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <p className={sectionTitleClass}>{t("sectionMedical")}</p>
            <p className="font-medium text-muted-foreground text-[13px]">{t("medicalSectionHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("bloodGroup")}</Label>
            <Select
              value={form.watch("bloodGroup") ?? ""}
              onValueChange={(value) => form.setValue("bloodGroup", value, { shouldValidate: true })}>
              <SelectTrigger className={inputClass} data-testid="select-bloodGroup">
                <SelectValue placeholder="A+ / A- / B+ / B- / AB+ / AB- / O+ / O- / Non renseigné" />
              </SelectTrigger>
              <SelectContent>
                {BLOOD_GROUPS.map((group) => (
                  <SelectItem key={group} value={group}>{group}</SelectItem>
                ))}
                <SelectItem value="non_renseigne">{t("bloodGroupNonRenseigne")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2.5 w-full">
            <Label className={labelClass}>{t("allergyKnowledge")}</Label>
            <RadioGroup
              className="flex gap-3 items-center"
              value={form.watch("allergyKnowledge") ?? "non_renseigne"}
              onValueChange={(value) => form.setValue("allergyKnowledge", value as InsertPatient["allergyKnowledge"])}>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="aucune_connue" id="allergy-none" />
                <Label htmlFor="allergy-none" className="text-secondary-foreground text-[14px] font-normal">{t("allergyKnowledgeAucuneConnue")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="allergies_connues" id="allergy-known" />
                <Label htmlFor="allergy-known" className="text-secondary-foreground text-[14px] font-normal">{t("allergyKnowledgeAllergiesConnues")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="non_renseigne" id="allergy-unknown" />
                <Label htmlFor="allergy-unknown" className="text-secondary-foreground text-[14px] font-normal">{t("allergyKnowledgeNonRenseigne")}</Label>
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

        {/* Section 4 */}
        <div className="flex flex-col gap-4 w-full">
          <p className={sectionTitleClass}>{t("sectionAdministrative")}</p>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("dossierNumber")}</Label>
              <div className={disabledFieldClass}>
                <span className="text-muted-foreground text-[14px]">{existingPatient?.dossierNumber ?? "D-000000"}</span>
                <span className="font-semibold text-muted-foreground text-[12px]">{t("autoGenerated")}</span>
              </div>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("fileCreationDate")}</Label>
              <div className={disabledFieldClass}>
                <span className="text-muted-foreground text-[14px]">
                  {existingPatient ? new Date(existingPatient.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}
                </span>
                <span className="font-semibold text-muted-foreground text-[12px]">{t("autoShort")}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-5 items-start w-full">
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("facilityService")}</Label>
              <Select
                value={form.watch("facilityService") ?? ""}
                onValueChange={(value) => form.setValue("facilityService", value, { shouldValidate: true })}
                disabled={activeServices.length === 0}>
                <SelectTrigger className={inputClass} data-testid="select-facilityService">
                  <SelectValue placeholder={activeServices.length === 0 ? t("noServicesAvailable") : t("selectServicePlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {activeServices.map((service) => (
                    <SelectItem key={service.id} value={service.name}>{service.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("referringDoctor")}</Label>
              <Combobox
                options={doctorOptions}
                value={form.watch("referringDoctorId") ?? ""}
                onValueChange={(value) => form.setValue("referringDoctorId", value, { shouldValidate: true })}
                placeholder={t("selectDoctorPlaceholder")}
                searchPlaceholder={t("searchDoctorPlaceholder")}
                emptyText={t("noDoctorsFound")}
                className={inputClass}
                data-testid="combobox-referringDoctorId"
              />
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
                <Label htmlFor="type-externe" className="text-secondary-foreground text-[14px] font-normal">{t("patientTypeExterne")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="hospitalise" id="type-hospitalise" />
                <Label htmlFor="type-hospitalise" className="text-secondary-foreground text-[14px] font-normal">{t("patientTypeHospitalise")}</Label>
              </div>
              <div className="flex gap-2 items-center">
                <RadioGroupItem value="urgence" id="type-urgence" />
                <Label htmlFor="type-urgence" className="text-secondary-foreground text-[14px] font-normal">{t("patientTypeUrgence")}</Label>
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
              <Select
                value={form.watch("financiallyResponsible") ?? ""}
                onValueChange={(value) => form.setValue("financiallyResponsible", value, { shouldValidate: true })}>
                <SelectTrigger className={inputClass} data-testid="select-financiallyResponsible">
                  <SelectValue placeholder="Patient / Parent / Époux" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="patient">{t("financiallyResponsiblePatient")}</SelectItem>
                  <SelectItem value="parent">{t("financiallyResponsibleParent")}</SelectItem>
                  <SelectItem value="epoux_epouse">{t("financiallyResponsibleSpouse")}</SelectItem>
                  <SelectItem value="autre">{t("financiallyResponsibleAutre")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Section 5 */}
        <div className="flex flex-col gap-4 w-full">
          <div className="flex flex-col gap-1.5">
            <p className={sectionTitleClass}>{t("sectionPediatric")}</p>
            <p className="font-medium text-muted-foreground text-[13px]">{t("pediatricSectionHint")}</p>
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
              <Select
                value={form.watch("pediatricInfo.legalGuardian") ?? ""}
                onValueChange={(value) => form.setValue("pediatricInfo.legalGuardian", value, { shouldValidate: true })}>
                <SelectTrigger className={inputClass} data-testid="select-pediatricLegalGuardian">
                  <SelectValue placeholder="Père / Mère / Tuteur" />
                </SelectTrigger>
                <SelectContent>
                  {GUARDIAN_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{t(`guardianOption${option[0].toUpperCase()}${option.slice(1)}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <Label className={labelClass}>{t("pediatricGuardianPhone")}</Label>
              <Input className={inputClass} placeholder="+237 6xx xxx xxx" {...form.register("pediatricInfo.guardianPhone")} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5 w-full">
            <Label className={labelClass}>{t("pediatricGuardianRelation")}</Label>
            <Select
              value={form.watch("pediatricInfo.guardianRelation") ?? ""}
              onValueChange={(value) => form.setValue("pediatricInfo.guardianRelation", value, { shouldValidate: true })}>
              <SelectTrigger className={inputClass} data-testid="select-pediatricGuardianRelation">
                <SelectValue placeholder="Père / Mère / Tuteur / Autre" />
              </SelectTrigger>
              <SelectContent>
                {GUARDIAN_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>{t(`guardianOption${option[0].toUpperCase()}${option.slice(1)}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {form.watch("pediatricInfo.guardianRelation") === "autre" && (
            <div className="flex items-start w-full">
              <div className="flex-1 flex flex-col gap-1.5">
                <Label className={labelClass}>{t("guardianRelationOtherPlaceholder")}</Label>
                <Input className={inputClass} placeholder={t("guardianRelationOtherPlaceholder")} {...form.register("pediatricInfo.guardianRelationOther")} data-testid="input-guardianRelationOther" />
              </div>
            </div>
          )}
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
        <div className="border-t border-border flex items-center justify-between pt-4 w-full">
          <p className="font-semibold text-muted-foreground text-[13px]">{t("autoSaveDisabled")}</p>
          <div className="flex gap-3 items-center">
            <Button type="button" variant="outline" className="border-border text-secondary-foreground font-semibold rounded-[8px] px-5 py-2.5 h-auto" onClick={() => setLocation("/patients")}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              className="font-semibold rounded-[8px] px-6 py-2.5 h-auto shadow-sm"
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
