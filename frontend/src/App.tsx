import React, { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TenantProvider } from "./contexts/TenantContext";
import { AuthProvider } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GlobalOfflineSync } from "./components/GlobalOfflineSync";
import { GlobalNativeLANAgent } from "./components/GlobalNativeLANAgent";
import { ProductsReplicaProvider } from "./components/ProductsReplicaProvider";
import { StockReplicaProvider } from "./components/StockReplicaProvider";
import { CategoriesReplicaProvider } from "./components/CategoriesReplicaProvider";
import { GlobalProductLockRequests } from "./components/GlobalProductLockRequests";
import { OfflineSyncProvider } from "./hooks/useOfflineSync";
import { useTranslation } from "./lib/i18n";
import { InstallModeGate } from "./components/InstallModeGate";
import { InitialSetupGate } from "./components/InitialSetupGate";
import { ErrorBoundary } from "./components/ErrorBoundary";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Products = lazy(() => import("./pages/Products"));
const Categories = lazy(() => import("./pages/Categories"));
const Rayons = lazy(() => import("./pages/Rayons"));
const Patients = lazy(() => import("./pages/Patients"));
const Customers = lazy(() => import("./pages/Customers"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const Staff = lazy(() => import("./pages/Staff"));
const Reports = lazy(() => import("./pages/Reports"));
const Sales = lazy(() =>
  import("./pages/Sales").then((m) => ({ default: m.Sales })),
);
const Settings = lazy(() => import("./pages/Settings"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const PasswordReset = lazy(() => import("./pages/PasswordReset"));
const PasswordResetRequest = lazy(
  () => import("./pages/PasswordResetRequest"),
);
const InstallModeSetup = lazy(() => import("./pages/InstallModeSetup"));
const InitialSetup = lazy(() => import("./pages/InitialSetup"));
const LocalPasswordRecovery = lazy(
  () => import("./pages/LocalPasswordRecovery"),
);
const NotFound = lazy(() => import("@/pages/not-found"));

function RouteFallback() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        <p className="mt-2 text-sm text-muted-foreground">{t("loading")}</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Switch>
        {/* Public routes */}
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/reset-password" component={PasswordReset} />
        <Route
          path="/request-password-reset"
          component={PasswordResetRequest}
        />
        <Route path="/setup" component={InstallModeSetup} />
        <Route path="/local-recovery" component={LocalPasswordRecovery} />

        {/* Protected routes */}
        <Route path="/initial-setup">
          <ProtectedRoute>
            <InitialSetup />
          </ProtectedRoute>
        </Route>
        <Route path="/">
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/products">
          <ProtectedRoute>
            <Layout>
              <Products />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/categories">
          <ProtectedRoute>
            <Layout>
              <Categories />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/rayons">
          <ProtectedRoute>
            <Layout>
              <Rayons />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/patients">
          <ProtectedRoute>
            <Layout>
              <Patients />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/customers">
          <ProtectedRoute>
            <Layout>
              <Customers />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/suppliers">
          <ProtectedRoute>
            <Layout>
              <Suppliers />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/staff">
          <ProtectedRoute>
            <Layout>
              <Staff />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/reports">
          <ProtectedRoute>
            <Layout>
              <Reports />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/sales">
          <ProtectedRoute>
            <Layout>
              <Sales />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/settings">
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/audit-logs">
          <ProtectedRoute>
            <Layout>
              <AuditLogs />
            </Layout>
          </ProtectedRoute>
        </Route>

        {/* 404 */}
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <TenantProvider>
              <OfflineSyncProvider>
                <SettingsProvider>
                  <TooltipProvider>
                    <Toaster />
                    <GlobalOfflineSync />
                    <GlobalNativeLANAgent />
                    <ProductsReplicaProvider />
                    <StockReplicaProvider />
                    <CategoriesReplicaProvider />
                    <GlobalProductLockRequests />
                    <InstallModeGate>
                      <InitialSetupGate>
                        <Router />
                      </InitialSetupGate>
                    </InstallModeGate>
                  </TooltipProvider>
                </SettingsProvider>
              </OfflineSyncProvider>
            </TenantProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
