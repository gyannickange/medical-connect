import React from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { QueueEventType, QueueItem } from "@shared/schema";

interface QueueEntryDetailsProps {
  item: QueueItem;
  onBack: () => void;
}

function priorityLabelKey(priority: string): string {
  return "priority" + priority[0].toUpperCase() + priority.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export function QueueEntryDetails({ item, onBack }: QueueEntryDetailsProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const eventMutation = useMutation({
    mutationFn: async (eventType: QueueEventType) =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: item.consultationId, patientId: item.patientId, eventType, tenantId: currentTenant?.id },
        { collection: "queue" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      onBack();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  const waitingMinutes = item.waitingSinceMs ? Math.round(item.waitingSinceMs / 60_000) : null;

  return (
    <div className="space-y-6" data-testid="queue-entry-details">
      <Button variant="ghost" onClick={onBack}>
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
