import React, { useState } from "react";
import { useParams, useLocation } from "wouter";
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
import { useDoctors } from "@/hooks/useStaffDirectory";
import type { Consultation, Room, RoomEffectiveStatus } from "@shared/schema";

type RoomHistoryEntry = Consultation & { patientName: string | null };

type RoomDetail = Room & {
  effectiveStatus: RoomEffectiveStatus;
  currentConsultation: Consultation | null;
  upcomingConsultations: Consultation[];
  recentHistory: RoomHistoryEntry[];
  assignedPatientNames: string[];
  currentConsultationPatientName: string | null;
  currentConsultationDoctorName: string | null;
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
  const [, setLocation] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const roomsPolicy = usePolicy(RoomsPolicy);
  const doctors = useDoctors();
  const doctorName = (doctorId: string) => {
    const doctor = doctors.find((d) => d.id === doctorId);
    return doctor ? `${doctor.firstName} ${doctor.lastName}` : null;
  };
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
    mutationFn: async (consultationId: string) => {
      const response = await offlineApiRequest("PUT", `/api/rooms/${id}/release`, { consultationId }, { collection: "rooms", entityId: id });
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
      <div className="flex items-center gap-2">
        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => setLocation("/salles")} data-testid="button-back-to-salles">
          {t("salles")}
        </Button>
        <span className="text-xs text-muted-foreground">›</span>
        <span className="text-xs font-medium text-primary">{room.number}</span>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-display font-bold text-foreground">{room.number}</h1>
            <Badge variant={statusBadgeVariant[room.effectiveStatus]}>{t(statusLabelKey[room.effectiveStatus])}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {room.floor ? `${room.floor} — ${room.roomType}` : room.roomType}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {roomsPolicy.canUpdate() && (
            <Button
              variant="outline"
              onClick={() => maintenanceMutation.mutate(room.status === "en_maintenance" ? "disponible" : "en_maintenance")}
              disabled={maintenanceMutation.isPending || room.assignments.length > 0}
              data-testid="button-toggle-maintenance">
              {room.status === "en_maintenance" ? t("markAvailable") : t("markInMaintenance")}
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
                <span className="font-semibold text-foreground">{room.roomType}</span>
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
                <div data-testid="text-current-consultation">
                  <div className="flex items-center gap-2 text-sm font-medium text-success">
                    <User className="w-4 h-4" />
                    {room.currentConsultationPatientName ?? room.currentConsultation.reason}
                  </div>
                  {room.currentConsultationDoctorName && (
                    <p className="text-xs text-muted-foreground pl-6">
                      {t("assignedToDoctorLabel").replace("{name}", room.currentConsultationDoctorName)}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground pl-6">
                    {new Date(room.currentConsultation.scheduledAt).toLocaleTimeString()}
                  </p>
                </div>
              ) : room.assignments.length > 0 ? (
                <div className="space-y-3" data-testid="text-assigned-patient">
                  {room.assignments.map((assignment, index) => (
                    <div key={assignment.consultationId} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-success">
                        <User className="w-4 h-4" />
                        {room.assignedPatientNames[index]}
                      </div>
                      {roomsPolicy.canRelease() && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => releaseMutation.mutate(assignment.consultationId)}
                          disabled={releaseMutation.isPending}
                          data-testid={`button-release-${assignment.consultationId}`}>
                          {t("releaseRoom")}
                        </Button>
                      )}
                    </div>
                  ))}
                  {room.capacity > 1 && (
                    <p className="text-xs text-muted-foreground">
                      {t("bedsOccupiedCountLabel")
                        .replace("{occupied}", String(room.assignments.length))
                        .replace("{total}", String(room.capacity))}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">{t("noCurrentOccupation")}</p>
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
                <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">{t("noCurrentOccupation")}</p>
              ) : (
                room.upcomingConsultations.map((c) => (
                  <div key={c.id} className="flex justify-between text-sm" data-testid={`row-upcoming-${c.id}`}>
                    <span>{new Date(c.scheduledAt).toLocaleTimeString()}</span>
                    <span className="text-muted-foreground">
                      {c.reason}{doctorName(c.assignedDoctorId) ? ` — Dr. ${doctorName(c.assignedDoctorId)}` : ""}
                    </span>
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
                <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">{t("noCurrentOccupation")}</p>
              ) : (
                room.recentHistory.map((c) => (
                  <div key={c.id} className="flex justify-between text-sm" data-testid={`row-history-${c.id}`}>
                    <div>
                      <p className="font-medium text-foreground">{c.patientName ?? c.reason}</p>
                      {c.patientName && <p className="text-xs text-muted-foreground">{c.reason}</p>}
                    </div>
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
