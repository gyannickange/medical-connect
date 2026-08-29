import React from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { usePolicy } from "@/hooks/usePolicy";
import { RoomsPolicy } from "@/lib/policies/rooms.policy";
import type { Consultation, Room, RoomEffectiveStatus } from "@shared/schema";

type RoomDetail = Room & {
  effectiveStatus: RoomEffectiveStatus;
  currentConsultation: Consultation | null;
  upcomingConsultations: Consultation[];
  recentHistory: Consultation[];
};

const statusLabelKey: Record<RoomEffectiveStatus, string> = {
  disponible: "roomStatusDisponible",
  occupee: "roomStatusOccupee",
  reservee: "roomStatusReservee",
  en_maintenance: "roomStatusEnMaintenance",
};

export default function SalleDetails() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const roomsPolicy = usePolicy(RoomsPolicy);

  const { data: room, isLoading } = useQuery<RoomDetail>({
    queryKey: ["/api/rooms/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/detail/${id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!id,
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (status: "disponible" | "en_maintenance") => {
      const response = await offlineApiRequest("PUT", `/api/rooms/${id}`, { status }, { collection: "rooms", entityId: id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms/detail", id] });
      toast({ title: t("success"), description: t("roomUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateRoom"), t("networkRequestFailed"));
    },
  });

  if (isLoading || !room) {
    return <div className="p-6 text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold text-foreground">{room.number}</h1>
          <Badge>{t(statusLabelKey[room.effectiveStatus])}</Badge>
        </div>
        {roomsPolicy.canUpdate() && (
          <Button
            variant="outline"
            onClick={() => maintenanceMutation.mutate(room.status === "en_maintenance" ? "disponible" : "en_maintenance")}
            disabled={maintenanceMutation.isPending}
            data-testid="button-toggle-maintenance">
            {room.status === "en_maintenance" ? t("markAvailable") : t("markInMaintenance")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("currentOccupation")}</CardTitle>
          </CardHeader>
          <CardContent>
            {room.currentConsultation ? (
              <p className="text-sm text-foreground" data-testid="text-current-consultation">
                {room.currentConsultation.reason} — {new Date(room.currentConsultation.scheduledAt).toLocaleTimeString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noCurrentOccupation")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("todaysReservations")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {room.upcomingConsultations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCurrentOccupation")}</p>
            ) : (
              room.upcomingConsultations.map((c) => (
                <div key={c.id} className="flex justify-between text-sm" data-testid={`row-upcoming-${c.id}`}>
                  <span>{new Date(c.scheduledAt).toLocaleTimeString()}</span>
                  <span className="text-muted-foreground">{c.reason}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("recentUsageHistory")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {room.recentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCurrentOccupation")}</p>
            ) : (
              room.recentHistory.map((c) => (
                <div key={c.id} className="flex justify-between text-sm" data-testid={`row-history-${c.id}`}>
                  <span>{c.reason}</span>
                  <span className="text-muted-foreground">{new Date(c.scheduledAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
