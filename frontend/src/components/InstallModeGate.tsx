import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/BrandMark";
import { RecoveryCodeDisplay } from "@/components/RecoveryCodeDisplay";
import { resolveInstallMode } from "@/lib/installMode";
import { countLocalAccounts, createLocalAccount } from "@/lib/localAccountsStore";
import { fetchInitialAdminCredentials } from "@/lib/localAdminProvisioning";
import { MIN_LOCAL_PASSWORD_LENGTH } from "@/lib/localAuth";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";

const SETUP_PATHS = ["/setup"];
const CONNECTED_ONLY_PATHS = [
  "/register",
  "/reset-password",
  "/request-password-reset",
];

export const InstallModeGate: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [location, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const [needsAdminCreation, setNeedsAdminCreation] = useState(false);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminConfirmPassword, setAdminConfirmPassword] = useState("");
  const [isCreatingAdmin, setIsCreatingAdmin] = useState(false);
  const [initialAdminRecoveryCode, setInitialAdminRecoveryCode] = useState<
    string | null
  >(null);
  const { t } = useTranslation();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const evaluate = async () => {
      try {
        const mode = resolveInstallMode();

        if (!mode) {
          if (location !== "/setup") setLocation("/setup");
          if (!cancelled) setChecking(false);
          return;
        }

        if (mode === "local") {
          const count = await countLocalAccounts();
          if (cancelled) return;
          if (count === 0) {
            const credentials = await fetchInitialAdminCredentials();
            if (!credentials) {
              // No BUSINESSCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD configured for
              // this installation and no dev fallback applies (production
              // build) - let the user set their own admin username/password
              // instead of falling back to a guessable identifier.
              if (!cancelled) {
                setNeedsAdminCreation(true);
                setChecking(false);
              }
              return;
            }
            const { recoveryCode } = await createLocalAccount({
              username: credentials.username,
              password: credentials.password,
              role: "admin",
            });
            if (cancelled) return;
            // Shown once below, per spec: never logged, never persisted in
            // clear text. The gate stays held until the admin confirms.
            setInitialAdminRecoveryCode(recoveryCode);
            return;
          }
          if (
            SETUP_PATHS.includes(location) ||
            CONNECTED_ONLY_PATHS.includes(location)
          ) {
            setLocation("/login");
          }
          setChecking(false);
          return;
        }

        if (!cancelled) {
          if (SETUP_PATHS.includes(location)) {
            setLocation("/login");
          }
          setChecking(false);
        }
      } catch (error) {
        console.error("Install mode check failed:", error);
        if (!cancelled) {
          setFailed(true);
          setChecking(false);
        }
      }
    };

    evaluate();
    return () => {
      cancelled = true;
    };
  }, [location, setLocation]);

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (adminPassword !== adminConfirmPassword) {
      toast({
        title: t("validationError"),
        description: t("passwordsDoNotMatch"),
        variant: "destructive",
      });
      return;
    }

    if (adminPassword.length < MIN_LOCAL_PASSWORD_LENGTH) {
      toast({
        title: t("validationError"),
        description: t("passwordMinLength"),
        variant: "destructive",
      });
      return;
    }

    setIsCreatingAdmin(true);
    try {
      const { recoveryCode } = await createLocalAccount({
        username: adminUsername,
        password: adminPassword,
        role: "admin",
      });
      setNeedsAdminCreation(false);
      // Shown once below, per spec: never logged, never persisted in
      // clear text. The gate stays held until the admin confirms.
      setInitialAdminRecoveryCode(recoveryCode);
    } catch (error: any) {
      toast({
        title: t("registrationFailed"),
        description:
          error?.message === "username_taken"
            ? t("usernameTaken")
            : t("anErrorOccurred"),
        variant: "destructive",
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  if (needsAdminCreation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
            </div>
            <CardTitle className="text-xl font-bold">
              {t("createLocalAdminTitle")}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {t("createLocalAdminDescription")}
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateAdmin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-username">{t("username")}</Label>
                <Input
                  id="admin-username"
                  type="text"
                  placeholder={t("enterUsername")}
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  required
                  autoComplete="username"
                  disabled={isCreatingAdmin}
                  data-testid="input-admin-username"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">{t("password")}</Label>
                <Input
                  id="admin-password"
                  type="password"
                  placeholder={t("enterPassword")}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isCreatingAdmin}
                  data-testid="input-admin-password"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-confirm-password">
                  {t("confirmPassword")}
                </Label>
                <Input
                  id="admin-confirm-password"
                  type="password"
                  placeholder={t("enterPassword")}
                  value={adminConfirmPassword}
                  onChange={(e) => setAdminConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isCreatingAdmin}
                  data-testid="input-admin-confirm-password"
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={isCreatingAdmin}
                data-testid="button-create-local-admin">
                {isCreatingAdmin ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("creatingAccount")}
                  </>
                ) : (
                  t("createAccount")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="space-y-3 max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            {t("installModeCheckFailed")}
          </p>
          <Button onClick={() => window.location.reload()}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (initialAdminRecoveryCode) {
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
              recoveryCode={initialAdminRecoveryCode}
              onContinue={() => {
                setInitialAdminRecoveryCode(null);
                setLocation("/login");
                setChecking(false);
              }}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (checking) return null;
  return <>{children}</>;
};
