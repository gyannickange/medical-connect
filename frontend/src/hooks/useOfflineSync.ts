import {
  createContext,
  createElement,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePouchDB } from "../lib/pouchdb";
import { useTenant } from "../contexts/TenantContext";
import { getDeviceId } from "../lib/deviceIdentity";
import { getInstallMode } from "../lib/installMode";
import {
  isOfflineOperationDocument,
  quarantineLegacyOperation,
  replayOfflineOperations,
  type LegacyQueueDocument,
  type OfflineOperationDocument,
  type OfflineOperationDraft,
} from "../lib/offlineOperationQueue";

const useOfflineSyncEngine = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error">(
    "idle"
  );
  const [pendingChanges, setPendingChanges] = useState(0);
  const [conflictChanges, setConflictChanges] = useState(0);
  const syncInFlight = useRef<Promise<void> | null>(null);

  // Initialize PouchDB for offline storage
  const {
    isOnline: pouchOnline,
    syncStatus: pouchSyncStatus,
    initialized,
    put,
    allDocs,
    dbFind,
    startSync,
  } = usePouchDB(`businessconnect_${currentTenant?.id || "default"}`);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      if (currentTenant) {
        updateSyncStatus("online");
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (currentTenant) {
        updateSyncStatus("offline");
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [currentTenant]);

  // A local install never has a server to sync to, by design - neither the
  // CouchDB replication branch nor the manual REST fallback below can ever
  // succeed for it, so both must be treated as unavailable regardless of
  // VITE_COUCHDB_URL. Without this, syncPendingChanges() retries forever
  // against a server that will never exist, permanently marking queued
  // operations "failed" instead of "synced" - so the pending-changes count
  // can never go back down.
  const hasCouchDB =
    Boolean(import.meta.env.VITE_COUCHDB_URL) && getInstallMode() !== "local";
  const hasTriggeredSync = useRef(false);

  useEffect(() => {
    if (isOnline && currentTenant && initialized && !hasTriggeredSync.current) {
      updateSyncStatus("online");

      if (hasCouchDB) {
        // Use PouchDB replication when CouchDB is configured
        console.log("Using PouchDB replication sync");
        startSync();
      } else {
        // Use manual REST queue as fallback when no CouchDB
        console.log("Using manual REST sync (no CouchDB configured)");
        if (pendingChanges > 0) {
          syncPendingChanges();
        }
      }
      hasTriggeredSync.current = true;
    } else if (!isOnline || !currentTenant || !initialized) {
      hasTriggeredSync.current = false;
    }
  }, [isOnline, currentTenant, initialized, pendingChanges]);

  const updateSyncStatus = async (
    status: "online" | "offline" | "syncing" | "error"
  ) => {
    if (!currentTenant || getInstallMode() === "local") return;

    try {
      await fetch("/api/sync/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: currentTenant.id,
          deviceId: getDeviceId(),
          status,
          pendingChanges,
        }),
      });
    } catch (error) {
      console.error("Failed to update sync status:", error);
    }
  };

  const saveToOfflineStorage = async (
    operation: OfflineOperationDraft
  ): Promise<OfflineOperationDocument> => {
    if (!initialized || !currentTenant) {
      throw new Error("Offline operation storage is not initialized");
    }

    const document: OfflineOperationDocument = {
      ...operation,
      _id: `offline_operation_${operation.operationId}`,
      tenantId: currentTenant.id,
      deviceId: getDeviceId(),
    };

    await put(document);
    setPendingChanges((previous) => previous + 1);
    return document;
  };

  const syncPendingChanges = async () => {
    if (!initialized || !isOnline || !currentTenant) return;
    if (getInstallMode() === "local") return;
    if (syncInFlight.current) return syncInFlight.current;

    const syncRun = (async () => {
      setSyncStatus("syncing");

      try {
        const result = await dbFind({
          selector: {
            schemaVersion: 1,
            state: { $in: ["pending", "replaying", "failed"] },
            tenantId: currentTenant.id,
            deviceId: getDeviceId(),
          },
        });

        const operations = (result.docs as unknown[]).filter(
          isOfflineOperationDocument
        );
        const summary = await replayOfflineOperations(
          operations,
          async (operation) => {
            const result = (await put(operation)) as { rev?: string };
            if (result.rev) operation._rev = result.rev;
          }
        );

        setPendingChanges((previous) =>
          Math.max(0, previous - summary.synced)
        );
        setConflictChanges((previous) => previous + summary.conflicts);

        console.log(
          `Sync completed: ${summary.synced} synced, ${summary.conflicts} conflicts, ${summary.failed} failed`
        );

        for (const resource of [
          "products",
          "sales",
          "customers",
          "stock",
          "staff",
          "categories",
          "rayons",
          "suppliers",
          "dashboard",
        ]) {
          queryClient.invalidateQueries({
            queryKey: [`/api/${resource}`, currentTenant.id],
          });
        }

        setSyncStatus("idle");
      } catch (error) {
        console.error("Sync failed:", error);
        setSyncStatus("error");
      } finally {
        syncInFlight.current = null;
      }
    })();

    syncInFlight.current = syncRun;
    return syncRun;
  };

  // Restore pending changes count on initialization
  const restorePendingCount = async () => {
    if (!initialized || !currentTenant) return;

    try {
      const storedDocuments = await allDocs({ include_docs: true });
      for (const row of storedDocuments.rows) {
        const document = row.doc as LegacyQueueDocument | undefined;
        if (
          document?._id?.startsWith("pending_") &&
          !isOfflineOperationDocument(document)
        ) {
          await put(quarantineLegacyOperation(document));
        }
      }

      const result = await dbFind({
        selector: {
          schemaVersion: 1,
          state: { $in: ["pending", "replaying", "failed", "conflict"] },
          tenantId: currentTenant.id,
          deviceId: getDeviceId(),
        },
      });

      const operations = (result.docs as unknown[]).filter(
        isOfflineOperationDocument
      );
      const count = operations.length;
      setPendingChanges(count);
      setConflictChanges(
        operations.filter((operation) => operation.state === "conflict").length
      );

      // If we have pending changes and we're online, sync immediately (only for manual REST mode)
      if (!hasCouchDB && count > 0 && isOnline) {
        syncPendingChanges();
      }
    } catch (error) {
      console.error("Failed to restore pending count:", error);
    }
  };

  // Restore pending count when initialized
  useEffect(() => {
    if (initialized && currentTenant) {
      restorePendingCount();
    }
  }, [initialized, currentTenant]);

  // Refresh cached data when coming back online
  useEffect(() => {
    if (isOnline && initialized) {
      // Invalidate all queries to refresh from server
      console.log("Back online - refreshing cached data");
      queryClient.invalidateQueries();
    }
  }, [isOnline, initialized, queryClient]);

  // Only use manual REST sync when CouchDB is not configured
  useEffect(() => {
    if (!hasCouchDB && isOnline && pendingChanges > 0) {
      syncPendingChanges();
    }
  }, [isOnline, pendingChanges, hasCouchDB]);

  const forceSync = () => {
    if (!isOnline) return;

    if (hasCouchDB) {
      // Force PouchDB sync restart
      startSync();
    } else {
      // Force manual REST sync
      syncPendingChanges();
    }
  };

  // Return appropriate sync status based on sync strategy
  const currentSyncStatus = hasCouchDB ? pouchSyncStatus : syncStatus;

  return {
    isOnline: hasCouchDB ? isOnline && pouchOnline : isOnline,
    syncStatus: currentSyncStatus,
    pendingChanges,
    conflictChanges,
    saveToOfflineStorage,
    forceSync,
    syncStrategy: hasCouchDB ? "pouchdb-replication" : "manual-rest",
  };
};

type OfflineSyncValue = ReturnType<typeof useOfflineSyncEngine>;

const OfflineSyncContext = createContext<OfflineSyncValue | null>(null);

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const value = useOfflineSyncEngine();
  return createElement(OfflineSyncContext.Provider, { value }, children);
}

export function useOfflineSync(): OfflineSyncValue {
  const value = useContext(OfflineSyncContext);
  if (!value) {
    throw new Error("useOfflineSync must be used inside OfflineSyncProvider");
  }
  return value;
}
