import React from "react";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { ExamTypesPolicy } from "@/lib/policies/examTypes.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { ExamType, ExamTypeCategory } from "@shared/schema";

const CATEGORIES: ExamTypeCategory[] = ["laboratoire", "imagerie", "explorations_fonctionnelles", "autre"];

function categoryLabelKey(category: ExamTypeCategory): string {
  return "examTypeCategory" + category.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase());
}

export default function ExamTypesManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: examTypes = [], isLoading } = useQuery<ExamType[]>({
    queryKey: ["/api/exam-types", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (examType: ExamType) =>
      offlineApiRequest("PUT", `/api/exam-types/${examType.id}`, { isActive: !examType.isActive }, { collection: "exam-types", entityId: examType.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exam-types", currentTenant?.id] });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveExamType"), t("networkRequestFailed"));
    },
  });

  return (
    <div className="space-y-6" data-testid="exam-types-page">
      <Button variant="ghost" onClick={() => setLocation("/laboratoire")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("laboratoireTitle")}
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("examTypesManagerTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("examTypesManagerSubtitle")}</p>
        </div>
        <PolicyGuard policy={ExamTypesPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setLocation("/laboratoire/exam-types/new")} data-testid="button-new-exam-type">
            <Plus className="w-4 h-4 mr-2" />
            {t("newExamTypeAction")}
          </Button>
        </PolicyGuard>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : examTypes.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noExamTypes")}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {CATEGORIES.map((cat) => {
            const items = examTypes.filter((e) => e.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="glass-card rounded-xl p-5 space-y-3">
                <h2 className="font-bold text-sm text-foreground">{t(categoryLabelKey(cat))}</h2>
                <div className="space-y-2">
                  {items.map((examType) => (
                    <div key={examType.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3" data-testid={`exam-type-row-${examType.id}`}>
                      <div className="min-w-0 flex items-center gap-2">
                        <div>
                          <span className="text-sm font-medium text-foreground">{examType.name}</span>
                          {(examType.parameters?.length ?? 0) > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {t("examTypeParameterCountLabel").replace("{count}", String(examType.parameters.length))}
                            </p>
                          )}
                        </div>
                        <Badge variant={examType.isActive ? "success" : "secondary"}>
                          {examType.isActive ? t("serviceActiveLabel") : t("noLabel")}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <PolicyGuard policy={ExamTypesPolicy} action="canUpdate">
                          <Switch
                            checked={examType.isActive}
                            onCheckedChange={() => toggleActiveMutation.mutate(examType)}
                            disabled={toggleActiveMutation.isPending}
                            data-testid={`switch-exam-type-active-${examType.id}`}
                          />
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setLocation(`/laboratoire/exam-types/${examType.id}/edit`)} data-testid={`button-edit-exam-type-${examType.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </PolicyGuard>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
