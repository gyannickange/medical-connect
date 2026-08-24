import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface RecoveryCodeDisplayProps {
  recoveryCode: string;
  onContinue: () => void;
}

export const RecoveryCodeDisplay: React.FC<RecoveryCodeDisplayProps> = ({
  recoveryCode,
  onContinue,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex justify-center text-amber-500">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        {t("recoveryCodeWarning")}
      </p>
      <div
        className="text-center text-2xl font-mono tracking-widest bg-muted rounded-lg py-4 select-all"
        data-testid="text-recovery-code">
        {recoveryCode}
      </div>
      <Button
        className="w-full"
        onClick={onContinue}
        data-testid="button-recovery-code-continue">
        {t("recoveryCodeContinue")}
      </Button>
    </div>
  );
};
