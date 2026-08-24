import { logError } from "./errorLogStore";

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface NormalizedApiError {
  message: string;
  status?: number;
  errors: ApiFieldError[];
  isNetworkError: boolean;
}

const INTERNAL_MESSAGE_PATTERN = /(?:\bat\s+\S+\s*\(|\n\s*at\s|stack|query failed|internal server)/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value.trim();
  if (!message || INTERNAL_MESSAGE_PATTERN.test(message)) return undefined;
  return message;
}

function fieldErrors(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const field = safeMessage(item.field ?? item.property);
    const message = safeMessage(item.message);
    return field && message ? [{ field, message }] : [];
  });
}

function isNetworkFailure(error: unknown): boolean {
  if (error instanceof TypeError) return true;
  return (
    isRecord(error) &&
    typeof error.name === "string" &&
    ["NetworkError", "AbortError", "TimeoutError"].includes(error.name)
  );
}

function fromPayload(
  payload: unknown,
  fallbackMessage: string,
  status?: number
): NormalizedApiError {
  if (!isRecord(payload)) {
    return {
      message: safeMessage(payload) ?? fallbackMessage,
      status,
      errors: [],
      isNetworkError: false,
    };
  }

  const errors = fieldErrors(payload.errors);
  const message = safeMessage(payload.message) ?? safeMessage(payload.error);

  return {
    message: message ?? fallbackMessage,
    status:
      typeof payload.statusCode === "number" ? payload.statusCode : status,
    errors,
    isNetworkError: false,
  };
}

/** Normalize HTTP, API, network, and unknown failures before rendering them. */
export async function normalizeApiError(
  error: unknown,
  fallbackMessage: string = "An error occurred",
  networkFallbackMessage: string = fallbackMessage
): Promise<NormalizedApiError> {
  if (error instanceof Response) {
    const status = error.status;
    const text = await error.text().catch(() => "");
    if (!text) return fromPayload(undefined, fallbackMessage, status);

    try {
      return fromPayload(JSON.parse(text), fallbackMessage, status);
    } catch {
      return fromPayload(text, fallbackMessage, status);
    }
  }

  if (isNetworkFailure(error)) {
    return {
      message: networkFallbackMessage,
      errors: [],
      isNetworkError: true,
    };
  }

  if (error instanceof Error) {
    return fromPayload(
      {
        message: error.message,
        ...("statusCode" in error ? { statusCode: error.statusCode } : {}),
        ...("errors" in error ? { errors: error.errors } : {}),
      },
      fallbackMessage
    );
  }

  return fromPayload(error, fallbackMessage);
}

function readableFieldName(field: string): string {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (character) => character.toUpperCase())
    .trim();
}

export function formatNormalizedApiError(error: NormalizedApiError): string {
  if (error.errors.length === 0) return error.message;
  return error.errors
    .map(({ field, message }) => `${readableFieldName(field)}: ${message}`)
    .join("\n");
}

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
