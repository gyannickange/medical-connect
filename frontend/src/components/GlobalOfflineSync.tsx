import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOfflineSync } from "../hooks/useOfflineSync";
import {
  initOfflineStorage,
  OFFLINE_MUTATION_SAVED_EVENT,
} from "../lib/offlineApiRequest";
import {
  applyOfflineMutationToQueryCache,
  type OfflineMutationDetail,
} from "../lib/offlineQueryCache";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

/**
 * Global component that initializes offline sync functionality
 * This should be placed high in the component tree to provide offline capabilities to all components
 */
export const GlobalOfflineSync: React.FC = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { saveToOfflineStorage, isOnline, syncStatus, pendingChanges } =
    useOfflineSync();
  const { toast } = useToast();

  // Initialize the offline storage handler for offlineApiRequest
  useEffect(() => {
    if (saveToOfflineStorage) {
      initOfflineStorage(saveToOfflineStorage);
    }
  }, [saveToOfflineStorage]);

  useEffect(() => {
    const handleOfflineMutation = (event: Event) => {
      const detail = (event as CustomEvent<OfflineMutationDetail>).detail;
      if (detail) applyOfflineMutationToQueryCache(queryClient, detail);
    };

    window.addEventListener(OFFLINE_MUTATION_SAVED_EVENT, handleOfflineMutation);
    return () =>
      window.removeEventListener(
        OFFLINE_MUTATION_SAVED_EVENT,
        handleOfflineMutation
      );
  }, [queryClient]);

  // Show notification when offline with pending changes
  useEffect(() => {
    if (!isOnline && pendingChanges > 0) {
      toast({
        title: t("workingOffline"),
        description: `${pendingChanges} ${t("changesSyncWhenOnline")}`,
        variant: "default",
      });
    }
  }, [isOnline, pendingChanges, toast, t]);

  // Show notification when sync completes
  useEffect(() => {
    if (syncStatus === "idle" && pendingChanges === 0 && isOnline) {
      // Only show if we just completed a sync
      toast({
        title: t("synced"),
        description: t("allChangesSynchronized"),
        variant: "default",
      });
    }
  }, [syncStatus, pendingChanges, isOnline, toast, t]);

  return null; // This component doesn't render anything
};
