import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Users,
  Database,
  CheckCircle,
  AlertCircle,
  Clock,
  Monitor,
} from "lucide-react";
import { usePeerSync, PeerSyncInfo } from "@/hooks/usePeerSync";
import { useLANDiscovery } from "@/hooks/useLANDiscovery";
import { useTranslation } from "@/lib/i18n";

interface PeerSyncCardProps {
  className?: string;
}

export function PeerSyncCard({ className }: PeerSyncCardProps) {
  const { t } = useTranslation();
  // Get discovered peers from LAN Discovery
  const {
    isDiscovering,
    discoveredPeers,
    connectedPeers,
    connectToPeer,
    startDiscovery,
    stopDiscovery,
    deviceId,
  } = useLANDiscovery();

  // Pass all required parameters to peer sync hook
  const {
    isEnabled,
    peerSyncStatus,
    enablePeerSync,
    disablePeerSync,
    forceSyncWithPeer,
    getSyncStats,
  } = usePeerSync(
    discoveredPeers,
    connectedPeers,
    isDiscovering,
    startDiscovery,
    connectToPeer,
    stopDiscovery,
    deviceId
  );

  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);

  const stats = getSyncStats();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "synced":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "syncing":
      case "connecting":
        return <RefreshCw className="h-4 w-4 text-amber-500 animate-spin" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "synced":
        return "bg-green-500/10 text-green-500";
      case "syncing":
      case "connecting":
        return "bg-amber-500/10 text-amber-500";
      case "error":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-gray-500/10 text-gray-500";
    }
  };

  const handleConnect = async (peerId: string) => {
    setIsConnecting(peerId);
    try {
      await connectToPeer(peerId);
    } catch (error: any) {
      console.error("Failed to connect to peer:", error);
      // Error is logged, status will be reflected in UI
    } finally {
      setIsConnecting(null);
    }
  };

  const handleSync = async (peerId: string) => {
    setIsSyncing(peerId);
    try {
      await forceSyncWithPeer(peerId);
    } catch (error: any) {
      console.error("Failed to sync with peer:", error);
      const errorMessage = error.message || "Sync failed";
      // Update peer status to show error
      // The error is already handled in usePeerSync
    } finally {
      setIsSyncing(null);
    }
  };

  return (
    <Card className={`${className} h-fit`} data-testid="card-peer-sync">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              {isDiscovering ? (
                <Wifi className="h-5 w-5 text-green-500" />
              ) : (
                <WifiOff className="h-5 w-5 text-gray-400" />
              )}
              <CardTitle className="text-base">{t("lanSync")}</CardTitle>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={isEnabled ? disablePeerSync : enablePeerSync}
              data-testid="switch-peer-sync"
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Monitor className="h-4 w-4" />
              <span
                className="text-xl font-bold"
                data-testid="text-discovered-count">
                {stats.totalPeers}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("discovered")}</p>
          </div>
          <div className="text-center p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Database className="h-4 w-4" />
              <span
                className="text-xl font-bold"
                data-testid="text-synced-count">
                {stats.syncedPeers}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{t("synced")}</p>
          </div>
        </div>

        {isEnabled && (
          <>
            <Separator />

            {/* Connection Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">{t("connectionStatus")}</h4>
                <Badge variant="outline" className="text-xs">
                  {isDiscovering ? t("discovering") : t("offline")}
                </Badge>
              </div>

              {stats.connectedPeers > 0 && (
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>{t("connectedDevices")}</span>
                    <span>
                      {stats.connectedPeers} {t("online")}
                    </span>
                  </div>
                  <Progress
                    value={
                      (stats.connectedPeers / Math.max(stats.totalPeers, 1)) *
                      100
                    }
                    className="h-2"
                  />
                </div>
              )}
            </div>

            {/* Discovered Devices */}
            {discoveredPeers.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">
                    {t("discoveredDevices")}
                  </h4>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {discoveredPeers.map((peer) => {
                      const isConnected = connectedPeers.includes(peer.peerId);
                      const syncInfo = peerSyncStatus.get(peer.peerId);
                      const isCurrentlyConnecting =
                        isConnecting === peer.peerId;
                      const isCurrentlySyncing = isSyncing === peer.peerId;

                      return (
                        <div
                          key={peer.peerId}
                          className="flex items-center justify-between p-3 bg-muted/20 rounded-lg"
                          data-testid={`row-peer-${peer.peerId}`}>
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(
                                syncInfo?.status || "disconnected"
                              )}
                              <div>
                                <p
                                  className="text-sm font-medium"
                                  data-testid={`text-peer-id-${peer.peerId}`}>
                                  {peer.peerId.slice(-8)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {peer.lastSeen.toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {syncInfo && (
                              <Badge
                                variant="outline"
                                className={`text-xs ${getStatusColor(
                                  syncInfo.status
                                )}`}
                                data-testid={`badge-status-${peer.peerId}`}>
                                {syncInfo.status}
                              </Badge>
                            )}

                            {!isConnected ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleConnect(peer.peerId)}
                                disabled={isCurrentlyConnecting}
                                data-testid={`button-connect-${peer.peerId}`}>
                                {isCurrentlyConnecting ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  t("connect")
                                )}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSync(peer.peerId)}
                                disabled={
                                  isCurrentlySyncing ||
                                  syncInfo?.status === "syncing"
                                }
                                data-testid={`button-sync-${peer.peerId}`}>
                                {isCurrentlySyncing ||
                                syncInfo?.status === "syncing" ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  t("sync")
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* No devices found state */}
            {isDiscovering && discoveredPeers.length === 0 && (
              <div className="text-center py-6 text-muted-foreground">
                <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t("searchingForCashRegisters")}</p>
                <p className="text-xs">{t("makeSureOtherDevicesEnabled")}</p>
              </div>
            )}
          </>
        )}

        {/* Disabled state */}
        {!isEnabled && (
          <div className="text-center py-6 text-muted-foreground">
            <WifiOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">{t("lanSyncIsDisabled")}</p>
            <p className="text-xs">{t("enableToDiscoverAndSync")}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
