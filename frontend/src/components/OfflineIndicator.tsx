import React from "react";
import { useOfflineSync } from "../hooks/useOfflineSync";
import {
  WifiOff,
  Wifi,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Users,
  HardDrive,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n";
import { useNativeLANAgent } from "@/hooks/useNativeLANAgent";
import { useConnectivityStatus } from "@/hooks/useConnectivityStatus";

export const OfflineIndicator: React.FC = () => {
  const { t } = useTranslation();
  const {
    syncStatus,
    pendingChanges,
    conflictChanges,
    forceSync,
  } = useOfflineSync();
  const { available, status: lanStatus, peers, error: lanError } =
    useNativeLANAgent();
  const connectivity = useConnectivityStatus(
    available,
    lanStatus.networkAvailable
  );
  const replayableChanges = Math.max(0, pendingChanges - conflictChanges);
  const connectionPresentation = {
    internet: {
      label: t("internetAvailable"),
      className: "text-emerald-600 dark:text-emerald-400",
      Icon: Wifi,
    },
    lan: {
      label: t("localNetworkOnly"),
      className: "text-amber-600 dark:text-amber-400",
      Icon: Wifi,
    },
    offline: {
      label: t("noNetwork"),
      className: "text-red-600 dark:text-red-400",
      Icon: WifiOff,
    },
    local: {
      label: t("localInstallMode"),
      className: "text-slate-600 dark:text-slate-400",
      Icon: HardDrive,
    },
  }[connectivity.state];
  const ConnectionIcon = connectionPresentation.Icon;
  const connectionDetails = [
    connectionPresentation.label,
    available
      ? `${t("nativeLanAgent")}: ${lanStatus.running ? t("enabled") : t("disabled")}`
      : null,
    available ? `${t("lanPeers")}: ${peers.length}` : null,
    lanStatus.deviceId ? `ID: ${lanStatus.deviceId}` : null,
    lanError,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex items-center gap-2"
      role="status"
      aria-live="polite"
      aria-label={connectionDetails}
      title={connectionDetails}
      data-testid="connection-status"
      data-state={connectivity.state}>
      <div
        className={`flex min-h-7 items-center gap-1.5 ${connectionPresentation.className}`}>
        <ConnectionIcon className="h-4 w-4" aria-hidden="true" />
        <span className="hidden text-xs font-medium sm:inline">
          {connectionPresentation.label}
        </span>
        {connectivity.isCheckingInternet && (
          <RefreshCw
            className="h-3 w-3 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
      </div>

      {available && (
        <Badge
          variant="outline"
          className="gap-1 px-1.5 py-0.5 text-xs"
          aria-label={`${t("lanPeers")}: ${peers.length}`}>
          <Users className="h-3 w-3" aria-hidden="true" />
          {peers.length}
        </Badge>
      )}

      {/* Pending Changes Badge */}
      {replayableChanges > 0 && (
        <Badge
          variant="secondary"
          className={cn(
            "gap-1 px-2 py-0.5",
            syncStatus === "syncing" && "animate-pulse"
          )}>
          {syncStatus === "syncing" ? (
            <>
              <RefreshCw className="h-3 w-3 animate-spin motion-reduce:animate-none" />
              <span className="text-xs">{replayableChanges}</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3" />
              <span className="text-xs">{replayableChanges}</span>
            </>
          )}
        </Badge>
      )}

      {conflictChanges > 0 && (
        <Badge
          variant="destructive"
          className="gap-1 px-2 py-0.5"
          title={t("conflictWarning")}>
          <AlertCircle className="h-3 w-3" />
          <span className="text-xs">{conflictChanges}</span>
        </Badge>
      )}

      {/* Sync Status Icon */}
      {syncStatus === "syncing" && (
        <Button size="sm" variant="ghost" className="h-7 px-2" disabled>
          <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" />
        </Button>
      )}

      {/* Manual Sync Button */}
      {connectivity.state === "internet" &&
        replayableChanges > 0 &&
        syncStatus === "idle" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={forceSync}
            aria-label={t("sync")}>
            <RefreshCw className="h-3 w-3 mr-1" />
            {t("sync")}
          </Button>
        )}

      {/* Sync Success Indicator */}
      {connectivity.state !== "offline" &&
        syncStatus === "idle" &&
        pendingChanges === 0 && (
          <div
            className="flex items-center text-emerald-600 dark:text-emerald-400"
            title={t("allChangesSynchronized")}>
            <CheckCircle className="h-4 w-4" aria-hidden="true" />
          </div>
        )}

      {/* Sync Error Indicator */}
      {syncStatus === "error" && (
        <div
          className="flex items-center text-red-600 dark:text-red-400"
          title={t("connectionFailed")}>
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
    </div>
  );
};
