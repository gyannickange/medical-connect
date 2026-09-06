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
import { SpecialtiesPolicy } from "@/lib/policies/specialties.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Specialty } from "@shared/schema";

export default function SpecialtiesManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: specialtiesList = [], isLoading } = useQuery<Specialty[]>({
    queryKey: ["/api/specialties", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (specialty: Specialty) =>
      offlineApiRequest("PUT", `/api/specialties/${specialty.id}`, { isActive: !specialty.isActive }, { collection: "specialties", entityId: specialty.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/specialties", currentTenant?.id] });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveSpecialty"), t("networkRequestFailed"));
    },
  });

  return (
    <div className="space-y-6" data-testid="specialties-page">
      <Button variant="ghost" onClick={() => setLocation("/settings")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("settings")}
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("specialtiesManagerTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("specialtiesManagerSubtitle")}</p>
        </div>
        <PolicyGuard policy={SpecialtiesPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setLocation("/settings/specialties/new")} data-testid="button-new-specialty">
            <Plus className="w-4 h-4 mr-2" />
            {t("newSpecialtyAction")}
          </Button>
        </PolicyGuard>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : specialtiesList.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noSpecialties")}</div>
      ) : (
        <div className="glass-card rounded-xl p-5 space-y-2">
          {specialtiesList.map((specialty) => (
            <div key={specialty.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3" data-testid={`specialty-row-${specialty.id}`}>
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{specialty.name}</span>
                <Badge variant={specialty.isActive ? "success" : "secondary"}>
                  {specialty.isActive ? t("serviceActiveLabel") : t("noLabel")}
                </Badge>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <PolicyGuard policy={SpecialtiesPolicy} action="canUpdate">
                  <Switch
                    checked={specialty.isActive}
                    onCheckedChange={() => toggleActiveMutation.mutate(specialty)}
                    disabled={toggleActiveMutation.isPending}
                    data-testid={`switch-specialty-active-${specialty.id}`}
                  />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setLocation(`/settings/specialties/${specialty.id}/edit`)} data-testid={`button-edit-specialty-${specialty.id}`}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                </PolicyGuard>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
