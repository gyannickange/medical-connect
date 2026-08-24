import { getDeviceId, getDeviceName } from "./deviceIdentity";

const STORAGE_KEY = "businessconnect_error_logs";
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

function truncateContext(
  context: ErrorLogContext | undefined
): ErrorLogContext | undefined {
  if (!context) return context;
  const truncated: ErrorLogContext = {};
  for (const [key, value] of Object.entries(context)) {
    truncated[key] =
      typeof value === "string" ? value.slice(0, MAX_STACK_LENGTH) : value;
  }
  return truncated;
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
    if (entries.length > 1) {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(entries.slice(0, Math.floor(entries.length / 2)))
        );
      } catch {
        // Still doesn't fit — give up silently, logging must never break the app it diagnoses.
      }
    }
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
      context: truncateContext(input.context),
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
