import React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/BrandMark";
import { setInstallMode } from "@/lib/installMode";
import { useTranslation } from "@/lib/i18n";

export default function InstallModeSetup() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const choose = (mode: "local" | "connected") => {
    setInstallMode(mode);
    setLocation("/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("installModeTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full h-auto flex-col items-start py-4 text-left whitespace-normal"
            variant="outline"
            onClick={() => choose("local")}
            data-testid="button-install-mode-local">
            <span className="font-semibold">{t("installModeLocalTitle")}</span>
            <span className="text-sm text-muted-foreground font-normal">
              {t("installModeLocalDescription")}
            </span>
          </Button>
          <Button
            className="w-full h-auto flex-col items-start py-4 text-left whitespace-normal"
            variant="outline"
            onClick={() => choose("connected")}
            data-testid="button-install-mode-connected">
            <span className="font-semibold">
              {t("installModeConnectedTitle")}
            </span>
            <span className="text-sm text-muted-foreground font-normal">
              {t("installModeConnectedDescription")}
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
