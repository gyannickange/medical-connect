import { describe, expect, it } from "vitest";
import { getNotificationSoundPreset, playNotificationSound, setNotificationSoundPreset } from "./notificationSound";

// This project's vitest config runs with environment: "node" (no jsdom), so
// `window` is genuinely undefined here — these tests exercise the same
// fallback path a non-browser context (e.g. SSR, or a future test runner
// change) would hit, and every function must degrade safely rather than
// throwing.
describe("notificationSound without a window global", () => {
  it("getNotificationSoundPreset falls back to default", () => {
    expect(getNotificationSoundPreset()).toBe("default");
  });

  it("setNotificationSoundPreset does not throw", () => {
    expect(() => setNotificationSoundPreset("chime")).not.toThrow();
  });

  it("playNotificationSound does not throw for a tone preset", () => {
    expect(() => playNotificationSound("chime")).not.toThrow();
  });

  it("playNotificationSound does not throw for the none preset", () => {
    expect(() => playNotificationSound("none")).not.toThrow();
  });
});
