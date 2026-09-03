import React, { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
import { useTranslation } from "@/lib/i18n";
import { getInstallMode } from "@/lib/installMode";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { login, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Redirect to home (or the platform admin dashboard) when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      setLocation(user?.role === "platform_admin" ? "/platform-admin" : "/");
    }
  }, [isAuthenticated, isLoading, user, setLocation]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(username, password);
      toast({
        title: t("loginSuccessful"),
        description: t("welcomeBack"),
        variant: "success",
      });
      // Don't redirect here - let the useEffect handle it after state updates
    } catch (error: any) {
      toast({
        title: t("loginFailed"),
        description: error.message || t("invalidCredentials"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("welcomeToMedicalConnect")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                type="text"
                placeholder={t("enterUsername")}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                placeholder={t("enterPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isLoading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("signingIn")}
                </>
              ) : (
                t("signIn")
              )}
            </Button>
          </form>
          <div className="mt-2 text-center text-sm">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-muted-foreground"
              onClick={() =>
                setLocation(
                  getInstallMode() === "local"
                    ? "/local-recovery"
                    : "/reset-password"
                )
              }
              disabled={isLoading}>
              {t("forgotPassword")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
