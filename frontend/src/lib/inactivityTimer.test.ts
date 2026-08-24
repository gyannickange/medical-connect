import { describe, expect, it } from "vitest";
import { isInactive, INACTIVITY_TIMEOUT_MS } from "./inactivityTimer";

describe("isInactive", () => {
  it("is not inactive right after activity", () => {
    const now = 1_000_000;
    expect(isInactive(now, now)).toBe(false);
  });

  it("is not inactive just under the threshold", () => {
    const now = 1_000_000;
    expect(isInactive(now - (INACTIVITY_TIMEOUT_MS - 1), now)).toBe(false);
  });

  it("is inactive once the threshold is reached", () => {
    const now = 1_000_000;
    expect(isInactive(now - INACTIVITY_TIMEOUT_MS, now)).toBe(true);
  });

  it("is inactive after waking from a long OS suspend", () => {
    const lastActivityAt = 1_000_000;
    const wokeUpAt = lastActivityAt + 3 * 60 * 60 * 1000;
    expect(isInactive(lastActivityAt, wokeUpAt)).toBe(true);
  });

  it("respects a custom timeout", () => {
    const now = 1_000_000;
    expect(isInactive(now - 5000, now, 10_000)).toBe(false);
    expect(isInactive(now - 15_000, now, 10_000)).toBe(true);
  });
});
