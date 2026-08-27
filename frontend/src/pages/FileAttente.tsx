import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { QueuePolicy } from "@/lib/policies/queue.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { bucketQueueItems } from "@/lib/queueColumns";
import { QueueRegistrationModal } from "@/components/QueueRegistrationModal";
import { QueueEntryDetails } from "@/components/QueueEntryDetails";
import type { QueueItem } from "@shared/schema";

function priorityVariant(priority: QueueItem["priority"]): "default" | "secondary" | "destructive" {
  if (priority === "tres_urgent") return "destructive";
  if (priority === "urgent") return "default";
  return "secondary";
}

function priorityLabelKey(priority: string): string {
  return "priority" + priority[0].toUpperCase() + priority.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function FileAttente() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);

  const { data: queueItems = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  if (selectedItem) {
    return <QueueEntryDetails item={selectedItem} onBack={() => setSelectedItem(null)} />;
  }

  const columns = bucketQueueItems(queueItems);

  function renderCard(item: QueueItem) {
    const waitingMinutes = item.waitingSinceMs ? Math.round(item.waitingSinceMs / 60_000) : null;
    return (
      <div
        key={item.consultationId}
        className="glass-card rounded-xl p-4 space-y-2 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setSelectedItem(item)}
        data-testid={`queue-card-${item.consultationId}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">{item.patientId}</span>
          <Badge variant={priorityVariant(item.priority)}>{t(priorityLabelKey(item.priority))}</Badge>
        </div>
        {waitingMinutes !== null && (
          <p className="text-sm text-muted-foreground">{t("waitingSince")}: {waitingMinutes} {t("minutesShort")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="file-attente-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("queueTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("queueSubtitle")}</p>
        </div>
        <PolicyGuard policy={QueuePolicy} action="canAppendEvent">
          <Button className="btn-primary" onClick={() => setShowRegistrationModal(true)} data-testid="button-register-queue-patient">
            <Plus className="w-4 h-4 mr-2" />
            {t("registerPatient")}
          </Button>
        </PolicyGuard>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground">{t("waitingColumn")} ({columns.waiting.length})</h2>
            {columns.waiting.map(renderCard)}
          </div>
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground">{t("inConsultationColumn")} ({columns.inConsultation.length})</h2>
            {columns.inConsultation.map(renderCard)}
          </div>
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground">{t("doneColumn")} ({columns.done.length})</h2>
            {columns.done.map(renderCard)}
          </div>
        </div>
      )}

      <QueueRegistrationModal open={showRegistrationModal} onClose={() => setShowRegistrationModal(false)} />
    </div>
  );
}
