export const OFFLINE_OPERATION_SCHEMA_VERSION = 1 as const;

export type OfflineMethod = "POST" | "PUT" | "PATCH" | "DELETE";
export type OfflineOperationState =
  | "pending"
  | "replaying"
  | "synced"
  | "conflict"
  | "failed"
  | "quarantined";

export interface OfflineOperationDraft {
  schemaVersion: typeof OFFLINE_OPERATION_SCHEMA_VERSION;
  operationId: string;
  method: OfflineMethod;
  url: string;
  collection: string;
  entityId: string | null;
  payload: unknown | null;
  createdAt: string;
  retryCount: number;
  lastError: string | null;
  state: OfflineOperationState;
}

export interface OfflineOperationDocument extends OfflineOperationDraft {
  _id: string;
  _rev?: string;
  tenantId: string;
  deviceId: string;
  state: OfflineOperationState;
}

export interface LegacyQueueDocument {
  _id: string;
  _rev?: string;
  type?: string;
  data?: unknown;
  timestamp?: number;
  synced?: boolean;
  tenantId?: string;
  deviceId?: string;
  [key: string]: unknown;
}

export type PersistOperation = (
  operation: OfflineOperationDocument
) => Promise<unknown>;

export interface ReplaySummary {
  synced: number;
  conflicts: number;
  failed: number;
}

function randomOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // Keep client-generated entity IDs compatible with backend @IsUUID
  // validation, including browsers without crypto.randomUUID().
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

let lastCreatedAt = 0;

function nextCreatedAt(): string {
  const now = Date.now();
  lastCreatedAt = Math.max(now, lastCreatedAt + 1);
  return new Date(lastCreatedAt).toISOString();
}

export function extractEntityId(url: string): string | null {
  const pathname = url.split(/[?#]/, 1)[0];
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 3) return null;

  const lastSegment = segments[segments.length - 1];
  if (["entry", "exit", "variants"].includes(lastSegment)) {
    return segments.length > 3 ? segments[segments.length - 2] : null;
  }

  return decodeURIComponent(lastSegment);
}

export function createOfflineOperation(
  method: OfflineMethod,
  url: string,
  collection: string,
  payload: unknown,
  entityId?: string
): OfflineOperationDraft {
  const operationId = randomOperationId();
  const payloadRecord =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  const acceptsClientId = [
    "products",
    "categories",
    "rayons",
    "customers",
    "suppliers",
    "staff",
    "sales",
    "settings",
    "audit-logs",
  ].includes(collection);
  const nestedSale =
    collection === "sales" &&
    payloadRecord?.sale &&
    typeof payloadRecord.sale === "object" &&
    !Array.isArray(payloadRecord.sale)
      ? (payloadRecord.sale as Record<string, unknown>)
      : null;
  const createEntityId =
    method === "POST" && acceptsClientId
      ? entityId ??
        (typeof (nestedSale ?? payloadRecord)?.id === "string"
          ? String((nestedSale ?? payloadRecord)?.id)
          : operationId)
      : null;
  const normalizedPayload =
    createEntityId && nestedSale && payloadRecord
      ? { ...payloadRecord, sale: { ...nestedSale, id: createEntityId } }
      : createEntityId && payloadRecord && typeof payloadRecord.id !== "string"
        ? { ...payloadRecord, id: createEntityId }
      : payload ?? null;

  return {
    schemaVersion: OFFLINE_OPERATION_SCHEMA_VERSION,
    operationId,
    method,
    url,
    collection,
    entityId:
      createEntityId ??
      entityId ??
      (method === "POST" ? null : extractEntityId(url)),
    payload: normalizedPayload,
    createdAt: nextCreatedAt(),
    retryCount: 0,
    lastError: null,
    state: "pending",
  };
}

export function isOfflineOperationDocument(
  value: unknown
): value is OfflineOperationDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<OfflineOperationDocument>;
  return (
    document.schemaVersion === OFFLINE_OPERATION_SCHEMA_VERSION &&
    typeof document._id === "string" &&
    typeof document.operationId === "string" &&
    ["POST", "PUT", "PATCH", "DELETE"].includes(document.method ?? "") &&
    typeof document.url === "string" &&
    typeof document.collection === "string" &&
    typeof document.tenantId === "string" &&
    typeof document.deviceId === "string" &&
    typeof document.createdAt === "string" &&
    typeof document.retryCount === "number" &&
    typeof document.state === "string"
  );
}

/**
 * Old queue records did not retain the original method or URL, so replaying
 * them would risk applying the wrong mutation. They are retained verbatim and
 * marked as quarantined for inspection instead of being discarded.
 */
export function quarantineLegacyOperation(
  legacy: LegacyQueueDocument
): OfflineOperationDocument & { legacyRecord: LegacyQueueDocument } {
  const operationId = `legacy_${legacy._id}`;
  const createdAt = new Date(legacy.timestamp ?? Date.now()).toISOString();

  return {
    ...legacy,
    _id: legacy._id,
    _rev: legacy._rev,
    schemaVersion: OFFLINE_OPERATION_SCHEMA_VERSION,
    operationId,
    method: "POST",
    url: "",
    collection: legacy.type ?? "unknown",
    entityId: null,
    payload: legacy.data ?? null,
    tenantId: legacy.tenantId ?? "unknown",
    deviceId: legacy.deviceId ?? "unknown",
    createdAt,
    retryCount: 0,
    lastError:
      "Legacy queue record quarantined: original HTTP method and URL are unavailable.",
    state: "quarantined",
    legacyRecord: { ...legacy },
  };
}

async function responseError(response: Response): Promise<string> {
  try {
    return (await response.text()) || `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

function requestInit(operation: OfflineOperationDocument): RequestInit {
  const hasPayload = operation.payload !== null;
  return {
    method: operation.method,
    credentials: "include",
    headers: {
      ...(hasPayload ? { "Content-Type": "application/json" } : {}),
      "Idempotency-Key": operation.operationId,
      "X-Operation-Id": operation.operationId,
    },
    ...(hasPayload ? { body: JSON.stringify(operation.payload) } : {}),
  };
}

/** Replay pending operations serially so creation order is deterministic. */
export async function replayOfflineOperations(
  operations: OfflineOperationDocument[],
  persist: PersistOperation,
  request: typeof fetch = fetch
): Promise<ReplaySummary> {
  const summary: ReplaySummary = { synced: 0, conflicts: 0, failed: 0 };
  const appliedOperationIds = new Set(
    operations
      .filter((operation) => operation.state === "synced")
      .map((operation) => operation.operationId)
  );

  const replayable = operations
    .filter((operation) =>
      ["pending", "replaying", "failed"].includes(operation.state)
    )
    .sort(
      (left, right) =>
        left.createdAt.localeCompare(right.createdAt) ||
        left.operationId.localeCompare(right.operationId)
    );

  for (const operation of replayable) {
    if (appliedOperationIds.has(operation.operationId)) {
      operation.state = "synced";
      operation.lastError = null;
      await persist(operation);
      continue;
    }

    operation.state = "replaying";

    try {
      const response = await request(operation.url, requestInit(operation));

      if (response.ok || (operation.method === "DELETE" && response.status === 404)) {
        operation.state = "synced";
        operation.lastError = null;
        appliedOperationIds.add(operation.operationId);
        await persist(operation);
        summary.synced += 1;
        continue;
      }

      operation.retryCount += 1;
      operation.lastError = await responseError(response);

      if (response.status === 409) {
        operation.state = "conflict";
        summary.conflicts += 1;
      } else {
        operation.state = "failed";
        summary.failed += 1;
      }
      await persist(operation);
    } catch (error) {
      operation.retryCount += 1;
      operation.lastError =
        error instanceof Error ? error.message : "Unknown replay error";
      operation.state = "pending";
      await persist(operation);
      summary.failed += 1;
    }
  }

  return summary;
}
