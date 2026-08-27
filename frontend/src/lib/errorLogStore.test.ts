import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  logError,
  getErrorLogs,
  clearErrorLogs,
  buildDiagnosticExport,
  setErrorLogUserId,
  setErrorLogTenantId,
} from "./errorLogStore";

declare const __APP_VERSION__: string;

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

  it("truncates long context string values", () => {
    logError({
      module: "a",
      message: "boom",
      context: { detail: "y".repeat(5000), count: 42, ok: true },
    });
    const entry = getErrorLogs()[0];
    expect(entry.context?.detail).toHaveLength(4000);
    expect(entry.context?.count).toBe(42);
    expect(entry.context?.ok).toBe(true);
  });

  it("retries with a smaller entry set when localStorage write fails", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        // Only simulate quota exhaustion for the error log key — logError()
        // also triggers deviceIdentity's lazy device id/name writes, which
        // store plain (non-JSON) strings under other keys and must succeed.
        if (key === "medicalconnect_error_logs") {
          const count = (JSON.parse(value) as unknown[]).length;
          if (count > 3) {
            throw new Error("QuotaExceededError");
          }
        }
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });

    for (let i = 0; i < 6; i++) {
      logError({ module: "a", message: `error-${i}` });
    }

    const logs = getErrorLogs();
    expect(logs).toHaveLength(2);
    expect(logs[0].message).toBe("error-5");
    expect(logs[1].message).toBe("error-4");
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
