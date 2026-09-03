import React, { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { ExamType, ExamTypeCategory, ExamTypeParameter } from "@shared/schema";

const CATEGORIES: ExamTypeCategory[] = ["laboratoire", "imagerie", "explorations_fonctionnelles", "autre"];

function emptyParameter(): ExamTypeParameter {
  return { name: "", unit: null, referenceRange: null };
}

function categoryLabelKey(category: ExamTypeCategory): string {
  return "examTypeCategory" + category.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase());
}

export default function ExamTypeForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: examTypeId } = useParams<{ id?: string }>();
  const isEditing = !!examTypeId;

  const [name, setName] = useState("");
  const [category, setCategory] = useState<ExamTypeCategory>("laboratoire");
  const [parameters, setParameters] = useState<ExamTypeParameter[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: examTypes } = useQuery<ExamType[]>({
    queryKey: ["/api/exam-types", currentTenant?.id],
    enabled: !!currentTenant?.id && isEditing,
  });
  const editing = examTypes?.find((e) => e.id === examTypeId) ?? null;

  if (isEditing && editing && !initialized) {
    setName(editing.name);
    setCategory(editing.category);
    setParameters(editing.parameters ?? []);
    setInitialized(true);
  }

  function goBack() {
    setLocation("/laboratoire/exam-types");
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleanParameters = parameters.filter((p) => p.name.trim().length > 0);
      if (isEditing && editing) {
        return offlineApiRequest("PUT", `/api/exam-types/${editing.id}`, { name, category, parameters: cleanParameters }, { collection: "exam-types", entityId: editing.id });
      }
      return offlineApiRequest("POST", "/api/exam-types", { name, category, parameters: cleanParameters, tenantId: currentTenant?.id }, { collection: "exam-types" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-types", currentTenant?.id] });
      toast({ title: t("success"), description: isEditing ? t("examTypeUpdatedSuccessfully") : t("examTypeCreatedSuccessfully") });
      goBack();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveExamType"), t("networkRequestFailed"));
    },
  });

  function addParameter() {
    setParameters((prev) => [...prev, emptyParameter()]);
  }

  function updateParameter(index: number, patch: Partial<ExamTypeParameter>) {
    setParameters((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function removeParameter(index: number) {
    setParameters((prev) => prev.filter((_, i) => i !== index));
  }

  if (isEditing && !editing) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="exam-type-form-page">
      <Button variant="ghost" onClick={goBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("examTypesManagerTitle")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{isEditing ? t("editExamTypeAction") : t("newExamTypeAction")}</h1>
      </div>

      <Card className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="exam-type-name">{t("examTypeNameLabel")}</Label>
            <Input id="exam-type-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-exam-type-name" />
          </div>
          <div>
            <Label>{t("examTypeCategorySectionTitle")}</Label>
            <Select value={category} onValueChange={(value) => setCategory(value as ExamTypeCategory)}>
              <SelectTrigger data-testid="select-exam-type-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>{t(categoryLabelKey(cat))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("examTypeParametersSectionTitle")}</Label>
              <p className="text-xs text-muted-foreground">{t("examTypeParametersSectionHint")}</p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addParameter} data-testid="button-add-exam-parameter">
              <Plus className="w-3.5 h-3.5 mr-1" />
              {t("examTypeAddParameterAction")}
            </Button>
          </div>

          {parameters.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("examTypeNoParametersHint")}</p>
          ) : (
            <div className="space-y-2">
              <div className="hidden sm:grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>{t("examTypeParameterNamePlaceholder")}</span>
                <span>{t("examTypeParameterUnitPlaceholder")}</span>
                <span>{t("examTypeParameterReferenceRangePlaceholder")}</span>
                <span />
              </div>
              {parameters.map((parameter, index) => (
                <div key={index} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-center rounded-lg bg-muted/40 p-3" data-testid={`exam-parameter-row-${index}`}>
                  <Input
                    placeholder={t("examTypeParameterNamePlaceholder")}
                    value={parameter.name}
                    onChange={(e) => updateParameter(index, { name: e.target.value })}
                    data-testid={`input-parameter-name-${index}`}
                  />
                  <Input
                    placeholder={t("examTypeParameterUnitPlaceholder")}
                    value={parameter.unit ?? ""}
                    onChange={(e) => updateParameter(index, { unit: e.target.value || null })}
                    data-testid={`input-parameter-unit-${index}`}
                  />
                  <Input
                    placeholder={t("examTypeParameterReferenceRangePlaceholder")}
                    value={parameter.referenceRange ?? ""}
                    onChange={(e) => updateParameter(index, { referenceRange: e.target.value || null })}
                    data-testid={`input-parameter-reference-${index}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 text-destructive justify-self-start sm:justify-self-center"
                    onClick={() => removeParameter(index)}
                    data-testid={`button-remove-parameter-${index}`}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={goBack}>{t("cancel")}</Button>
        <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={!name.trim() || saveMutation.isPending} data-testid="button-save-exam-type">
          {saveMutation.isPending ? t("saving") : t("save")}
        </Button>
      </div>
    </div>
  );
}
