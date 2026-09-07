import React, { useState } from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
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
  assignedPatientName: string | null;
};

interface PendingHospitalisation {
  consultationId: string;
  patientId: string;
  patientName: string;
  targetService: string;
  bedUrgentlyRequired: boolean;
  closedAt: string | null;
}

const statusLabelKey: Record<RoomEffectiveStatus, string> = {
  disponible: "roomStatusDisponible",
  occupee: "roomStatusOccupee",
  reservee: "roomStatusReservee",
  en_maintenance: "roomStatusEnMaintenance",
};

const statusBadgeVariant: Record<RoomEffectiveStatus, "success" | "danger" | "warning" | "secondary"> = {
  disponible: "success",
  occupee: "danger",
  reservee: "warning",
  en_maintenance: "secondary",
};

export default function SalleDetails() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const roomsPolicy = usePolicy(RoomsPolicy);
  const [reserveDialogOpen, setReserveDialogOpen] = useState(false);

  const { data: room, isLoading } = useQuery<RoomDetail>({
    queryKey: ["/api/rooms/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/detail/${id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!id,
  });

  const { data: pendingHospitalisations = [] } = useQuery<PendingHospitalisation[]>({
    queryKey: ["/api/rooms/pending-hospitalisations", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/pending-hospitalisations/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: reserveDialogOpen && !!currentTenant?.id,
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

  const assignMutation = useMutation({
    mutationFn: async (pending: PendingHospitalisation) => {
      const response = await offlineApiRequest(
        "PUT",
        `/api/rooms/${id}/assign`,
        { patientId: pending.patientId, consultationId: pending.consultationId },
        { collection: "rooms", entityId: id }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms/detail", id] });
      toast({ title: t("success"), description: t("roomAssignedSuccessfully") });
      setReserveDialogOpen(false);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAssignRoom"), t("networkRequestFailed"));
    },
  });

  const releaseMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/rooms/${id}/release`, undefined, { collection: "rooms", entityId: id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms/detail", id] });
      toast({ title: t("success"), description: t("roomReleasedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToReleaseRoom"), t("networkRequestFailed"));
    },
  });

  if (isLoading || !room) {
    return <div className="p-6 text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-foreground">{room.number}</h1>
            <Badge variant={statusBadgeVariant[room.effectiveStatus]}>{t(statusLabelKey[room.effectiveStatus])}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {room.floor ? `${room.floor} — ${room.type}` : room.type}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {roomsPolicy.canUpdate() && (
            <Button
              variant="outline"
              onClick={() => maintenanceMutation.mutate(room.status === "en_maintenance" ? "disponible" : "en_maintenance")}
              disabled={maintenanceMutation.isPending || !!room.assignedPatientId}
              data-testid="button-toggle-maintenance">
              {room.status === "en_maintenance" ? t("markAvailable") : t("markInMaintenance")}
            </Button>
          )}
          {roomsPolicy.canRelease() && room.assignedPatientId && (
            <Button
              variant="outline"
              onClick={() => releaseMutation.mutate()}
              disabled={releaseMutation.isPending}
              data-testid="button-release-room">
              {t("releaseRoom")}
            </Button>
          )}
          {roomsPolicy.canAssign() && room.effectiveStatus === "disponible" && (
            <Button onClick={() => setReserveDialogOpen(true)} data-testid="button-reserve-room">
              {t("reserveRoom")}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("roomCharacteristicsTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("roomTypeLabel")}</span>
                <span className="font-semibold text-foreground">{room.type}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("roomFloor")}</span>
                <span className="font-semibold text-foreground">{room.floor ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t("roomCapacityLabel")}</span>
                <span className="font-semibold text-foreground">
                  {t("roomCapacityPatientsLabel").replace("{count}", String(room.capacity))}
                </span>
              </div>
              {room.equipment.length > 0 && (
                <div className="pt-3 border-t border-border space-y-2">
                  <p className="text-sm font-semibold text-foreground">{t("roomEquipmentListedTitle")}</p>
                  {room.equipment.map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-success" />
                      {item}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("currentOccupation")}</CardTitle>
            </CardHeader>
            <CardContent>
              {room.currentConsultation ? (
                <p className="text-sm text-foreground" data-testid="text-current-consultation">
                  {room.currentConsultation.reason} — {new Date(room.currentConsultation.scheduledAt).toLocaleTimeString()}
                </p>
              ) : room.assignedPatientName ? (
                <div className="flex items-center gap-2 text-sm font-medium text-success" data-testid="text-assigned-patient">
                  <User className="w-4 h-4" />
                  {room.assignedPatientName}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noCurrentOccupation")}</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
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

          <Card>
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

      <Dialog open={reserveDialogOpen} onOpenChange={setReserveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pendingHospitalisationsTitle")}</DialogTitle>
          </DialogHeader>
          {pendingHospitalisations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noPendingHospitalisations")}</p>
          ) : (
            <div className="space-y-2">
              {pendingHospitalisations.map((pending) => (
                <div
                  key={pending.consultationId}
                  className="flex items-center justify-between border border-border rounded-md p-3"
                  data-testid={`row-pending-${pending.consultationId}`}>
                  <div>
                    <p className="text-sm font-medium text-foreground">{pending.patientName}</p>
                    <p className="text-xs text-muted-foreground">{pending.targetService}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {pending.bedUrgentlyRequired && <Badge variant="danger">{t("bedUrgentlyRequiredBadge")}</Badge>}
                    <Button
                      size="sm"
                      onClick={() => assignMutation.mutate(pending)}
                      disabled={assignMutation.isPending}
                      data-testid={`button-assign-${pending.consultationId}`}>
                      {t("assignRoomAction")}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
