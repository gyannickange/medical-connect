import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../../lib/i18n";
import { buildPatientTimeline, type PatientTimelineEventType } from "@/lib/patientTimeline";
import type { Consultation, LabOrder, Prescription } from "@shared/schema";

const LABEL_KEY_BY_TYPE: Record<PatientTimelineEventType, string> = {
  consultation_created: "patientTimelineConsultationCreated",
  consultation_closed: "patientTimelineConsultationClosed",
  lab_result: "patientTimelineLabResult",
  prescription_delivered: "patientTimelinePrescriptionDelivered",
};

const BADGE_LABEL_KEY_BY_TYPE: Record<PatientTimelineEventType, string> = {
  consultation_created: "timelineBadgeConsultation",
  consultation_closed: "timelineBadgeConsultation",
  lab_result: "timelineBadgeLabResult",
  prescription_delivered: "timelineBadgePrescription",
};

const DOT_CLASS_BY_TYPE: Record<PatientTimelineEventType, string> = {
  consultation_created: "bg-blue-500",
  consultation_closed: "bg-blue-500",
  lab_result: "bg-purple-500",
  prescription_delivered: "bg-emerald-500",
};

export interface HistoriqueTabProps {
  consultations: Consultation[];
  labOrders: LabOrder[];
  prescriptions: Prescription[];
}

export default function HistoriqueTab({ consultations, labOrders, prescriptions }: HistoriqueTabProps) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStart, setAppliedStart] = useState("");
  const [appliedEnd, setAppliedEnd] = useState("");

  const entries = buildPatientTimeline(consultations, labOrders, prescriptions).filter((entry) => {
    if (appliedStart && entry.occurredAt < new Date(appliedStart)) return false;
    if (appliedEnd && entry.occurredAt > new Date(`${appliedEnd}T23:59:59`)) return false;
    return true;
  });

  return (
    <div className="space-y-4" data-testid="tab-content-historique">
      <Card className="p-4 flex flex-wrap items-end gap-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">{t("startDateLabel")}</label>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-history-start-date" />
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">{t("endDateLabel")}</label>
          <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-history-end-date" />
        </div>
        <Button variant="outline" onClick={() => { setAppliedStart(startDate); setAppliedEnd(endDate); }} data-testid="button-apply-history-filter">
          {t("applyFilterAction")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => { setStartDate(""); setEndDate(""); setAppliedStart(""); setAppliedEnd(""); }}
          data-testid="button-reset-history-filter">
          {t("resetFilterAction")}
        </Button>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-foreground">{t("historiqueTab")}</h3>
          <span className="text-sm text-muted-foreground">{t("eventsCount").replace("{count}", String(entries.length))}</span>
        </div>

        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noHistoryEvents")}</p>
        ) : (
          <ol className="space-y-5">
            {entries.map((entry, index) => (
              <li key={index} className="flex items-start gap-3" data-testid={`history-entry-${index}`}>
                <span className={`w-3 h-3 mt-1.5 rounded-full shrink-0 ${DOT_CLASS_BY_TYPE[entry.type]}`} />
                <div className="flex-1 space-y-1 border-b border-border pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground">{new Date(entry.occurredAt).toLocaleDateString()}</span>
                    <Badge variant="secondary">{t(BADGE_LABEL_KEY_BY_TYPE[entry.type])}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t(LABEL_KEY_BY_TYPE[entry.type])} — {entry.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
