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
import { ServicesPolicy } from "@/lib/policies/services.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Service } from "@shared/schema";

export default function ServicesManager() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: servicesList = [], isLoading } = useQuery<Service[]>({
    queryKey: ["/api/services", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (service: Service) =>
      offlineApiRequest("PUT", `/api/services/${service.id}`, { isActive: !service.isActive }, { collection: "services", entityId: service.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services", currentTenant?.id] });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveService"), t("networkRequestFailed"));
    },
  });

  return (
    <div className="space-y-6" data-testid="services-page">
      <Button variant="ghost" onClick={() => setLocation("/settings")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("settings")}
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("servicesManagerTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("servicesManagerSubtitle")}</p>
        </div>
        <PolicyGuard policy={ServicesPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setLocation("/settings/services/new")} data-testid="button-new-service">
            <Plus className="w-4 h-4 mr-2" />
            {t("newServiceAction")}
          </Button>
        </PolicyGuard>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : servicesList.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noServices")}</div>
      ) : (
        <div className="glass-card rounded-xl p-5 space-y-2">
          {servicesList.map((service) => (
            <div key={service.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3" data-testid={`service-row-${service.id}`}>
              <div className="min-w-0 flex items-center gap-2">
                <span className="text-sm font-medium text-foreground">{service.name}</span>
                <Badge variant={service.isActive ? "success" : "secondary"}>
                  {service.isActive ? t("serviceActiveLabel") : t("noLabel")}
                </Badge>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <PolicyGuard policy={ServicesPolicy} action="canUpdate">
                  <Switch
                    checked={service.isActive}
                    onCheckedChange={() => toggleActiveMutation.mutate(service)}
                    disabled={toggleActiveMutation.isPending}
                    data-testid={`switch-service-active-${service.id}`}
                  />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setLocation(`/settings/services/${service.id}/edit`)} data-testid={`button-edit-service-${service.id}`}>
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
