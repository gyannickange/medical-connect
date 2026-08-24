export const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

export function isInactive(
  lastActivityAt: number,
  now: number,
  timeoutMs: number = INACTIVITY_TIMEOUT_MS
): boolean {
  return now - lastActivityAt >= timeoutMs;
}
