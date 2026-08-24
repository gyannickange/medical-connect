type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface InitialAdminCredentials {
  username: string;
  password: string;
}

export async function fetchInitialAdminCredentials(): Promise<InitialAdminCredentials | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  return invoke<InitialAdminCredentials | null>("get_initial_admin_credentials");
}
