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
