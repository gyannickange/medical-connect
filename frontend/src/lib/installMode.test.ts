import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInstallMode,
  isDesktopApp,
  resolveInstallMode,
  setInstallMode,
} from "./installMode";

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

describe("installMode", () => {
  it("returns null when nothing is stored", () => {
    stubLocalStorage();
    expect(getInstallMode()).toBeNull();
  });

  it("returns null for a corrupted/unknown stored value", () => {
    const store = stubLocalStorage();
    store.set("businessconnect_install_mode", "garbage");
    expect(getInstallMode()).toBeNull();
  });

  it("persists and reads back the chosen mode", () => {
    stubLocalStorage();
    setInstallMode("local");
    expect(getInstallMode()).toBe("local");
  });

  it("returns null instead of throwing when localStorage is unavailable", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(getInstallMode()).toBeNull();
  });
});

describe("isDesktopApp", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("is false in a plain browser window", () => {
    vi.stubGlobal("window", {});
    expect(isDesktopApp()).toBe(false);
  });

  it("is true when the Tauri invoke bridge is present", () => {
    vi.stubGlobal("window", { __TAURI__: { core: { invoke: vi.fn() } } });
    expect(isDesktopApp()).toBe(true);
  });
});

describe("resolveInstallMode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the stored mode when one was already chosen, even in the browser", () => {
    stubLocalStorage();
    vi.stubGlobal("window", {});
    setInstallMode("local");
    expect(resolveInstallMode()).toBe("local");
  });

  it("defaults an unset browser install to connected", () => {
    stubLocalStorage();
    vi.stubGlobal("window", {});
    expect(resolveInstallMode()).toBe("connected");
  });

  it("leaves an unset desktop install unresolved so the setup screen shows", () => {
    stubLocalStorage();
    vi.stubGlobal("window", { __TAURI__: { core: { invoke: vi.fn() } } });
    expect(resolveInstallMode()).toBeNull();
  });
});
