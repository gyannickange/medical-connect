import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeviceId, getDeviceName } from "./deviceIdentity";

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  });
  return store;
}

describe("getDeviceName", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("derives a readable name from the device id and persists it", () => {
    const deviceId = getDeviceId();
    const name = getDeviceName();

    expect(name).toMatch(/^Caisse-[A-Z0-9]{4}$/);
    expect(name.slice(-4)).toBe(
      deviceId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase()
    );
    expect(getDeviceName()).toBe(name);
  });

  it("reuses a name already stored in localStorage", () => {
    const store = stubLocalStorage();
    store.set("businessconnect_device_id", "device-fixed");
    store.set("businessconnect_device_name", "Caisse Accueil");

    expect(getDeviceName()).toBe("Caisse Accueil");
  });
});
