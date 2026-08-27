import React from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { QueueEventType, QueueItem } from "@shared/schema";

function priorityLabelKey(priority: string): string {
  return "priority" + priority[0].toUpperCase() + priority.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function QueueEntryDetails() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { consultationId } = useParams<{ consultationId: string }>();

  const { data: queueItems = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  const item = queueItems.find((entry) => entry.consultationId === consultationId);

  const eventMutation = useMutation({
    mutationFn: async (eventType: QueueEventType) =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId, patientId: item?.patientId, eventType, tenantId: currentTenant?.id },
        { collection: "queue" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      setLocation("/file-attente");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  if (isLoading || !item) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const waitingMinutes = item.waitingSinceMs ? Math.round(item.waitingSinceMs / 60_000) : null;

  return (
    <div className="space-y-6" data-testid="queue-entry-details">
      <Button variant="ghost" onClick={() => setLocation("/file-attente")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("queueTitle")}
      </Button>

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("consultation")} — {item.consultationId}</h2>
          <Badge>{t(priorityLabelKey(item.priority))}</Badge>
        </div>
        {waitingMinutes !== null && (
          <p className="text-sm text-muted-foreground">{t("waitingSince")}: {waitingMinutes} {t("minutesShort")}</p>
        )}

        <div className="flex flex-col gap-2 pt-4">
          <Button onClick={() => eventMutation.mutate("in_care")} disabled={eventMutation.isPending} data-testid="button-take-in-charge">
            {t("takeInCharge")}
          </Button>
          <Button variant="outline" onClick={() => eventMutation.mutate("in_consultation")} disabled={eventMutation.isPending} data-testid="button-mark-seen">
            {t("markSeen")}
          </Button>
          <Button variant="outline" onClick={() => eventMutation.mutate("completed")} disabled={eventMutation.isPending} data-testid="button-complete-queue-entry">
            {t("doneColumn")}
          </Button>
          <Button variant="destructive" onClick={() => eventMutation.mutate("cancelled")} disabled={eventMutation.isPending} data-testid="button-cancel-queue-entry">
            {t("cancelOrRemove")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
