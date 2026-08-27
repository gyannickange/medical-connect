import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { ConsultationFormModal } from "@/components/ConsultationFormModal";
import { ConsultationDetails } from "@/components/ConsultationDetails";
import type { Consultation } from "@shared/schema";

function statusVariant(status: Consultation["status"]): "default" | "secondary" | "destructive" {
  if (status === "annulee") return "destructive";
  if (status === "terminee") return "secondary";
  return "default";
}

function statusLabelKey(status: string): string {
  return "consultationStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function Consultations() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: consultationsList = [], isLoading } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  if (selectedId) {
    return <ConsultationDetails consultationId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-6" data-testid="consultations-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("consultations")}</h1>
          <p className="text-sm text-muted-foreground">{t("consultationsOfTheDay")}</p>
        </div>
        <PolicyGuard policy={ConsultationsPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setShowFormModal(true)} data-testid="button-add-consultation">
            <Plus className="w-4 h-4 mr-2" />
            {t("newConsultation")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : consultationsList.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noConsultationsToday")}</div>
        ) : (
          consultationsList.map((consultation) => (
            <div
              key={consultation.id}
              className="glass-card rounded-xl p-6 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setSelectedId(consultation.id)}
              data-testid={`row-consultation-${consultation.id}`}>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{consultation.specialty[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground">{consultation.specialty}</p>
                  <p className="text-sm text-muted-foreground">{consultation.reason}</p>
                </div>
              </div>
              <Badge variant={statusVariant(consultation.status)}>{t(statusLabelKey(consultation.status))}</Badge>
            </div>
          ))
        )}
      </div>

      <ConsultationFormModal open={showFormModal} onClose={() => setShowFormModal(false)} />
    </div>
  );
}
