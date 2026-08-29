import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { useTranslation } from "../../../lib/i18n";
import type { Consultation, ConsultationStatus } from "@shared/schema";

const CONSULTATION_STATUSES: ConsultationStatus[] = ["planifiee", "en_attente", "en_cours", "terminee", "annulee"];
const PAGE_SIZE = 8;

function statusVariant(status: Consultation["status"]): "default" | "secondary" | "destructive" {
  if (status === "annulee") return "destructive";
  if (status === "terminee") return "secondary";
  return "default";
}

function statusLabelKey(status: string): string {
  return "consultationStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export interface ConsultationsTabProps {
  consultations: Consultation[];
  staffNameById: Record<string, string>;
}

export default function ConsultationsTab({ consultations, staffNameById }: ConsultationsTabProps) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ConsultationStatus | "all">("all");
  const [page, setPage] = useState(1);

  const doctorLabel = (doctorId: string) => staffNameById[doctorId] ?? doctorId;

  const filtered = useMemo(() => {
    const sorted = [...consultations].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    return sorted
      .filter((c) => statusFilter === "all" || c.status === statusFilter)
      .filter((c) =>
        !query.trim() || `${c.reason} ${doctorLabel(c.assignedDoctorId)} ${c.diagnosisPrincipal?.label ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())
      );
  }, [consultations, query, statusFilter, staffNameById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  function updateQuery(value: string) {
    setQuery(value);
    setPage(1);
  }

  function updateStatusFilter(value: ConsultationStatus | "all") {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div className="space-y-4" data-testid="tab-content-consultations">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Input
            value={query}
            onChange={(e) => updateQuery(e.target.value)}
            placeholder={t("searchConsultationsPlaceholder")}
            className="glass-input pl-10"
            data-testid="input-search-consultations"
          />
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={(value) => updateStatusFilter(value as ConsultationStatus | "all")}>
          <SelectTrigger className="w-[180px]" data-testid="select-consultation-status-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("statusAll")}</SelectItem>
            {CONSULTATION_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>{t(statusLabelKey(status))}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>{t("dateColumnLabel")}</TableHead>
              <TableHead>{t("doctorColumnLabel")}</TableHead>
              <TableHead>{t("reasonColumnLabel")}</TableHead>
              <TableHead>{t("diagnosisColumnLabel")}</TableHead>
              <TableHead className="text-right">{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  {t("noConsultationsForPatient")}
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((consultation) => (
                <TableRow
                  key={consultation.id}
                  className="border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setLocation(`/consultations/${consultation.id}`)}
                  data-testid={`row-consultation-${consultation.id}`}>
                  <TableCell>{new Date(consultation.scheduledAt).toLocaleDateString()}</TableCell>
                  <TableCell>{doctorLabel(consultation.assignedDoctorId)}</TableCell>
                  <TableCell>{consultation.reason}</TableCell>
                  <TableCell>{consultation.diagnosisPrincipal?.label ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={statusVariant(consultation.status)}>{t(statusLabelKey(consultation.status))}</Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("resultsCount").replace("{start}", String(pageStart + 1)).replace("{end}", String(Math.min(pageStart + PAGE_SIZE, filtered.length))).replace("{total}", String(filtered.length))}
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
