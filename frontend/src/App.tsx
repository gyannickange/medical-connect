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
import { OfflineSyncProvider } from "./hooks/useOfflineSync";
import { useTranslation } from "./lib/i18n";
import { InstallModeGate } from "./components/InstallModeGate";
import { InitialSetupGate } from "./components/InitialSetupGate";
import { ErrorBoundary } from "./components/ErrorBoundary";

const Patients = lazy(() => import("./pages/patients"));
const NewPatient = lazy(() => import("./pages/patients/new"));
const EditPatient = lazy(() => import("./pages/patients/edit"));
const PatientDetails = lazy(() => import("./pages/patients/show"));
const DossierMedical = lazy(() => import("./pages/patients/dossier-medical"));
const Consultations = lazy(() => import("./pages/consultations"));
const ConsultationsArchive = lazy(() => import("./pages/consultations/archive"));
const NewConsultation = lazy(() => import("./pages/consultations/new"));
const EditConsultation = lazy(() => import("./pages/consultations/edit"));
const ConsultationDetails = lazy(() => import("./pages/consultations/show"));
const PreConsultationForm = lazy(() => import("./pages/consultations/pre-consultation"));
const ConsultationMedicaleForm = lazy(() => import("./pages/consultations/consultation-medicale"));
const PrescriptionForm = lazy(() => import("./pages/consultations/prescription"));
const ResultatExamens = lazy(() => import("./pages/consultations/resultat-examens"));
const PlanPriseEnCharge = lazy(() => import("./pages/consultations/plan-prise-en-charge"));
const ResumeCloture = lazy(() => import("./pages/consultations/resume-cloture"));
const Suivi = lazy(() => import("./pages/consultations/suivi"));
const SuiviResultat = lazy(() => import("./pages/consultations/suivi-resultat"));
const LaboratoireIndex = lazy(() => import("./pages/laboratoire"));
const NewLabOrder = lazy(() => import("./pages/laboratoire/new"));
const ExamTypesManager = lazy(() => import("./pages/laboratoire/exam-types"));
const ExamTypeForm = lazy(() => import("./pages/laboratoire/exam-type-form"));
const LabOrderDetails = lazy(() => import("./pages/laboratoire/show"));
const PharmacieIndex = lazy(() => import("./pages/pharmacie"));
const PrescriptionDetails = lazy(() => import("./pages/pharmacie/show"));
const SallesIndex = lazy(() => import("./pages/salles"));
const NewSalle = lazy(() => import("./pages/salles/new"));
const SalleDetails = lazy(() => import("./pages/salles/show"));
const FileAttente = lazy(() => import("./pages/file-attente"));
const QueueRegister = lazy(() => import("./pages/file-attente/new"));
const QueueEntryDetails = lazy(() => import("./pages/file-attente/show"));
const FileAttenteArchive = lazy(() => import("./pages/file-attente/archive"));
const Staff = lazy(() => import("./pages/Staff"));
const Settings = lazy(() => import("./pages/Settings"));
const ServicesManager = lazy(() => import("./pages/settings/services"));
const ServiceForm = lazy(() => import("./pages/settings/service-form"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const Login = lazy(() => import("./pages/Login"));
const PlatformAdmin = lazy(() => import("./pages/PlatformAdmin"));
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
              <Patients />
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
        <Route path="/patients/new">
          <ProtectedRoute>
            <Layout>
              <NewPatient />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/patients/:id/edit">
          <ProtectedRoute>
            <Layout>
              <EditPatient />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/patients/:id/dossier-medical">
          <ProtectedRoute>
            <Layout>
              <DossierMedical />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/patients/:id">
          <ProtectedRoute>
            <Layout>
              <PatientDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations">
          <ProtectedRoute>
            <Layout>
              <Consultations />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/archive">
          <ProtectedRoute>
            <Layout>
              <ConsultationsArchive />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/new">
          <ProtectedRoute>
            <Layout>
              <NewConsultation />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/edit">
          <ProtectedRoute>
            <Layout>
              <EditConsultation />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/pre-consultation">
          <ProtectedRoute>
            <Layout>
              <PreConsultationForm />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/consultation-medicale">
          <ProtectedRoute>
            <Layout>
              <ConsultationMedicaleForm />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/prescription">
          <ProtectedRoute>
            <Layout>
              <PrescriptionForm />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/resultats-examens">
          <ProtectedRoute>
            <Layout>
              <ResultatExamens />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/plan-prise-en-charge">
          <ProtectedRoute>
            <Layout>
              <PlanPriseEnCharge />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/resume-cloture">
          <ProtectedRoute>
            <Layout>
              <ResumeCloture />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/suivi">
          <ProtectedRoute>
            <Layout>
              <Suivi />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/suivi/:labOrderId">
          <ProtectedRoute>
            <Layout>
              <SuiviResultat />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id">
          <ProtectedRoute>
            <Layout>
              <ConsultationDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/file-attente">
          <ProtectedRoute>
            <Layout>
              <FileAttente />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/file-attente/new">
          <ProtectedRoute>
            <Layout>
              <QueueRegister />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/file-attente/archive">
          <ProtectedRoute>
            <Layout>
              <FileAttenteArchive />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/file-attente/:consultationId">
          <ProtectedRoute>
            <Layout>
              <QueueEntryDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire">
          <ProtectedRoute>
            <Layout>
              <LaboratoireIndex />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire/new">
          <ProtectedRoute>
            <Layout>
              <NewLabOrder />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire/exam-types">
          <ProtectedRoute>
            <Layout>
              <ExamTypesManager />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire/exam-types/new">
          <ProtectedRoute>
            <Layout>
              <ExamTypeForm />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire/exam-types/:id/edit">
          <ProtectedRoute>
            <Layout>
              <ExamTypeForm />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire/:id">
          <ProtectedRoute>
            <Layout>
              <LabOrderDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/pharmacie">
          <ProtectedRoute>
            <Layout>
              <PharmacieIndex />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/pharmacie/:id">
          <ProtectedRoute>
            <Layout>
              <PrescriptionDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/salles">
          <ProtectedRoute>
            <Layout>
              <SallesIndex />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/salles/new">
          <ProtectedRoute>
            <Layout>
              <NewSalle />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/salles/:id">
          <ProtectedRoute>
            <Layout>
              <SalleDetails />
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
        <Route path="/settings">
          <ProtectedRoute>
            <Layout>
              <Settings />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/settings/services">
          <ProtectedRoute>
            <Layout>
              <ServicesManager />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/settings/services/new">
          <ProtectedRoute>
            <Layout>
              <ServiceForm />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/settings/services/:id/edit">
          <ProtectedRoute>
            <Layout>
              <ServiceForm />
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
        <Route path="/platform-admin">
          <ProtectedRoute>
            <PlatformAdmin />
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
