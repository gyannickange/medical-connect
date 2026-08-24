import React, { useState } from "react";
import {
  FileText,
  Filter,
  Calendar,
  User,
  Search,
  ChevronDown,
  ChevronUp,
  Eye,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useAuditLogs } from "@/hooks/useAuditLogs";
import { usePolicy } from "@/hooks/usePolicy";
import { AuditPolicy } from "@/lib/policies/audit.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { AuditLog } from "@shared/schema";

export default function AuditLogs() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const auditPolicy = usePolicy(AuditPolicy);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  // Filters
  const [filters, setFilters] = useState({
    page: 0,
    limit: 50,
    startDate: "",
    endDate: "",
    action: "",
    status: "",
    entityType: "",
    userId: "",
    search: "",
  });

  const { data: auditLogs = [], isLoading } = useAuditLogs(currentTenant?.id, {
    page: filters.page,
    limit: filters.limit,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    action: filters.action || undefined,
    status: filters.status || undefined,
    entityType: filters.entityType || undefined,
    userId: filters.userId || undefined,
  });

  const toggleRow = (logId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedRows(newExpanded);
  };

  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setShowDetailModal(true);
  };

  const filteredLogs = (auditLogs as AuditLog[]).filter((log) => {
    if (!filters.search) return true;
    const searchLower = filters.search.toLowerCase();
    return (
      log.entityId?.toLowerCase().includes(searchLower) ||
      log.entityType.toLowerCase().includes(searchLower) ||
      log.userId.toLowerCase().includes(searchLower)
    );
  });

  const formatDate = (date: string | Date) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    return status === "SUCCESS" ? (
      <Badge variant="success">{t("auditSuccess")}</Badge>
    ) : (
      <Badge variant="danger">{t("auditFailed")}</Badge>
    );
  };

  const getActionBadge = (action: string) => {
    const colors: { [key: string]: string } = {
      CREATE: "bg-primary/10 text-primary border-primary/20",
      UPDATE:
        "bg-accent-primary/10 text-accent-primary border-accent-primary/20",
      PATCH:
        "bg-accent-primary/10 text-accent-primary border-accent-primary/20",
      DELETE: "bg-destructive/10 text-destructive border-destructive/20",
    };
    const labels: Record<string, string> = {
      CREATE: t("auditCreate"),
      UPDATE: t("auditUpdate"),
      PATCH: t("auditPatch"),
      DELETE: t("auditDelete"),
    };
    return <Badge className={colors[action] || "bg-muted"}>{labels[action] || action}</Badge>;
  };

  return (
    <PolicyGuard policy={AuditPolicy} action="canView">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
              <FileText className="w-6 h-6" />
              {t("auditLogs")}
            </h1>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              {t("filters")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t("startDate")}
                </label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) =>
                    setFilters({ ...filters, startDate: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t("endDate")}
                </label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) =>
                    setFilters({ ...filters, endDate: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t("action")}
                </label>
                <Select
                  value={filters.action}
                  onValueChange={(value) =>
                    setFilters({ ...filters, action: value })
                  }>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("allActions")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      {t("allActions")}
                    </SelectItem>
                    <SelectItem value="CREATE">{t("auditCreate")}</SelectItem>
                    <SelectItem value="UPDATE">{t("auditUpdate")}</SelectItem>
                    <SelectItem value="PATCH">{t("auditPatch")}</SelectItem>
                    <SelectItem value="DELETE">{t("auditDelete")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t("status")}
                </label>
                <Select
                  value={filters.status}
                  onValueChange={(value) =>
                    setFilters({ ...filters, status: value })
                  }>
                  <SelectTrigger>
                    <SelectValue
                      placeholder={t("allStatuses")}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">
                      {t("allStatuses")}
                    </SelectItem>
                    <SelectItem value="SUCCESS">{t("auditSuccess")}</SelectItem>
                    <SelectItem value="FAILED">{t("auditFailed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t("entityType")}
                </label>
                <Input
                  placeholder={t("searchEntityType")}
                  value={filters.entityType}
                  onChange={(e) =>
                    setFilters({ ...filters, entityType: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {t("search")}
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder={
                      t("searchByIdOrType")
                    }
                    value={filters.search}
                    onChange={(e) =>
                      setFilters({ ...filters, search: e.target.value })
                    }
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setFilters({
                      page: 0,
                      limit: 50,
                      startDate: "",
                      endDate: "",
                      action: "",
                      status: "",
                      entityType: "",
                      userId: "",
                      search: "",
                    })
                  }>
                  {t("clear")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">
                {t("loading")}
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {t("noAuditLogs")}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>{t("timestamp")}</TableHead>
                    <TableHead>{t("user")}</TableHead>
                    <TableHead>{t("action")}</TableHead>
                    <TableHead>{t("entityType")}</TableHead>
                    <TableHead>{t("entityId")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRow(log.id)}>
                            {expandedRows.has(log.id) ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>{formatDate(log.createdAt)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.userId}
                        </TableCell>
                        <TableCell>{getActionBadge(log.action)}</TableCell>
                        <TableCell>{log.entityType}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {log.entityId || "-"}
                        </TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewDetails(log)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(log.id) && (
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30">
                            <div className="p-4 space-y-2">
                              {log.errorMessage && (
                                <div>
                                  <strong className="text-destructive">
                                    {t("error")}:
                                  </strong>{" "}
                                  <span>{log.errorMessage}</span>
                                </div>
                              )}
                              {log.metadata != null && (
                                <div className="text-xs">
                                  <strong>{t("metadata")}:</strong>
                                  <pre className="mt-1 p-2 bg-background rounded overflow-auto">
                                    {String(
                                      JSON.stringify(
                                        log.metadata as any,
                                        null,
                                        2
                                      ) || ""
                                    )}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Detail Modal */}
        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>{t("auditLogDetails")}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDetailModal(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </DialogTitle>
            </DialogHeader>
            {selectedLog && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">ID</label>
                    <p className="font-mono text-xs">{selectedLog.id}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("timestamp")}
                    </label>
                    <p>{formatDate(selectedLog.createdAt)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("user")}
                    </label>
                    <p className="font-mono text-xs">{selectedLog.userId}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("action")}
                    </label>
                    <p>{getActionBadge(selectedLog.action)}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("entityType")}
                    </label>
                    <p>{selectedLog.entityType}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("entityId")}
                    </label>
                    <p className="font-mono text-xs">
                      {selectedLog.entityId || "-"}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">
                      {t("status")}
                    </label>
                    <p>{getStatusBadge(selectedLog.status)}</p>
                  </div>
                  {selectedLog.errorMessage && (
                    <div>
                      <label className="text-sm font-medium text-destructive">
                        {t("errorMessage")}
                      </label>
                      <p className="text-destructive">
                        {selectedLog.errorMessage}
                      </p>
                    </div>
                  )}
                </div>

                {selectedLog.requestBody != null && (
                  <div>
                    <label className="text-sm font-medium">
                      {t("requestBody")}
                    </label>
                    <pre className="mt-1 p-3 bg-muted rounded overflow-auto text-xs">
                      {String(
                        JSON.stringify(
                          selectedLog.requestBody as any,
                          null,
                          2
                        ) || ""
                      )}
                    </pre>
                  </div>
                )}

                {Boolean(selectedLog.responseBody) && (
                  <div>
                    <label className="text-sm font-medium">
                      {t("responseBody")}
                    </label>
                    <pre className="mt-1 p-3 bg-muted rounded overflow-auto text-xs">
                      {String(
                        JSON.stringify(
                          selectedLog.responseBody as any,
                          null,
                          2
                        ) || ""
                      )}
                    </pre>
                  </div>
                )}

                {selectedLog.changes != null && (
                  <div>
                    <label className="text-sm font-medium">
                      {t("changes")}
                    </label>
                    <pre className="mt-1 p-3 bg-muted rounded overflow-auto text-xs">
                      {String(
                        JSON.stringify(selectedLog.changes as any, null, 2) ||
                          ""
                      )}
                    </pre>
                  </div>
                )}

                {selectedLog.metadata != null && (
                  <div>
                    <label className="text-sm font-medium">
                      {t("metadata")}
                    </label>
                    <pre className="mt-1 p-3 bg-muted rounded overflow-auto text-xs">
                      {String(
                        JSON.stringify(selectedLog.metadata as any, null, 2) ||
                          ""
                      )}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </PolicyGuard>
  );
}
