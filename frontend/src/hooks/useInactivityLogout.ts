import { useEffect, useRef } from "react";
import { isInactive, INACTIVITY_TIMEOUT_MS } from "@/lib/inactivityTimer";

const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart"] as const;

export function useInactivityLogout(onTimeout: () => void, enabled: boolean): void {
  const lastActivityAt = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    lastActivityAt.current = Date.now();

    const handleActivity = () => {
      lastActivityAt.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity));

    const interval = window.setInterval(() => {
      if (isInactive(lastActivityAt.current, Date.now(), INACTIVITY_TIMEOUT_MS)) {
        onTimeout();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      window.clearInterval(interval);
    };
  }, [enabled, onTimeout]);
}
