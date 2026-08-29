import React, { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTranslation } from "../../../lib/i18n";
import type { Prescription, PrescriptionStatus } from "@shared/schema";

function statusVariant(status: PrescriptionStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "annule") return "destructive";
  if (status === "delivre") return "default";
  if (status === "delivre_partiel") return "secondary";
  return "outline";
}

function statusLabelKey(status: string): string {
  return "prescriptionStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function DisabledCardAction({ label }: { label: string }) {
  const { t } = useTranslation();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>
          <Button variant="outline" size="sm" disabled className="pointer-events-none">
            {label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{t("availableInFuturePhase")}</TooltipContent>
    </Tooltip>
  );
}

export interface PrescriptionsTabProps {
  prescriptions: Prescription[];
  staffNameById: Record<string, string>;
}

export default function PrescriptionsTab({ prescriptions, staffNameById }: PrescriptionsTabProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const sorted = [...prescriptions].sort((a, b) => new Date(b.prescribedAt).getTime() - new Date(a.prescribedAt).getTime());
  const filtered = query.trim()
    ? sorted.filter((p) => p.lines.some((l) => l.drugName.toLowerCase().includes(query.trim().toLowerCase())))
    : sorted;

  return (
    <div className="space-y-4" data-testid="tab-content-prescriptions">
      <div className="relative max-w-sm">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPrescriptionsPlaceholder")}
          className="glass-input pl-10"
          data-testid="input-search-prescriptions"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">{t("noPrescriptions")}</Card>
      ) : (
        <div className="space-y-4">
          {filtered.map((prescription) => (
            <Card key={prescription.id} className="p-5 space-y-3" data-testid={`card-prescription-${prescription.id}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">
                    {t("prescriptionDetailTitle")} — {new Date(prescription.prescribedAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("prescribedByLabel")}: {staffNameById[prescription.prescribedByUserId] ?? prescription.prescribedByUserId}</p>
                </div>
                <Badge variant={statusVariant(prescription.status)}>{t(statusLabelKey(prescription.status))}</Badge>
              </div>

              <div className="space-y-1 text-sm">
                {prescription.lines.map((line, index) => (
                  <p key={index}>
                    {line.drugName} {line.dosage} — {line.frequency}
                    {line.durationDays ? ` — ${line.durationDays} ${t("daysUnit")}` : ""}
                  </p>
                ))}
              </div>

              <div className="flex gap-2 pt-1">
                <DisabledCardAction label={t("renewAction")} />
                <DisabledCardAction label={t("printTicket")} />
                <DisabledCardAction label={t("viewDetailsAction")} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
