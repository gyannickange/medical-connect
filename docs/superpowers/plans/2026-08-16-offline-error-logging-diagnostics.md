# Offline Error Logging + Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the offline-first desktop frontend a local error log (capped, rotating, no sensitive data) and a Diagnostics section in Settings to view/download/clear it.

**Architecture:** A plain `localStorage`-backed store (`errorLogStore.ts`) is the single write path for log entries. Two capture points feed it — global `window` error/rejection handlers plus a React `ErrorBoundary` for uncaught crashes, and an optional `module` parameter threaded through the existing `errorHandler.ts` toast helpers for already-handled errors. `AuthContext`/`TenantContext` push the current `userId`/`tenantId` into the store via a small bridging ref so plain `lib/` code can read them without hooks. A new `DiagnosticsCard` in Settings reads the store for display/export/clear.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest (`environment: "node"`, no jsdom/RTL), existing shadcn/radix `ui/` components, existing `i18n.ts` `t()`/`useTranslation()`.

**Spec:** `docs/superpowers/specs/2026-08-16-offline-error-logging-diagnostics-design.md`

## Global Constraints

- Frontend-only (`frontend/`). No backend/Rust changes. Backend keeps using Sentry, untouched.
- Never store request/response bodies, tokens, or passwords in a log entry — only `message`/`stack` strings and primitive `context` values explicitly passed by the caller.
- Max 200 stored entries (FIFO rotation), stack traces truncated to 4000 characters.
- All new user-facing strings go through `t("key")` in `frontend/src/lib/i18n.ts`, added to **both** `en` and `fr`.
- Never write a raw HTML element when an equivalent `frontend/src/components/ui/` component exists (`Card`, `Button`, `Alert`, `ScrollArea`, `Table`, etc.).
- No new test infrastructure (no jsdom, no `@testing-library/react`). Plain `lib/` logic is fully unit-tested with Vitest's `node` environment (stub globals via `vi.stubGlobal`, mock sibling modules via `vi.mock("./module", () => ({...}))` — both patterns already used in this codebase). Thin React components/hooks that just glue tested logic together stay untested.
- Per project convention, skip per-task commits while executing this plan — implement and test every task with changes left uncommitted, then ask the user once at the end whether/how to commit.

---

### Task 1: `errorLogStore.ts` — core log storage

**Files:**
- Create: `frontend/src/lib/errorLogStore.ts`
- Create: `frontend/src/lib/errorLogStore.test.ts`
- Create: `frontend/src/vite-env.d.ts`
- Modify: `frontend/vite.config.ts`
- Modify: `frontend/vitest.config.ts`

**Interfaces:**
- Consumes: `getDeviceId()`, `getDeviceName()` from `frontend/src/lib/deviceIdentity.ts` (existing, unchanged).
- Produces (used by later tasks):
  - `logError(input: { module: string; message: string; stack?: string; context?: ErrorLogContext }): void`
  - `getErrorLogs(): ErrorLogEntry[]` (most recent first)
  - `clearErrorLogs(): void`
  - `buildDiagnosticExport(): DiagnosticExport`
  - `setErrorLogUserId(userId: string | undefined): void`
  - `setErrorLogTenantId(tenantId: string | undefined): void`
  - Types: `ErrorLogEntry`, `ErrorLogContext`, `DiagnosticExport`, `LogErrorInput`

- [ ] **Step 1: Add the build-time app version constant**

Edit `frontend/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5200",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
```

Edit `frontend/vitest.config.ts` the same way, so tests see the same constant:

```ts
import { defineConfig } from "vitest/config";
import path from "path";
import { readFileSync } from "fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8")
);

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

Create `frontend/src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />

declare const __APP_VERSION__: string;
```

- [ ] **Step 2: Write the failing test file**

Create `frontend/src/lib/errorLogStore.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  logError,
  getErrorLogs,
  clearErrorLogs,
  buildDiagnosticExport,
  setErrorLogUserId,
  setErrorLogTenantId,
} from "./errorLogStore";

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  });
  return store;
}

describe("errorLogStore", () => {
  beforeEach(() => {
    stubLocalStorage();
    vi.stubGlobal("navigator", { onLine: true });
    setErrorLogUserId(undefined);
    setErrorLogTenantId(undefined);
  });

  it("records an entry with auto-filled metadata", () => {
    logError({ module: "settings", message: "Save failed" });
    const logs = getErrorLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      module: "settings",
      message: "Save failed",
      online: true,
      appVersion: __APP_VERSION__,
    });
    expect(logs[0].id).toBeTruthy();
    expect(logs[0].timestamp).toBeTruthy();
    expect(logs[0].deviceId).toBeTruthy();
  });

  it("returns the most recent entry first", () => {
    logError({ module: "a", message: "first" });
    logError({ module: "b", message: "second" });
    const logs = getErrorLogs();
    expect(logs[0].message).toBe("second");
    expect(logs[1].message).toBe("first");
  });

  it("truncates a stack trace beyond 4000 characters", () => {
    logError({ module: "a", message: "boom", stack: "x".repeat(5000) });
    expect(getErrorLogs()[0].stack).toHaveLength(4000);
  });

  it("rotates out the oldest entry beyond 200 entries", () => {
    for (let i = 0; i < 201; i++) {
      logError({ module: "a", message: `error-${i}` });
    }
    const logs = getErrorLogs();
    expect(logs).toHaveLength(200);
    expect(logs[0].message).toBe("error-200");
    expect(logs[logs.length - 1].message).toBe("error-1");
  });

  it("captures the offline status at the time of the error", () => {
    vi.stubGlobal("navigator", { onLine: false });
    logError({ module: "a", message: "offline error" });
    expect(getErrorLogs()[0].online).toBe(false);
  });

  it("attaches the current tenant and user id", () => {
    setErrorLogUserId("user-1");
    setErrorLogTenantId("tenant-1");
    logError({ module: "a", message: "scoped error" });
    expect(getErrorLogs()[0]).toMatchObject({
      userId: "user-1",
      tenantId: "tenant-1",
    });
  });

  it("clears all stored entries", () => {
    logError({ module: "a", message: "one" });
    clearErrorLogs();
    expect(getErrorLogs()).toEqual([]);
  });

  it("never throws when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    });
    expect(() => logError({ module: "a", message: "boom" })).not.toThrow();
    expect(getErrorLogs()).toEqual([]);
  });

  it("builds a diagnostic export bundling device/session info and logs", () => {
    setErrorLogTenantId("tenant-1");
    logError({ module: "a", message: "one" });
    const diagnostic = buildDiagnosticExport();
    expect(diagnostic.tenantId).toBe("tenant-1");
    expect(diagnostic.logs).toHaveLength(1);
    expect(diagnostic.appVersion).toBe(__APP_VERSION__);
    expect(diagnostic.deviceId).toBeTruthy();
    expect(diagnostic.deviceName).toBeTruthy();
    expect(diagnostic.generatedAt).toBeTruthy();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/errorLogStore.test.ts`
Expected: FAIL — `errorLogStore.ts` does not exist yet (module not found).

- [ ] **Step 4: Write the implementation**

Create `frontend/src/lib/errorLogStore.ts`:

```ts
import { getDeviceId, getDeviceName } from "./deviceIdentity";

const STORAGE_KEY = "stockflow_error_logs";
const MAX_ENTRIES = 200;
const MAX_STACK_LENGTH = 4000;

export interface ErrorLogContext {
  [key: string]: string | number | boolean;
}

export interface ErrorLogEntry {
  id: string;
  timestamp: string;
  appVersion: string;
  deviceId: string;
  module: string;
  message: string;
  stack?: string;
  context?: ErrorLogContext;
  online: boolean;
  tenantId?: string;
  userId?: string;
}

export interface LogErrorInput {
  module: string;
  message: string;
  stack?: string;
  context?: ErrorLogContext;
}

export interface DiagnosticExport {
  generatedAt: string;
  appVersion: string;
  deviceId: string;
  deviceName: string;
  tenantId?: string;
  online: boolean;
  logs: ErrorLogEntry[];
}

let currentUserId: string | undefined;
let currentTenantId: string | undefined;

export function setErrorLogUserId(userId: string | undefined): void {
  currentUserId = userId;
}

export function setErrorLogTenantId(tenantId: string | undefined): void {
  currentTenantId = tenantId;
}

function createLogId(): string {
  const randomPart =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  return `log-${randomPart}`;
}

function getAppVersion(): string {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
}

function isOnline(): boolean {
  return typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean"
    ? navigator.onLine
    : true;
}

function readEntries(): ErrorLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: ErrorLogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage unavailable or full — logging must never break the app it diagnoses.
  }
}

export function logError(input: LogErrorInput): void {
  try {
    const entry: ErrorLogEntry = {
      id: createLogId(),
      timestamp: new Date().toISOString(),
      appVersion: getAppVersion(),
      deviceId: getDeviceId(),
      module: input.module,
      message: input.message,
      stack: input.stack ? input.stack.slice(0, MAX_STACK_LENGTH) : undefined,
      context: input.context,
      online: isOnline(),
      tenantId: currentTenantId,
      userId: currentUserId,
    };

    const entries = readEntries();
    entries.unshift(entry);
    writeEntries(entries.slice(0, MAX_ENTRIES));
  } catch {
    // Logging must never throw and break the app it's meant to diagnose.
  }
}

export function getErrorLogs(): ErrorLogEntry[] {
  return readEntries();
}

export function clearErrorLogs(): void {
  writeEntries([]);
}

export function buildDiagnosticExport(): DiagnosticExport {
  return {
    generatedAt: new Date().toISOString(),
    appVersion: getAppVersion(),
    deviceId: getDeviceId(),
    deviceName: getDeviceName(),
    tenantId: currentTenantId,
    online: isOnline(),
    logs: getErrorLogs(),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/errorLogStore.test.ts`
Expected: PASS (9 tests).

---

### Task 2: `globalErrorLogging.ts` — uncaught error/rejection capture

**Files:**
- Create: `frontend/src/lib/globalErrorLogging.ts`
- Create: `frontend/src/lib/globalErrorLogging.test.ts`

**Interfaces:**
- Consumes: `logError` from `./errorLogStore` (Task 1).
- Produces: `installGlobalErrorLogging(): void` — used by Task 4 (`main.tsx`).

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/globalErrorLogging.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("./errorLogStore", () => ({
  logError: vi.fn(),
}));

import { logError } from "./errorLogStore";
import { installGlobalErrorLogging } from "./globalErrorLogging";

describe("installGlobalErrorLogging", () => {
  it("logs uncaught errors and unhandled rejections, and installs listeners only once", () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const addEventListenerCalls: string[] = [];
    vi.stubGlobal("window", {
      addEventListener: (type: string, handler: (event: unknown) => void) => {
        listeners[type] = handler;
        addEventListenerCalls.push(type);
      },
    });

    installGlobalErrorLogging();
    installGlobalErrorLogging();

    expect(addEventListenerCalls).toEqual(["error", "unhandledrejection"]);

    listeners.error({ message: "Boom", error: new Error("Boom") });
    expect(logError).toHaveBeenCalledWith({
      module: "uncaught",
      message: "Boom",
      stack: expect.any(String),
    });

    listeners.unhandledrejection({ reason: new Error("Rejected") });
    expect(logError).toHaveBeenCalledWith({
      module: "uncaught",
      message: "Rejected",
      stack: expect.any(String),
    });

    listeners.unhandledrejection({ reason: "plain string reason" });
    expect(logError).toHaveBeenCalledWith({
      module: "uncaught",
      message: "plain string reason",
      stack: undefined,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/globalErrorLogging.test.ts`
Expected: FAIL — `globalErrorLogging.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/globalErrorLogging.ts`:

```ts
import { logError } from "./errorLogStore";

let installed = false;

function handleWindowError(event: ErrorEvent): void {
  logError({
    module: "uncaught",
    message: event.message || "Unhandled error",
    stack: event.error instanceof Error ? event.error.stack : undefined,
  });
}

function handleUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason;
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logError({ module: "uncaught", message, stack });
}

export function installGlobalErrorLogging(): void {
  if (installed) return;
  installed = true;
  window.addEventListener("error", handleWindowError);
  window.addEventListener("unhandledrejection", handleUnhandledRejection);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/globalErrorLogging.test.ts`
Expected: PASS (1 test).

---

### Task 3: i18n keys for the error boundary and Diagnostics UI

**Files:**
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Produces: translation keys consumed by Task 4 (`errorBoundaryTitle`, `errorBoundaryMessage`, `errorBoundaryReload`) and Task 7 (`diagnosticsCardTitle`, `diagnosticsCardDescription`, `diagnosticsNoRecentErrors`, `diagnosticsColumnDate`, `diagnosticsColumnModule`, `diagnosticsColumnMessage`, `diagnosticsDownload`, `diagnosticsClearLogs`, `diagnosticsClearLogsWarning`, `diagnosticsLogsCleared`, `diagnosticsRefresh`, `diagnosticsDetailDevice`, `diagnosticsDetailVersion`, `diagnosticsDetailOnline`, `diagnosticsOnline`, `diagnosticsOffline`, `diagnosticsDetailTenant`, `diagnosticsDetailUser`). Existing keys `cancel`/`areYouSure`/`error` are reused as-is.

- [ ] **Step 1: Add the English keys**

In `frontend/src/lib/i18n.ts`, inside the `en` dictionary (anywhere alongside other Settings-related keys, e.g. near `offlineDataManagement`/`clearOfflineData`), add:

```ts
    errorBoundaryTitle: "Something went wrong",
    errorBoundaryMessage: "Please restart the application.",
    errorBoundaryReload: "Reload",
    diagnosticsCardTitle: "Diagnostics",
    diagnosticsCardDescription:
      "Recent application errors captured locally for troubleshooting, available even while offline.",
    diagnosticsNoRecentErrors: "No recent errors",
    diagnosticsRefresh: "Refresh",
    diagnosticsColumnDate: "Date",
    diagnosticsColumnModule: "Module",
    diagnosticsColumnMessage: "Message",
    diagnosticsDownload: "Download diagnostic",
    diagnosticsClearLogs: "Clear logs",
    diagnosticsClearLogsWarning:
      "This will permanently delete all locally stored error logs. This cannot be undone.",
    diagnosticsLogsCleared: "Logs cleared",
    diagnosticsDetailDevice: "Device",
    diagnosticsDetailVersion: "App version",
    diagnosticsDetailOnline: "Status",
    diagnosticsOnline: "Online",
    diagnosticsOffline: "Offline",
    diagnosticsDetailTenant: "Tenant",
    diagnosticsDetailUser: "User",
```

- [ ] **Step 2: Add the matching French keys**

In the `fr` dictionary, at the same relative location, add:

```ts
    errorBoundaryTitle: "Une erreur est survenue",
    errorBoundaryMessage: "Veuillez redémarrer l'application.",
    errorBoundaryReload: "Recharger",
    diagnosticsCardTitle: "Diagnostics",
    diagnosticsCardDescription:
      "Erreurs récentes de l'application enregistrées localement pour le dépannage, disponibles même hors ligne.",
    diagnosticsNoRecentErrors: "Aucune erreur récente",
    diagnosticsRefresh: "Actualiser",
    diagnosticsColumnDate: "Date",
    diagnosticsColumnModule: "Module",
    diagnosticsColumnMessage: "Message",
    diagnosticsDownload: "Télécharger le diagnostic",
    diagnosticsClearLogs: "Effacer les logs",
    diagnosticsClearLogsWarning:
      "Ceci supprimera définitivement tous les logs d'erreurs stockés localement. Cette action est irréversible.",
    diagnosticsLogsCleared: "Logs effacés",
    diagnosticsDetailDevice: "Appareil",
    diagnosticsDetailVersion: "Version de l'application",
    diagnosticsDetailOnline: "Statut",
    diagnosticsOnline: "En ligne",
    diagnosticsOffline: "Hors ligne",
    diagnosticsDetailTenant: "Tenant",
    diagnosticsDetailUser: "Utilisateur",
```

- [ ] **Step 3: Run the i18n completeness test**

Run: `cd frontend && npx vitest run src/lib/i18nCompleteness.test.ts`
Expected: PASS — both dictionaries have matching key sets.

---

### Task 4: `ErrorBoundary` component + wiring into app startup

**Files:**
- Create: `frontend/src/components/ErrorBoundary.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`

**Interfaces:**
- Consumes: `logError` from `frontend/src/lib/errorLogStore.ts` (Task 1), `installGlobalErrorLogging` from `frontend/src/lib/globalErrorLogging.ts` (Task 2), `t` from `frontend/src/lib/i18n.ts` (Task 3 keys).
- Produces: `ErrorBoundary` React component, used only in `App.tsx`.

This is thin React glue (a class component required for `componentDidCatch`, and app bootstrap wiring) — no dedicated test file, matching the project's convention of leaving thin components/hooks untested (see `frontend/src/components/GlobalNativeLANAgent.tsx` for precedent).

- [ ] **Step 1: Create the `ErrorBoundary` component**

Create `frontend/src/components/ErrorBoundary.tsx`:

```tsx
import React from "react";
import { Button } from "@/components/ui/button";
import { logError } from "@/lib/errorLogStore";
import { t } from "@/lib/i18n";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    logError({
      module: "uncaught",
      message: error.message,
      stack: error.stack,
      context: { componentStack: info.componentStack ?? "" },
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen items-center justify-center p-6 text-center">
          <div className="space-y-4">
            <div>
              <p className="text-lg font-semibold">
                {t("errorBoundaryTitle")}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("errorBoundaryMessage")}
              </p>
            </div>
            <Button onClick={() => window.location.reload()}>
              {t("errorBoundaryReload")}
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap the app root with `ErrorBoundary`**

In `frontend/src/App.tsx`, add the import near the other component imports:

```ts
import { ErrorBoundary } from "./components/ErrorBoundary";
```

Then wrap the `App` function's return value (currently starting with `<QueryClientProvider client={queryClient}>` and ending with `</QueryClientProvider>`):

```tsx
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
                      <Router />
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
```

- [ ] **Step 3: Install the global handlers at startup**

Replace the contents of `frontend/src/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { installGlobalErrorLogging } from "./lib/globalErrorLogging";

installGlobalErrorLogging();

createRoot(document.getElementById("root")!).render(<App />);
```

- [ ] **Step 4: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

### Task 5: Thread a `module` into `errorHandler.ts`'s toast helpers

**Files:**
- Modify: `frontend/src/lib/errorHandler.ts`
- Modify: `frontend/src/lib/errorHandler.test.ts`

**Interfaces:**
- Consumes: `logError` from `./errorLogStore` (Task 1).
- Produces: `createErrorToast(error, title?, fallbackMessage?, networkFallbackMessage?, module = "app")` and `showApiErrorToast(notify, error, title, fallbackMessage, networkFallbackMessage?, module = "app")` — both keep their existing positional signature with `module` appended as a new optional final parameter, so every existing call site keeps compiling and behaving identically.

- [ ] **Step 1: Write the failing tests**

At the top of `frontend/src/lib/errorHandler.test.ts`, replace the current imports with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./errorLogStore", () => ({
  logError: vi.fn(),
}));

import { logError } from "./errorLogStore";
import {
  createErrorToast,
  formatNormalizedApiError,
  normalizeApiError,
  showApiErrorToast,
} from "./errorHandler";
```

Then append these two new `describe` blocks at the end of the file:

```ts
describe("createErrorToast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs the normalized error with the given module", async () => {
    await createErrorToast(
      new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
      "Error",
      "Fallback",
      "Fallback",
      "settings"
    );
    expect(logError).toHaveBeenCalledWith({
      module: "settings",
      message: "Forbidden",
      context: { status: 403, isNetworkError: false },
    });
  });

  it('defaults the module to "app" when not provided', async () => {
    await createErrorToast(
      new TypeError("Failed to fetch"),
      "Error",
      "Fallback",
      "Check your connection"
    );
    expect(logError).toHaveBeenCalledWith({
      module: "app",
      message: "Check your connection",
      context: { isNetworkError: true },
    });
  });

  it("still returns the same toast payload as before", async () => {
    const toastPayload = await createErrorToast(
      new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 }),
      "Error title",
      "Fallback"
    );
    expect(toastPayload).toEqual({
      title: "Error title",
      description: "Forbidden",
      variant: "destructive",
    });
  });
});

describe("showApiErrorToast", () => {
  it("forwards the module through to the log entry and still notifies", async () => {
    const notify = vi.fn();
    await showApiErrorToast(
      notify,
      new TypeError("Failed to fetch"),
      "Error",
      "Fallback",
      "Check your connection",
      "sales"
    );
    expect(logError).toHaveBeenCalledWith({
      module: "sales",
      message: "Check your connection",
      context: { isNetworkError: true },
    });
    expect(notify).toHaveBeenCalledWith({
      title: "Error",
      description: "Check your connection",
      variant: "destructive",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `cd frontend && npx vitest run src/lib/errorHandler.test.ts`
Expected: the pre-existing `normalizeApiError` tests still pass; the new `createErrorToast`/`showApiErrorToast` tests FAIL (no call to `logError` yet).

- [ ] **Step 3: Implement the `module` parameter**

In `frontend/src/lib/errorHandler.ts`, add the import at the top:

```ts
import { logError } from "./errorLogStore";
```

Replace `createErrorToast` and `showApiErrorToast` with:

```ts
export async function createErrorToast(
  error: unknown,
  title: string = "Error",
  fallbackMessage: string = "An error occurred",
  networkFallbackMessage: string = fallbackMessage,
  module: string = "app"
) {
  const normalized = await normalizeApiError(
    error,
    fallbackMessage,
    networkFallbackMessage
  );
  const description = formatNormalizedApiError(normalized);

  logError({
    module,
    message: description,
    context: {
      ...(normalized.status !== undefined ? { status: normalized.status } : {}),
      isNetworkError: normalized.isNetworkError,
    },
  });

  return {
    title,
    description,
    variant: "destructive" as const,
  };
}

export async function showApiErrorToast(
  notify: (options: {
    title: string;
    description: string;
    variant: "destructive";
  }) => void,
  error: unknown,
  title: string,
  fallbackMessage: string,
  networkFallbackMessage: string = fallbackMessage,
  module: string = "app"
): Promise<void> {
  notify(
    await createErrorToast(
      error,
      title,
      fallbackMessage,
      networkFallbackMessage,
      module
    )
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/errorHandler.test.ts`
Expected: PASS (all pre-existing tests plus the 4 new ones).

---

### Task 6: Bridge `userId`/`tenantId` from React contexts into the log store

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/contexts/TenantContext.tsx`

**Interfaces:**
- Consumes: `setErrorLogUserId`, `setErrorLogTenantId` from `frontend/src/lib/errorLogStore.ts` (Task 1).

No dedicated test file — this is a two-line `useEffect` in each existing context provider, matching the project's convention of leaving context/hook glue untested (no test file exists today for either context).

- [ ] **Step 1: Sync `userId` from `AuthContext`**

In `frontend/src/contexts/AuthContext.tsx`, add the import:

```ts
import { setErrorLogUserId } from "@/lib/errorLogStore";
```

Immediately after the existing state declarations in `AuthProvider` (`const [user, setUser] = useState<Omit<User, "password"> | null>(null);` / `const [tenant, setTenant] = useState<Tenant | null>(null);` / `const [tenants, setTenants] = useState<Tenant[]>([]);` / `const [isLoading, setIsLoading] = useState(true);`), add:

```ts
  useEffect(() => {
    setErrorLogUserId(user?.id);
  }, [user]);
```

- [ ] **Step 2: Sync `tenantId` from `TenantContext`**

In `frontend/src/contexts/TenantContext.tsx`, add the import:

```ts
import { setErrorLogTenantId } from "@/lib/errorLogStore";
```

Immediately after `const [currentTenant, setCurrentTenant] = useState<Tenant | null>(null);` in `TenantProvider`, add:

```ts
  useEffect(() => {
    setErrorLogTenantId(currentTenant?.id);
  }, [currentTenant]);
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

### Task 7: `DiagnosticsCard` in Settings

**Files:**
- Create: `frontend/src/components/DiagnosticsCard.tsx`
- Modify: `frontend/src/pages/Settings.tsx`

**Interfaces:**
- Consumes: `getErrorLogs`, `clearErrorLogs`, `buildDiagnosticExport`, `ErrorLogEntry` from `frontend/src/lib/errorLogStore.ts` (Task 1); i18n keys from Task 3.

Thin React component (glue over already-tested `errorLogStore` functions) — no dedicated test file, matching `DeviceAuthorizationCard.tsx`'s precedent (also untested).

- [ ] **Step 1: Create the `DiagnosticsCard` component**

Create `frontend/src/components/DiagnosticsCard.tsx`:

```tsx
import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Bug, Download, Trash2, AlertTriangle, RefreshCw } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import {
  buildDiagnosticExport,
  clearErrorLogs,
  getErrorLogs,
  type ErrorLogEntry,
} from "@/lib/errorLogStore";

function downloadDiagnostic(): void {
  const diagnostic = buildDiagnosticExport();
  const blob = new Blob([JSON.stringify(diagnostic, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `stockflow-diagnostic-${new Date()
    .toISOString()
    .replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function DiagnosticsCard() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [logs, setLogs] = useState<ErrorLogEntry[]>(() => getErrorLogs());
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const refreshLogs = () => {
    setLogs(getErrorLogs());
  };

  const handleClearLogs = () => {
    clearErrorLogs();
    setLogs([]);
    setExpandedLogId(null);
    setShowClearConfirm(false);
    toast({ title: t("diagnosticsLogsCleared"), variant: "default" });
  };

  return (
    <Card className="glass-card">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Bug className="h-5 w-5 text-primary" />
            <CardTitle>{t("diagnosticsCardTitle")}</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-refresh-diagnostics"
            onClick={refreshLogs}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t("diagnosticsRefresh")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {t("diagnosticsCardDescription")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {logs.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="diagnostics-empty-state"
          >
            {t("diagnosticsNoRecentErrors")}
          </p>
        ) : (
          <ScrollArea className="h-64 rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("diagnosticsColumnDate")}</TableHead>
                  <TableHead>{t("diagnosticsColumnModule")}</TableHead>
                  <TableHead>{t("diagnosticsColumnMessage")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.slice(0, 20).map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <TableRow
                        className="cursor-pointer"
                        data-testid={`diagnostics-row-${log.id}`}
                        onClick={() =>
                          setExpandedLogId(isExpanded ? null : log.id)
                        }
                      >
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {new Date(log.timestamp).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs">{log.module}</TableCell>
                        <TableCell
                          className="max-w-xs truncate text-xs"
                          title={log.message}
                        >
                          {log.message}
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow data-testid={`diagnostics-row-detail-${log.id}`}>
                          <TableCell colSpan={3} className="space-y-2 bg-muted/30 text-xs">
                            <p className="whitespace-pre-wrap break-words">
                              {log.message}
                            </p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                              <span>
                                {t("diagnosticsDetailDevice")}: {log.deviceId}
                              </span>
                              <span>
                                {t("diagnosticsDetailVersion")}: {log.appVersion}
                              </span>
                              <span>
                                {t("diagnosticsDetailOnline")}:{" "}
                                {log.online
                                  ? t("diagnosticsOnline")
                                  : t("diagnosticsOffline")}
                              </span>
                              {log.tenantId && (
                                <span>
                                  {t("diagnosticsDetailTenant")}: {log.tenantId}
                                </span>
                              )}
                              {log.userId && (
                                <span>
                                  {t("diagnosticsDetailUser")}: {log.userId}
                                </span>
                              )}
                            </div>
                            {log.stack && (
                              <pre className="whitespace-pre-wrap break-words rounded bg-background p-2 text-[11px]">
                                {log.stack}
                              </pre>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            data-testid="button-download-diagnostic"
            onClick={downloadDiagnostic}
          >
            <Download className="h-4 w-4 mr-2" />
            {t("diagnosticsDownload")}
          </Button>
          {!showClearConfirm && (
            <Button
              variant="destructive"
              className="flex-1"
              data-testid="button-clear-diagnostics"
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("diagnosticsClearLogs")}
            </Button>
          )}
        </div>

        {showClearConfirm && (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("areYouSure")}</AlertTitle>
              <AlertDescription>
                {t("diagnosticsClearLogsWarning")}
              </AlertDescription>
            </Alert>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowClearConfirm(false)}
              >
                {t("cancel")}
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                data-testid="button-confirm-clear-diagnostics"
                onClick={handleClearLogs}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t("diagnosticsClearLogs")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

Row detail rendered inline (click a row to expand/collapse) rather than only surfacing full detail through the JSON download — an admin can read the full message, stack trace, device id, app version, online status, and tenant/user directly in Settings without leaving the page.

- [ ] **Step 2: Add the card to Settings**

In `frontend/src/pages/Settings.tsx`, add the import next to the other card component imports:

```ts
import { DiagnosticsCard } from "@/components/DiagnosticsCard";
```

Then render it right after `<DeviceAuthorizationCard />` and before the "Offline Data Management" card comment:

```tsx
      <DeviceAuthorizationCard />

      <DiagnosticsCard />

      {/* Offline Data Management */}
```

- [ ] **Step 3: Type-check the frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Run the full frontend test suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — every existing test still passes, plus the new tests from Tasks 1, 2, 3, and 5.

---

## Final check (after all tasks)

- [ ] Run `cd frontend && npx vitest run` — full suite green.
- [ ] Run `cd frontend && npx tsc --noEmit` — no type errors.
- [ ] Manually smoke-test in the running app: trigger a handled error (e.g. an API call while the backend is stopped) and confirm it shows up in Settings → Diagnostics; click "Download diagnostic" and confirm a `.json` file downloads with the expected shape; click "Clear logs" through the two-step confirm and confirm the list empties.
