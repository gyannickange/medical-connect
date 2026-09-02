import React from "react";
import { Check } from "lucide-react";
import { useTranslation } from "../../lib/i18n";
import type { JourneyStep } from "@/lib/consultationJourney";

const STEP_LABEL_KEYS: Record<string, string> = {
  patientIdentified: "journeyStepPatientIdentified",
  consultationRegistered: "journeyStepConsultationRegistered",
  queue: "journeyStepQueue",
  preConsultation: "journeyStepPreConsultation",
  medicalConsultation: "journeyStepMedicalConsultation",
  exams: "journeyStepExams",
  prescription: "journeyStepPrescription",
  carePlan: "journeyStepCarePlan",
  closure: "journeyStepClosure",
};

export function ConsultationJourneySidebar({ steps }: { steps: JourneyStep[] }) {
  const { t } = useTranslation();
  if (steps.length === 0) return null;

  const currentIndex = steps.findIndex((step) => step.state === "current");
  const stepNumber = currentIndex >= 0 ? currentIndex + 1 : steps.length;
  const progress = (stepNumber / steps.length) * 100;

  return (
    <div
      className="sticky top-[73px] flex flex-col gap-4 w-[210px] shrink-0 border-r border-border bg-background p-5"
      data-testid="consultation-journey-sidebar">
      <div className="absolute left-0 top-0 h-full w-[3px] bg-primary" />
      <p className="text-[13px] font-bold text-muted-foreground">{t("journeyPanelTitle")}</p>
      <ol className="flex flex-col">
        {steps.map((step, index) => (
          <li
            key={step.key}
            data-testid={`journey-step-${step.key}`}
            className={
              step.state === "current"
                ? "flex gap-3 items-center py-2.5 px-2 -mx-2 rounded-[10px] bg-primary/10"
                : "flex gap-3 items-center py-2.5"
            }>
            <div className="flex flex-col items-center shrink-0">
              <div
                className={
                  step.state === "completed"
                    ? "flex items-center justify-center rounded-full bg-primary size-6"
                    : step.state === "current"
                      ? "flex items-center justify-center rounded-full border-2 border-primary size-6"
                      : "flex items-center justify-center rounded-full border-2 border-border bg-background size-6"
                }>
                {step.state === "completed" && <Check className="size-3.5 text-primary-foreground" />}
              </div>
              {index < steps.length - 1 && <div className="w-0.5 h-6 rounded-full bg-border" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-[13px] font-semibold ${step.state === "current" ? "text-primary" : "text-foreground"}`}>
                {t(STEP_LABEL_KEYS[step.key])}
              </p>
              {step.occurredAt && (
                <p className="text-[11px] text-muted-foreground">
                  {step.occurredAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2 w-full mt-auto pt-2">
        <p className="text-[11px] text-muted-foreground">{t("stepProgressLabel").replace("{current}", String(stepNumber)).replace("{total}", String(steps.length))}</p>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
