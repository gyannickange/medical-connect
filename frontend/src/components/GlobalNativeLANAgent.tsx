import { useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getDeviceId } from "../lib/deviceIdentity";
import { lanAgent } from "../lib/lanAgent";
import { useNativeLANAgent } from "../hooks/useNativeLANAgent";
import { useQueryClient } from "@tanstack/react-query";
import { refetchLanSharedData } from "@/lib/lanSharedRefresh";
import { getInstallMode } from "@/lib/installMode";

/**
 * Owns the native LAN agent lifecycle. In a regular browser this is a no-op;
 * inside the desktop shell it starts automatically for the authenticated
 * tenant and stops as soon as the session ends.
 */
export function GlobalNativeLANAgent() {
  const { isAuthenticated, isLoading, tenant } = useAuth();
  const { status, peers } = useNativeLANAgent();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isLoading || !lanAgent.isAvailable() || getInstallMode() === "local")
      return;

    let cancelled = false;

    if (!isAuthenticated || !tenant) {
      void lanAgent.stop();
      return;
    }

    void lanAgent
      .enrollAndStart(getDeviceId())
      .then(() => {
        // Authentication may have ended while enrollment was in flight.
        if (cancelled) void lanAgent.stop();
      })
      .catch((reason) => {
        if (!cancelled) {
          console.error("Failed to start the native LAN agent:", reason);
        }
      });

    return () => {
      cancelled = true;
      void lanAgent.stop();
    };
  }, [isAuthenticated, isLoading, tenant?.id]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !status.running ||
      peers.length === 0 ||
      getInstallMode() === "local"
    )
      return;

    let refreshInFlight = false;
    const refreshSharedData = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2_000);
      try {
        await fetch("/api/auth/me", {
          method: "HEAD",
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });
        await refetchLanSharedData(queryClient);
      } catch {
        // The shared API is unavailable; local offline queues remain authoritative.
      } finally {
        window.clearTimeout(timeout);
        refreshInFlight = false;
      }
    };

    void refreshSharedData();
    const timer = window.setInterval(refreshSharedData, 3_000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, peers.length, queryClient, status.running]);

  return null;
}
