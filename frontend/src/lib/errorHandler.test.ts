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

describe("normalizeApiError", () => {
  it("parses a thrown Response JSON body", async () => {
    const result = await normalizeApiError(
      new Response(JSON.stringify({ message: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }),
      "Fallback"
    );
    expect(result).toMatchObject({ message: "Forbidden", status: 403 });
  });

  it("preserves field-level validation errors", async () => {
    const result = await normalizeApiError({
      message: "Validation failed",
      errors: [{ field: "firstName", message: "is required" }],
    });
    expect(result.errors).toEqual([
      { field: "firstName", message: "is required" },
    ]);
    expect(formatNormalizedApiError(result)).toBe("First Name: is required");
  });

  it("handles text and non-JSON HTTP bodies", async () => {
    const result = await normalizeApiError(
      new Response("Service unavailable", { status: 503 }),
      "Fallback"
    );
    expect(result).toMatchObject({ message: "Service unavailable", status: 503 });
  });

  it("maps network failures to fallback copy", async () => {
    const result = await normalizeApiError(
      new TypeError("Failed to fetch"),
      "Save failed",
      "Check your connection"
    );
    expect(result).toMatchObject({
      message: "Check your connection",
      isNetworkError: true,
    });
  });

  it("does not expose stack traces or raw internal objects", async () => {
    const stack = await normalizeApiError(
      new Error("Internal Server Error\n    at secret/file.ts:1:1"),
      "Safe fallback"
    );
    const raw = await normalizeApiError({ secret: { token: "hidden" } }, "Safe fallback");
    expect(stack.message).toBe("Safe fallback");
    expect(raw.message).toBe("Safe fallback");
    expect(JSON.stringify(raw)).not.toContain("hidden");
  });
});

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
