export type ConnectivityState = "internet" | "lan" | "offline" | "local";

/**
 * A "local" install never talks to a server by design (see
 * docs/superpowers/specs/2026-08-15-offline-authentication-design.md) - real
 * Internet/LAN reachability is irrelevant to it and must not be reported as
 * "Internet available", which would wrongly imply the app is about to sync.
 */
export function classifyConnectivity(
  localNetworkAvailable: boolean,
  internetAvailable: boolean,
  isLocalInstall = false
): ConnectivityState {
  if (isLocalInstall) return "local";
  if (internetAvailable) return "internet";
  if (localNetworkAvailable) return "lan";
  return "offline";
}
