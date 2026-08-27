import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertPatientSchema, type InsertPatient, type Patient } from "@shared/schema";
import { patientFormSections, type PatientFieldConfig } from "@/lib/patientFormFields";

interface PatientFormModalProps {
  open: boolean;
  editingPatient: Patient | null;
  onClose: () => void;
}

function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function defaultValuesFor(patient: Patient | null, tenantId: string): InsertPatient {
  if (!patient) {
    return { lastName: "", firstName: "", dateOfBirth: "", sex: "M", primaryPhone: "", residenceAddress: "", tenantId } as InsertPatient;
  }
  const { id, dossierNumber, searchName, photoS3Key, status, isActive, createdAt, updatedAt, ...rest } = patient;
  return { ...rest, tenantId } as InsertPatient;
}

export function PatientFormModal({ open, editingPatient, onClose }: PatientFormModalProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertPatient>({
    resolver: zodResolver(insertPatientSchema),
    defaultValues: defaultValuesFor(editingPatient, currentTenant?.id ?? ""),
  });

  useEffect(() => {
    form.reset(defaultValuesFor(editingPatient, currentTenant?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingPatient, currentTenant?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data: InsertPatient) => {
      const method = editingPatient ? "PUT" : "POST";
      const url = editingPatient ? `/api/patients/${editingPatient.id}` : "/api/patients";
      const response = await offlineApiRequest(method, url, { ...data, tenantId: currentTenant?.id }, { collection: "patients" });
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("patientSavedOffline") : editingPatient ? t("patientUpdatedSuccessfully") : t("patientCreatedSuccessfully"),
      });
      onClose();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), editingPatient ? t("failedToUpdatePatient") : t("failedToCreatePatient"), t("networkRequestFailed"));
    },
  });

  function renderField(field: PatientFieldConfig) {
    const error = getPath(form.formState.errors, field.name);
    return (
      <div key={field.name}>
        <Label htmlFor={field.name}>
          {t(field.labelKey)}
          {field.required ? " *" : ""}
        </Label>
        {field.type === "textarea" ? (
          <Textarea id={field.name} className="glass-input" {...form.register(field.name as any)} />
        ) : field.type === "checkbox" ? (
          <div className="flex items-center gap-2 mt-2">
            <Checkbox
              id={field.name}
              checked={!!form.watch(field.name as any)}
              onCheckedChange={(checked) => form.setValue(field.name as any, checked === true, { shouldValidate: true })}
            />
          </div>
        ) : field.type === "select" ? (
          <Select
            value={form.watch(field.name as any) ?? ""}
            onValueChange={(value) => form.setValue(field.name as any, value, { shouldValidate: true })}>
            <SelectTrigger className="glass-input" data-testid={`select-${field.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options!.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input id={field.name} type={field.type} className="glass-input" {...form.register(field.name as any)} />
        )}
        {error?.message && <p className="text-sm text-destructive mt-1">{String(error.message)}</p>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass-card max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingPatient ? t("editPatient") : t("createPatient")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6 mt-4">
          {patientFormSections.map((section) => (
            <fieldset key={section.key} className="space-y-4">
              <legend className="font-semibold text-foreground mb-2">{t(section.titleKey)}</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields.map(renderField)}
              </div>
            </fieldset>
          ))}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" className="btn-primary" disabled={saveMutation.isPending} data-testid="button-save-patient">
              {saveMutation.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
