import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { createPouchDB } from "@/lib/pouchdb";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useTranslation } from "@/lib/i18n";
import { isNotificationDoc, notificationBody, notificationTitle } from "@/lib/notifications";
import { playNotificationSound } from "@/lib/notificationSound";

// `withGlobalTauri: true` in tauri.conf.json guarantees `window.__TAURI__`
// exists inside the desktop shell and nowhere else, so this is a reliable
// way to tell the Tauri build apart from the same bundle opened in a plain
// browser tab (e.g. a central-server web deployment).
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

async function notifyOS(title: string, body: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      if (granted) sendNotification({ title, body });
    } catch (error) {
      console.error("Failed to show native notification:", error);
    }
    return;
  }

  // Browser fallback: the standard Web Notifications API. No service worker,
  // no push subscription, no third-party service — just the browser's own
  // OS-level toast. Only fires while the tab is open (a closed tab stops all
  // JS, so there is no way to deliver anything after that without a real
  // push service, which this feature deliberately does not use).
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission === "granted") {
      new Notification(title, { body });
    }
  } catch (error) {
    console.error("Failed to show browser notification:", error);
  }
}

export const useNotificationSignal = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const changesRef = useRef<PouchDB.Core.Changes<any> | null>(null);

  useEffect(() => {
    if (!user || !currentTenant) return;
    let cancelled = false;

    const start = async () => {
      const db = await createPouchDB(`medicalconnect_${currentTenant.id}`);
      if (cancelled) return;

      const changes = (db as any).changes({ since: "now", live: true, include_docs: true });
      changesRef.current = changes;
      changes.on("change", (change: any) => {
        const doc = change.doc;
        if (!isNotificationDoc(doc, user.id)) return;
        notifyOS(notificationTitle(t, doc), notificationBody(t, doc));
        playNotificationSound();
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      });
    };

    start();

    return () => {
      cancelled = true;
      changesRef.current?.cancel();
      changesRef.current = null;
    };
  }, [user, currentTenant, t, queryClient]);
};
