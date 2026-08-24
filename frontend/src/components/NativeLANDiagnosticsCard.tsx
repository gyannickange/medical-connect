import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Monitor,
  RefreshCw,
  Router,
  Users,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useNativeLANAgent } from "@/hooks/useNativeLANAgent";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { getDeviceId } from "@/lib/deviceIdentity";
import { useTranslation } from "@/lib/i18n";

export function NativeLANDiagnosticsCard() {
  const { t } = useTranslation();
  const {
    available,
    status,
    peers,
    error,
    enrollAndStart,
    refresh,
  } = useNativeLANAgent();
  const { pendingChanges, conflictChanges } = useOfflineSync();
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const replayableChanges = Math.max(0, pendingChanges - conflictChanges);
  const hasError = Boolean(error || retryError);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryError(null);

    try {
      await enrollAndStart(getDeviceId());
      await refresh();
    } catch (reason) {
      setRetryError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <Card className="glass-card" data-testid="native-lan-diagnostics">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Router className="h-5 w-5 text-primary" aria-hidden="true" />
            {t("lanDiagnostics")}
          </CardTitle>
          <Badge
            variant={hasError ? "destructive" : status.running ? "default" : "secondary"}
            className="w-fit gap-1.5"
            role="status">
            {hasError ? (
              <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
            ) : status.running ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {hasError
              ? t("lanAgentError")
              : status.running
                ? t("active")
                : available
                  ? t("inactive")
                  : t("unavailable")}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {available
            ? t("lanDiagnosticsAutomaticDescription")
            : t("lanAgentDesktopOnlyDescription")}
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{peers.length}</p>
              <p className="text-xs text-muted-foreground">
                {t("nearbyRegisters")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <RefreshCw className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">{replayableChanges}</p>
              <p className="text-xs text-muted-foreground">
                {t("pendingChanges")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
            <AlertCircle
              className={
                conflictChanges > 0
                  ? "h-5 w-5 text-destructive"
                  : "h-5 w-5 text-muted-foreground"
              }
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-medium">{conflictChanges}</p>
              <p className="text-xs text-muted-foreground">{t("conflicts")}</p>
            </div>
          </div>
        </div>

        {(error || retryError) && (
          <div
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            role="alert">
            {retryError || error}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 justify-start px-3 sm:min-h-10"
            onClick={() => setShowDetails((current) => !current)}
            aria-expanded={showDetails}
            aria-controls="lan-diagnostics-details">
            <ChevronDown
              className={`mr-2 h-4 w-4 transition-transform motion-reduce:transition-none ${
                showDetails ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
            {showDetails ? t("hideDetails") : t("showDetails")}
          </Button>

          {available && (!status.running || hasError) && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 sm:min-h-10"
              onClick={handleRetry}
              disabled={isRetrying}>
              <RefreshCw
                className={`mr-2 h-4 w-4 ${
                  isRetrying ? "animate-spin motion-reduce:animate-none" : ""
                }`}
                aria-hidden="true"
              />
              {isRetrying ? t("retrying") : t("restartLanAgent")}
            </Button>
          )}
        </div>

        {showDetails && (
          <div
            id="lan-diagnostics-details"
            className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <Monitor className="mt-0.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{t("deviceId")}</p>
                <p className="break-all text-sm font-medium">
                  {status.deviceId || getDeviceId()}
                </p>
              </div>
            </div>

            {peers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noNearbyRegisters")}
              </p>
            ) : (
              <ul className="space-y-2" aria-label={t("nearbyRegisters")}>
                {peers.map((peer) => (
                  <li
                    key={peer.deviceId}
                    className="rounded-md border border-border bg-background/60 p-3 text-sm">
                    <p className="font-medium">
                      {peer.serviceName || peer.deviceId}
                    </p>
                    <p className="mt-1 break-all text-xs text-muted-foreground">
                      {peer.addresses.join(", ")}:{peer.port} · {t("protocol")} {peer.protocolVersion}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
