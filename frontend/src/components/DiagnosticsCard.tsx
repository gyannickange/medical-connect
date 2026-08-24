import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bug, Download, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  buildDiagnosticExport,
  clearErrorLogs,
  getErrorLogs,
  type ErrorLogEntry,
} from "@/lib/errorLogStore";

function downloadDiagnostic(): void {
  const diagnostic = buildDiagnosticExport();
  const blob = new Blob([JSON.stringify(diagnostic, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `business-connect-diagnostic-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DiagnosticsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [logs, setLogs] = useState<ErrorLogEntry[]>(() => getErrorLogs());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const refreshLogs = () => {
    setLogs(getErrorLogs());
  };

  const handleClearLogs = () => {
    clearErrorLogs();
    setLogs([]);
    setExpandedLogId(null);
    setShowClearConfirm(false);
    toast({ title: t("diagnosticsLogsCleared"), variant: "default" });
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            <CardTitle>{t("diagnosticsCardTitle")}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-refresh-diagnostics"
            onClick={refreshLogs}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("diagnosticsRefresh")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("diagnosticsCardDescription")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {logs.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="diagnostics-empty-state"
          >
            {t("diagnosticsNoRecentErrors")}
          </p>
        ) : (
          <ScrollArea className="h-64 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("diagnosticsColumnDate")}</TableHead>
                  <TableHead>{t("diagnosticsColumnModule")}</TableHead>
                  <TableHead>{t("diagnosticsColumnMessage")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 20).map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <TableRow
                        className="cursor-pointer"
                        data-testid={`diagnostics-row-${log.id}`}
                        onClick={() =>
                          setExpandedLogId(isExpanded ? null : log.id)
                        }
                      >
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">{log.module}</TableCell>
                        <TableCell
                          className="max-w-xs truncate text-xs"
                          title={log.message}
                        >
                          {log.message}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow data-testid={`diagnostics-row-detail-${log.id}`}>
                          <TableCell colSpan={3} className="space-y-2 bg-muted/30 text-xs">
                            <p className="whitespace-pre-wrap break-words">
                              {log.message}
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                              <span>
                                {t("diagnosticsDetailDevice")}: {log.deviceId}
                              </span>
                              <span>
                                {t("diagnosticsDetailVersion")}: {log.appVersion}
                              </span>
                              <span>
                                {t("diagnosticsDetailOnline")}:{" "}
                                {log.online
                                  ? t("diagnosticsOnline")
                                  : t("diagnosticsOffline")}
                              </span>
                              {log.tenantId && (
                                <span>
                                  {t("diagnosticsDetailTenant")}: {log.tenantId}
                                </span>
                              )}
                              {log.userId && (
                                <span>
                                  {t("diagnosticsDetailUser")}: {log.userId}
                                </span>
                              )}
                            </div>
                            {log.stack && (
                              <pre className="whitespace-pre-wrap break-words rounded bg-background p-2 text-[11px]">
                                {log.stack}
                              </pre>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            data-testid="button-download-diagnostic"
            onClick={downloadDiagnostic}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("diagnosticsDownload")}
          </Button>
          {!showClearConfirm && (
            <Button
              variant="destructive"
              className="flex-1"
              data-testid="button-clear-diagnostics"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("diagnosticsClearLogs")}
            </Button>
          )}
        </div>

        {showClearConfirm && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("areYouSure")}</AlertTitle>
              <AlertDescription>
                {t("diagnosticsClearLogsWarning")}
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowClearConfirm(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                data-testid="button-confirm-clear-diagnostics"
                onClick={handleClearLogs}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("diagnosticsClearLogs")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
