import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { usePolicy } from "@/hooks/usePolicy";
import { RoomsPolicy } from "@/lib/policies/rooms.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Room, RoomEffectiveStatus } from "@shared/schema";

type RoomWithStatus = Room & { effectiveStatus: RoomEffectiveStatus };

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
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsAvailable")}</p>
              <p className="text-2xl font-bold text-foreground">{counts.disponible}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsOccupied")}</p>
              <p className="text-2xl font-bold text-foreground">{counts.occupee}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsReserved")}</p>
              <p className="text-2xl font-bold text-foreground">{counts.reservee}</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
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
