import React, { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BedDouble, CalendarClock, DoorOpen, User, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { usePolicy } from "@/hooks/usePolicy";
import { RoomsPolicy } from "@/lib/policies/rooms.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Room, RoomEffectiveStatus } from "@shared/schema";

type RoomWithStatus = Room & {
  effectiveStatus: RoomEffectiveStatus;
  assignedPatientName: string | null;
  currentConsultationPatientName: string | null;
  currentConsultationDoctorName: string | null;
  nextReservationPatientName: string | null;
};

const statusBadgeVariant: Record<RoomEffectiveStatus, "success" | "danger" | "warning" | "secondary"> = {
  disponible: "success",
  occupee: "danger",
  reservee: "warning",
  en_maintenance: "secondary",
};

const statusLabelKey: Record<RoomEffectiveStatus, string> = {
  disponible: "roomStatusDisponible",
  occupee: "roomStatusOccupee",
  reservee: "roomStatusReservee",
  en_maintenance: "roomStatusEnMaintenance",
};

export default function SallesIndex() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const roomsPolicy = usePolicy(RoomsPolicy);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: rooms = [], isLoading } = useQuery<RoomWithStatus[]>({
    queryKey: ["/api/rooms", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  const counts = rooms.reduce(
    (acc, room) => {
      if (room.effectiveStatus === "disponible") acc.disponible += 1;
      if (room.effectiveStatus === "occupee") acc.occupee += 1;
      if (room.effectiveStatus === "reservee") acc.reservee += 1;
      return acc;
    },
    { disponible: 0, occupee: 0, reservee: 0 }
  );

  const roomTypes = Array.from(new Set(rooms.map((room) => room.type))).sort();
  const filteredRooms = rooms.filter(
    (room) => (typeFilter === "all" || room.type === typeFilter) && (statusFilter === "all" || room.effectiveStatus === statusFilter)
  );

  return (
    <PolicyGuard policy={RoomsPolicy} action="canView">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{t("roomsManagement")}</h1>
            <p className="text-sm text-muted-foreground">{t("roomsManagementSubtitle")}</p>
          </div>
          {roomsPolicy.canCreate() && (
            <Link href="/salles/new">
              <Button data-testid="button-add-room">{t("addRoom")}</Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsAvailable")}</p>
                <p className="text-2xl font-bold text-foreground">{counts.disponible}</p>
              </div>
              <span className="flex items-center justify-center rounded-lg bg-emerald-500/10 size-9">
                <DoorOpen className="w-4 h-4 text-success" />
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsOccupied")}</p>
                <p className="text-2xl font-bold text-foreground">{counts.occupee}</p>
              </div>
              <span className="flex items-center justify-center rounded-lg bg-red-500/10 size-9">
                <Users className="w-4 h-4 text-danger" />
              </span>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsReserved")}</p>
                <p className="text-2xl font-bold text-foreground">{counts.reservee}</p>
              </div>
              <span className="flex items-center justify-center rounded-lg bg-amber-500/10 size-9">
                <CalendarClock className="w-4 h-4 text-warning" />
              </span>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-auto" data-testid="select-filter-type">
              <SelectValue placeholder={t("roomTypeFilterAllLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("roomTypeFilterAllLabel")}</SelectItem>
              {roomTypes.map((type) => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-auto" data-testid="select-filter-status">
              <SelectValue placeholder={t("roomStatusFilterAllLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("roomStatusFilterAllLabel")}</SelectItem>
              {(Object.keys(statusLabelKey) as RoomEffectiveStatus[]).map((status) => (
                <SelectItem key={status} value={status}>{t(statusLabelKey[status])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room) => (
              <Card key={room.id} data-testid={`card-room-${room.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{room.number}</p>
                      <p className="text-sm text-muted-foreground">{room.type}</p>
                    </div>
                    <Badge variant={statusBadgeVariant[room.effectiveStatus]}>
                      {t(statusLabelKey[room.effectiveStatus])}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <BedDouble className="w-3.5 h-3.5" />
                    {t("roomBedsCountLabel").replace("{count}", String(room.capacity))}
                  </div>
                  {room.currentConsultationPatientName ? (
                    <div data-testid={`text-current-patient-${room.id}`}>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-success">
                        <User className="w-3.5 h-3.5" />
                        {room.currentConsultationPatientName}
                      </div>
                      {room.currentConsultationDoctorName && (
                        <p className="text-xs text-muted-foreground pl-5">
                          {t("assignedToDoctorLabel").replace("{name}", room.currentConsultationDoctorName)}
                        </p>
                      )}
                    </div>
                  ) : room.assignedPatientName ? (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-success" data-testid={`text-assigned-patient-${room.id}`}>
                      <User className="w-3.5 h-3.5" />
                      {room.assignedPatientName}
                    </div>
                  ) : room.effectiveStatus === "reservee" && room.nextReservationPatientName ? (
                    <div data-testid={`text-reservation-${room.id}`}>
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-warning">
                        <CalendarClock className="w-3.5 h-3.5" />
                        {t("activeReservationLabel")}
                      </div>
                      <p className="text-xs text-muted-foreground pl-5">
                        {t("reservationPatientLabel").replace("{name}", room.nextReservationPatientName)}
                      </p>
                    </div>
                  ) : (
                    room.effectiveStatus === "disponible" && (
                      <p className="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2">{t("noCurrentOccupation")}</p>
                    )
                  )}
                  <Link href={`/salles/${room.id}`}>
                    <Button variant="link" size="sm" className="h-auto p-0" data-testid={`link-room-${room.id}`}>
                      {t("viewRoomDetails")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PolicyGuard>
  );
}
