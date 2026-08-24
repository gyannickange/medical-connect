import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { RecoveryCodeDisplay } from "@/components/RecoveryCodeDisplay";
import { recoverLocalAccount } from "@/lib/localAccountsStore";
import { useTranslation } from "@/lib/i18n";

export default function LocalPasswordRecovery() {
  const [username, setUsername] = useState("");
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({
        title: t("validationError"),
        description: t("passwordMinLength"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await recoverLocalAccount({
        username,
        recoveryCode: recoveryCodeInput,
        newPassword,
      });
      if (!result) {
        toast({
          title: t("recoveryFailed"),
          description: t("recoveryInvalidCode"),
          variant: "destructive",
        });
        return;
      }
      setNewRecoveryCode(result.recoveryCode);
    } catch (error) {
      toast({
        title: t("recoveryFailed"),
        description:
          error instanceof Error && error.message === "password_too_short"
            ? t("passwordMinLength")
            : t("recoveryInvalidCode"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (newRecoveryCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
            </div>
            <CardTitle className="text-xl font-bold">
              {t("recoveryCodeTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecoveryCodeDisplay
              recoveryCode={newRecoveryCode}
              onContinue={() => setLocation("/login")}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("localRecoveryTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recoveryCode">{t("recoveryCodeLabel")}</Label>
              <Input
                id="recoveryCode"
                type="text"
                value={recoveryCodeInput}
                onChange={(e) =>
                  setRecoveryCodeInput(e.target.value.trim().toUpperCase())
                }
                required
                placeholder="XXXX-XXXX-XXXX"
                disabled={isLoading}
                data-testid="input-recovery-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isLoading}
                data-testid="input-new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-recover-account">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("loading")}
                </>
              ) : (
                t("localRecoverySubmit")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
