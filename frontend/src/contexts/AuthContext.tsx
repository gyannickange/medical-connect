import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { User, Tenant } from "@shared/schema";
import { getInstallMode } from "@/lib/installMode";
import { getLocalAccountById, verifyLocalLogin } from "@/lib/localAccountsStore";
import {
  buildLocalTenant,
  toPublicLocalUser,
  type LocalUserDoc,
} from "@/lib/localAuth";
import { getSessionSigningKey } from "@/lib/deviceMasterKey";
import {
  signLocalSession,
  verifyLocalSession,
  type SignedLocalSession,
} from "@/lib/localSessionToken";
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
import { setErrorLogUserId } from "@/lib/errorLogStore";

interface AuthContextType {
  user: Omit<User, "password"> | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  checkAuth: () => Promise<void>;
}

interface RegisterData {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email?: string;
  tenantId: string;
  role?: "admin" | "manager" | "cashier";
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const LOCAL_SESSION_KEY = "businessconnect_local_session";
const LOCAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<Omit<User, "password"> | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
    setErrorLogUserId(user?.id);
  }, [user]);

  const applyLocalSession = (doc: LocalUserDoc) => {
    const localTenant = buildLocalTenant(doc.createdAt);
    setUser(toPublicLocalUser(doc));
    setTenant(localTenant);
    setTenants([localTenant]);
  };

  const clearSession = () => {
    setUser(null);
    setTenant(null);
    setTenants([]);
  };

  const checkAuthLocal = async () => {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) {
      clearSession();
      return;
    }

    try {
      const session: SignedLocalSession = JSON.parse(raw);
      const signingKey = await getSessionSigningKey();
      const isValidSignature = await verifyLocalSession(session, signingKey);
      if (!isValidSignature || session.expiresAt < Date.now()) {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        clearSession();
        return;
      }

      const doc = await getLocalAccountById(session.userId);
      if (!doc || !doc.active) {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        clearSession();
        return;
      }

      applyLocalSession(doc);
    } catch (error) {
      console.error("Failed to restore local session:", error);
      localStorage.removeItem(LOCAL_SESSION_KEY);
      clearSession();
    }
  };

  const checkAuthConnected = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setTenant(data.tenant);
        setTenants(
          Array.isArray(data.tenants)
            ? data.tenants
            : data.tenant
              ? [data.tenant]
              : []
        );
      } else {
        clearSession();
      }
    } catch (error) {
      console.error("Failed to check authentication:", error);
      clearSession();
    }
  };

  const checkAuth = async () => {
    setIsLoading(true);
    const mode = getInstallMode();
    if (mode === "local") {
      await checkAuthLocal();
    } else if (mode === "connected") {
      await checkAuthConnected();
    } else {
      // No install mode chosen yet - nothing to restore, and definitely no
      // server to ask. InstallModeGate is responsible for routing to /setup.
      clearSession();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginLocal = async (username: string, password: string) => {
    const doc = await verifyLocalLogin(username, password);
    if (!doc) {
      throw new Error("Identifiants invalides");
    }
    const signingKey = await getSessionSigningKey();
    const session = await signLocalSession(
      { userId: doc._id, expiresAt: Date.now() + LOCAL_SESSION_TTL_MS },
      signingKey
    );
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
    applyLocalSession(doc);
  };

  const loginConnected = async (username: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Login failed");
    }

    const data = await response.json();
    setUser(data.user);
    setTenant(data.tenant);
    setTenants(
      Array.isArray(data.tenants)
        ? data.tenants
        : data.tenant
          ? [data.tenant]
          : []
    );
  };

  const login = async (username: string, password: string) => {
    if (getInstallMode() === "local") {
      await loginLocal(username, password);
    } else {
      await loginConnected(username, password);
    }
  };

  const logout = async () => {
    if (getInstallMode() === "local") {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      clearSession();
      return;
    }

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearSession();
    }
  };

  const register = async (data: RegisterData) => {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Registration failed");
    }
  };

  useInactivityLogout(logout, !!user);

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        tenants,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        register,
        checkAuth,
      }}>
      {children}
    </AuthContext.Provider>
  );
};
