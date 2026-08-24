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
