const INSTALL_MODE_KEY = "businessconnect_install_mode";

export type InstallMode = "local" | "connected";

export function getInstallMode(): InstallMode | null {
  if (typeof localStorage === "undefined") return null;
  const value = localStorage.getItem(INSTALL_MODE_KEY);
  return value === "local" || value === "connected" ? value : null;
}

export function setInstallMode(mode: InstallMode): void {
  localStorage.setItem(INSTALL_MODE_KEY, mode);
}

export function isDesktopApp(): boolean {
  return typeof window !== "undefined" && !!window.__TAURI__?.core?.invoke;
}

// The browser build is online-only (no OS keyring/local PouchDB device
// key story outside the desktop shell), so it never offers the
// offline/local installation choice - it's implicitly "connected".
export function resolveInstallMode(): InstallMode | null {
  const stored = getInstallMode();
  if (stored) return stored;
  return isDesktopApp() ? null : "connected";
}
