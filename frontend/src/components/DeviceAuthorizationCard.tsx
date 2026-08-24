import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { PolicyGuard } from "@/components/PolicyGuard";
import { DeviceAuthorizationPolicy } from "@/lib/policies/deviceAuthorization.policy";

interface DeviceAuthorization {
  deviceId: string;
  status: "pending" | "approved" | "revoked";
  requestedAt: string;
  decidedAt: string | null;
}

async function fetchDevices(): Promise<DeviceAuthorization[]> {
  const response = await fetch("/api/device-authorization", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to load authorized devices");
  return response.json();
}

async function decideDevice(deviceId: string, action: "approve" | "revoke"): Promise<void> {
  const response = await fetch(`/api/device-authorization/${deviceId}/${action}`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Failed to ${action} device`);
}

function statusVariant(status: DeviceAuthorization["status"]) {
  if (status === "approved") return "default" as const;
  if (status === "revoked") return "destructive" as const;
  return "secondary" as const;
}

export const DeviceAuthorizationCard: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: devices = [] } = useQuery({
    queryKey: ["/api/device-authorization"],
    queryFn: fetchDevices,
  });

  const mutation = useMutation({
    mutationFn: ({ deviceId, action }: { deviceId: string; action: "approve" | "revoke" }) =>
      decideDevice(deviceId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-authorization"] });
    },
    onError: () => {
      toast({ title: t("validationError"), variant: "destructive" });
    },
  });

  return (
    <PolicyGuard policy={DeviceAuthorizationPolicy} action="canList">
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{t("authorizedDevices")}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">{t("authorizedDevicesDescription")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {devices.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noPendingOrApprovedDevices")}</p>
          )}
          {devices.map((device) => (
            <div
              key={device.deviceId}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              data-testid={`device-row-${device.deviceId}`}
            >
              <div className="space-y-1">
                <p className="font-medium">{device.deviceId}</p>
                <Badge variant={statusVariant(device.status)}>
                  {t(
                    device.status === "approved"
                      ? "deviceStatusApproved"
                      : device.status === "revoked"
                        ? "deviceStatusRevoked"
                        : "deviceStatusPending"
                  )}
                </Badge>
              </div>
              <PolicyGuard policy={DeviceAuthorizationPolicy} action="canApprove">
                <div className="flex gap-2">
                  {device.status === "pending" && (
                    <Button
                      size="sm"
                      data-testid={`button-approve-${device.deviceId}`}
                      onClick={() => mutation.mutate({ deviceId: device.deviceId, action: "approve" })}
                    >
                      {t("approveDevice")}
                    </Button>
                  )}
                  {device.status !== "revoked" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      data-testid={`button-revoke-${device.deviceId}`}
                      onClick={() => mutation.mutate({ deviceId: device.deviceId, action: "revoke" })}
                    >
                      {t("revokeDevice")}
                    </Button>
                  )}
                </div>
              </PolicyGuard>
            </div>
          ))}
        </CardContent>
      </Card>
    </PolicyGuard>
  );
};
