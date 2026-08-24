import { useState } from "react";
import { Wifi, WifiOff, Users, Zap, Settings, Circle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLANDiscovery } from "../hooks/useLANDiscovery";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

export function LANDiscoveryCard() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const {
    isEnabled,
    isDiscovering,
    connectionStatus,
    discoveredPeers,
    connectedPeers,
    deviceId,
    startDiscovery,
    stopDiscovery,
    connectToPeer,
  } = useLANDiscovery();

  const [showDetails, setShowDetails] = useState(false);

  const handleToggleDiscovery = () => {
    if (isEnabled) {
      stopDiscovery();
      toast({
        title: t("lanDiscoveryStopped"),
        description: t("noLongerDiscoveringCashRegisters"),
      });
    } else {
      startDiscovery();
      toast({
        title: t("lanDiscoveryStarted"),
        description: t("searchingForCashRegisters"),
      });
    }
  };

  const handleConnectToPeer = async (peerId: string) => {
    try {
      await connectToPeer(peerId);
      toast({
        title: t("connectedToPeer"),
        description: `${t("successfullyConnectedTo")} ${formatDeviceId(
          peerId
        )}`,
      });
    } catch (error: any) {
      const errorMessage =
        error.message || `${t("failedToConnectTo")} ${peerId}`;
      toast({
        title: t("connectionFailed"),
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const getConnectionStatus = (peerId: string) => {
    if (connectedPeers.includes(peerId)) return "connected";
    return "disconnected";
  };

  const formatDeviceId = (id: string) => {
    return id.replace("device_", "").slice(0, 8).toUpperCase();
  };

  return (
    <Card className="" data-testid="lan-discovery-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {connectionStatus === "online" ? (
              <Wifi className="h-5 w-5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
            ) : (
              <WifiOff className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            )}
            <CardTitle className="text-base text-foreground">
              {t("lanDiscovery")}
            </CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            <Label
              htmlFor="lan-discovery-toggle"
              className="text-sm text-muted-foreground">
              {isEnabled ? t("enabled") : t("disabled")}
            </Label>
            <Switch
              id="lan-discovery-toggle"
              checked={isEnabled}
              onCheckedChange={handleToggleDiscovery}
              data-testid="toggle-lan-discovery"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Device Info */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center space-x-3">
            <div className="h-3 w-3 bg-emerald-500 dark:bg-emerald-400 rounded-full animate-pulse"></div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("thisDevice")}
              </p>
              <p
                className="text-xs text-muted-foreground"
                data-testid="device-id">
                ID: {formatDeviceId(deviceId)}
              </p>
            </div>
          </div>
          <Badge
            variant={connectionStatus === "online" ? "default" : "secondary"}
            role="status"
            data-state={connectionStatus}
            data-testid="discovery-status">
            {connectionStatus === "disabled"
              ? t("disabled")
              : connectionStatus === "connecting"
              ? t("connecting")
              : connectionStatus === "online"
              ? t("online")
              : t("lanConnectionError")}
          </Badge>
        </div>

        {/* Peer Status Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center space-x-2 p-2 rounded bg-muted/30">
            <Users className="h-4 w-4 text-green-500 dark:text-green-400" />
            <div>
              <p className="text-xs text-muted-foreground">{t("discovered")}</p>
              <p
                className="text-sm font-semibold text-foreground"
                data-testid="discovered-count">
                {discoveredPeers.length}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 p-2 rounded bg-muted/30">
            <Zap className="h-4 w-4 text-emerald-500 dark:text-emerald-400" />
            <div>
              <p className="text-xs text-muted-foreground">{t("connected")}</p>
              <p
                className="text-sm font-semibold text-foreground"
                data-testid="connected-count">
                {connectedPeers.length}
              </p>
            </div>
          </div>
        </div>

        {/* Peers List */}
        {isEnabled && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-foreground">
                {t("cashRegisters")} ({discoveredPeers.length})
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                data-testid="toggle-details">
                <Settings className="h-3 w-3 mr-1" />
                {showDetails ? t("hideDetails") : t("showDetails")}
              </Button>
            </div>

            {discoveredPeers.length === 0 && isDiscovering ? (
              <div
                className="text-center py-4"
                data-testid="discovering-message">
                <Wifi className="h-8 w-8 text-muted-foreground mx-auto mb-2 animate-pulse" />
                <p className="text-sm text-muted-foreground">
                  {t("discoveringCashRegisters")}
                </p>
              </div>
            ) : discoveredPeers.length === 0 ? (
              <div className="text-center py-4" data-testid="no-peers-message">
                <WifiOff className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  {t("noCashRegistersFound")}
                </p>
                <p className="text-xs text-muted-foreground/70">
                  {t("enableDiscoveryToSearch")}
                </p>
              </div>
            ) : (
              <div className="space-y-2" data-testid="peers-list">
                {discoveredPeers.map((peer) => {
                  const status = getConnectionStatus(peer.peerId);
                  const isConnected = status === "connected";

                  return (
                    <div
                      key={peer.peerId}
                      className="flex items-center justify-between p-3 bg-muted/50 dark:bg-muted/30 rounded-lg border border-border hover:border-border/80 transition-colors"
                      data-testid={`peer-${peer.peerId}`}>
                      <div className="flex items-center space-x-3">
                        <Circle
                          className={`h-3 w-3 ${
                            isConnected
                              ? "text-emerald-500 fill-emerald-500 dark:text-emerald-400 dark:fill-emerald-400"
                              : "text-muted-foreground"
                          }`}
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {t("cashRegister")} {formatDeviceId(peer.peerId)}
                          </p>
                          {showDetails && (
                            <div className="text-xs text-muted-foreground space-y-1">
                              <p>ID: {peer.peerId}</p>
                              <p>
                                {t("lastSeen")}:{" "}
                                {new Date(peer.lastSeen).toLocaleTimeString()}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Badge
                          variant={isConnected ? "default" : "secondary"}
                          className={
                            isConnected
                              ? "bg-emerald-600 dark:bg-emerald-600"
                              : ""
                          }
                          data-testid={`peer-status-${peer.peerId}`}>
                          {isConnected ? t("connected") : t("available")}
                        </Badge>
                        {!isConnected && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleConnectToPeer(peer.peerId)}
                            className="h-7 px-2 text-xs"
                            data-testid={`connect-${peer.peerId}`}>
                            {t("connectToPeer")}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!isEnabled && (
          <div className="text-center py-6" data-testid="enable-message">
            <WifiOff className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm text-foreground mb-2">
              {t("lanDiscoveryIsDisabled")}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("enableToDiscoverAndConnect")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
