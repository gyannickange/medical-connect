import React, { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "../../../lib/i18n";
import type { LabOrder, LabOrderStatus } from "@shared/schema";

const LAB_ORDER_STATUSES: LabOrderStatus[] = ["demande", "en_cours", "a_valider", "termine", "probleme_signale", "annule"];
const PAGE_SIZE = 10;

function statusVariant(status: LabOrderStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "annule" || status === "probleme_signale") return "destructive";
  if (status === "termine") return "default";
  return "outline";
}

function statusLabelKey(status: string): string {
  return "labOrderStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

interface ResultRow {
  labOrderId: string;
  date: Date;
  examName: string;
  resultText: string | null;
  status: LabOrderStatus;
}

export interface ResultatsLaboTabProps {
  labOrders: LabOrder[];
}

export default function ResultatsLaboTab({ labOrders }: ResultatsLaboTabProps) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | "all">("all");
  const [page, setPage] = useState(1);

  const rows: ResultRow[] = useMemo(() => {
    return labOrders
      .flatMap((order) =>
        order.examLines.map((line) => ({
          labOrderId: order.id,
          date: new Date(order.updatedAt),
          examName: line.examName,
          resultText: line.resultText,
          status: order.status,
        }))
      )
      .filter((row) => statusFilter === "all" || row.status === statusFilter)
      .filter((row) => {
        if (appliedStart && row.date < new Date(appliedStart)) return false;
        if (appliedEnd && row.date > new Date(`${appliedEnd}T23:59:59`)) return false;
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [labOrders, statusFilter, appliedStart, appliedEnd]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  function applyFilters() {
    setAppliedStart(startDate);
    setAppliedEnd(endDate);
    setPage(1);
  }

  function resetFilters() {
    setStartDate("");
    setEndDate("");
    setAppliedStart("");
    setAppliedEnd("");
    setPage(1);
  }

  return (
    <div className="space-y-4" data-testid="tab-content-resultats-labo">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">{t("startDateLabel")}</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-labo-start-date" />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">{t("endDateLabel")}</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-labo-end-date" />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">{t("statusColumnLabel")}</label>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value as LabOrderStatus | "all"); setPage(1); }}>
            <SelectTrigger className="w-[160px]" data-testid="select-labo-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("statusAll")}</SelectItem>
              {LAB_ORDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>{t(statusLabelKey(status))}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={applyFilters} data-testid="button-apply-labo-filter">
          {t("applyFilterAction")}
        </Button>
        <Button variant="ghost" onClick={resetFilters} data-testid="button-reset-labo-filter">
          {t("resetFilterAction")}
        </Button>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>{t("dateColumnLabel")}</TableHead>
              <TableHead>{t("examColumnLabel")}</TableHead>
              <TableHead>{t("resultColumnLabel")}</TableHead>
              <TableHead className="text-right">{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  {t("noLabOrders")}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row, index) => (
                <TableRow key={`${row.labOrderId}-${index}`} className="border-border" data-testid={`row-lab-result-${row.labOrderId}-${index}`}>
                  <TableCell>{row.date.toLocaleDateString()}</TableCell>
                  <TableCell>{row.examName}</TableCell>
                  <TableCell>{row.resultText ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={statusVariant(row.status)}>{t(statusLabelKey(row.status))}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {rows.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("resultsCount").replace("{start}", String(pageStart + 1)).replace("{end}", String(Math.min(pageStart + PAGE_SIZE, rows.length))).replace("{total}", String(rows.length))}
          </p>
          {totalPages > 1 && (
            <Pagination className="mx-0 w-auto justify-end">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    onClick={() => currentPage > 1 && setPage(currentPage - 1)}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink isActive className="cursor-default">{currentPage}</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    onClick={() => currentPage < totalPages && setPage(currentPage + 1)}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}
        </div>
      )}
    </div>
  );
}
