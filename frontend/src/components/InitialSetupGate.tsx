import React, { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useSettings } from "@/hooks/useSettings";
import {
  initialSetupCompleted,
  nextInitialSetupLocation,
  shouldShowInitialSetupLoader,
} from "@/lib/initialSetup";
import { useTranslation } from "@/lib/i18n";

interface InitialSetupGateProps {
  children: React.ReactNode;
}

export function InitialSetupGate({ children }: InitialSetupGateProps) {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const { currentTenant, isLoading: isTenantLoading } = useTenant();
  const {
    getSetting,
    isLoading: areSettingsLoading,
  } = useSettings();
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();

  const isPlatformAdmin = user?.role === "platform_admin";
  const tenantReady = !isTenantLoading && Boolean(currentTenant);
  const settingsReady = tenantReady && !areSettingsLoading;
  const completed = initialSetupCompleted(
    getSetting("initialSetupCompleted", false),
  );
  const destination = nextInitialSetupLocation({
    authenticated: isAuthenticated && !isAuthLoading,
    tenantReady,
    settingsReady,
    completed,
    location,
    isPlatformAdmin,
  });
  const showLoader = shouldShowInitialSetupLoader({
    authLoading: isAuthLoading,
    authenticated: isAuthenticated,
    tenantLoading: isTenantLoading,
    tenantReady,
    settingsLoading: areSettingsLoading,
    isPlatformAdmin,
  });

  useEffect(() => {
    if (destination) setLocation(destination);
  }, [destination, setLocation]);

  if (showLoader) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
          <p className="mt-2 text-sm text-muted-foreground">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (destination) return null;

  return <>{children}</>;
}
