import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Specialty } from "@shared/schema";

export default function SpecialtyForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: specialtyId } = useParams<{ id?: string }>();
  const isEditing = !!specialtyId;

  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const { data: specialtiesList } = useQuery<Specialty[]>({
    queryKey: ["/api/specialties", currentTenant?.id],
    enabled: !!currentTenant?.id && isEditing,
  });
  const editing = specialtiesList?.find((s) => s.id === specialtyId) ?? null;

  if (isEditing && editing && !initialized) {
    setName(editing.name);
    setIsActive(editing.isActive);
    setInitialized(true);
  }

  function goBack() {
    setLocation("/settings/specialties");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEditing && editing) {
        return offlineApiRequest("PUT", `/api/specialties/${editing.id}`, { name, isActive }, { collection: "specialties", entityId: editing.id });
      }
      return offlineApiRequest("POST", "/api/specialties", { name, isActive, tenantId: currentTenant?.id }, { collection: "specialties" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/specialties", currentTenant?.id] });
      toast({ title: t("success"), description: isEditing ? t("specialtyUpdatedSuccessfully") : t("specialtyCreatedSuccessfully") });
      goBack();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveSpecialty"), t("networkRequestFailed"));
    },
  });

  if (isEditing && !editing) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="specialty-form-page">
      <Button variant="ghost" onClick={goBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("specialtiesManagerTitle")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{isEditing ? t("editSpecialtyAction") : t("newSpecialtyAction")}</h1>
      </div>

      <Card className="p-6 space-y-6">
        <div>
          <Label htmlFor="specialty-name">{t("specialtyNameLabel")}</Label>
          <Input id="specialty-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-specialty-name" />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="specialty-active">{t("specialtyActiveLabel")}</Label>
          <Switch id="specialty-active" checked={isActive} onCheckedChange={setIsActive} data-testid="switch-specialty-active" />
        </div>
      </Card>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={goBack}>{t("cancel")}</Button>
        <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending} data-testid="button-save-specialty">
          {saveMutation.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
