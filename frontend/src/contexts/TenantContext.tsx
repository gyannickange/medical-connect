import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { Tenant } from "@shared/schema";
import { useAuth } from "./AuthContext";
import { queryClient } from "@/lib/queryClient";
import { getInstallMode } from "@/lib/installMode";
import { setErrorLogTenantId } from "@/lib/errorLogStore";

interface TenantContextType {
  currentTenant: Tenant | null;
  setCurrentTenant: (tenant: Tenant | null) => void;
  tenants: Tenant[];
  setTenants: (tenants: Tenant[]) => void;
  isLoading: boolean;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error("useTenant must be used within a TenantProvider");
  }
  return context;
};

interface TenantProviderProps {
  children: ReactNode;
}

export const TenantProvider: React.FC<TenantProviderProps> = ({ children }) => {
  const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const auth = useAuth();

  useEffect(() => {
    setErrorLogTenantId(currentTenant?.id);
  }, [currentTenant]);

  useEffect(() => {
    const initializeTenant = async () => {
      // Wait for auth to load
      if (auth.isLoading) {
        return;
      }

      // The API currently returns one tenant. It can also return `tenants`
      // once multi-account memberships are available on the backend.
      if (auth.isAuthenticated && auth.tenant) {
        const accessibleTenants = auth.tenants.length
          ? auth.tenants
          : [auth.tenant];
        const savedTenantId = localStorage.getItem("businessconnect_current_tenant");
        const savedTenant = accessibleTenants.find(
          (tenant) => tenant.id === savedTenantId
        );

        setTenants(accessibleTenants);
        setCurrentTenant(savedTenant ?? auth.tenant);
        setIsLoading(false);
        return;
      }

      if (getInstallMode() === "local") {
        // Local mode has no central tenants endpoint to ask, and never
        // should - the connected-mode registration page is unreachable here.
        setTenants([]);
        setIsLoading(false);
        return;
      }

      // If not authenticated, try to fetch tenants (for registration page)
      try {
        const response = await fetch("/api/tenants", {
          credentials: "include",
        });
        if (response.ok) {
          const fetchedTenants = await response.json();
          setTenants(fetchedTenants);
        }
      } catch (error) {
        console.error("Failed to fetch tenants:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeTenant();
  }, [auth.isLoading, auth.isAuthenticated, auth.tenant, auth.tenants]);

  const handleSetCurrentTenant = (tenant: Tenant | null) => {
    if (tenant?.id === currentTenant?.id) return;

    // Never reuse cached business data after moving to another account.
    queryClient.clear();
    setCurrentTenant(tenant);
    if (tenant) {
      localStorage.setItem("businessconnect_current_tenant", tenant.id);
    } else {
      localStorage.removeItem("businessconnect_current_tenant");
    }
  };

  return (
    <TenantContext.Provider
      value={{
        currentTenant,
        setCurrentTenant: handleSetCurrentTenant,
        tenants,
        setTenants,
        isLoading,
      }}>
      {children}
    </TenantContext.Provider>
  );
};
