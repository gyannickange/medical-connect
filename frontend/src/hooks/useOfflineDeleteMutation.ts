import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  isSavedOfflineResponse,
  offlineApiRequest,
} from "@/lib/offlineApiRequest";
import { removeEntityFromValue } from "@/lib/offlineCacheTransforms";
import { createErrorToast } from "@/lib/errorHandler";

export interface OfflineDeleteMessages {
  online: string;
  queued: string;
  error: string;
  successTitle: string;
  queuedTitle: string;
  errorTitle: string;
  networkError?: string;
}

export interface OfflineDeleteConfig {
  collection: string;
  queryKey: QueryKey;
  entityUrl: (entityId: string) => string;
  messages: OfflineDeleteMessages;
}

interface DeleteContext {
  snapshots: Array<[QueryKey, unknown]>;
}

type Notify = (options: {
  title: string;
  description: string;
  variant?: "default" | "destructive" | "success";
}) => void;

export function createOfflineDeleteMutationOptions(
  config: OfflineDeleteConfig,
  queryClient: QueryClient,
  notify: Notify
) {
  return {
    mutationFn: async (entityId: string) =>
      offlineApiRequest("DELETE", config.entityUrl(entityId), undefined, {
        collection: config.collection,
        entityId,
      }),
    onMutate: async (entityId: string): Promise<DeleteContext> => {
      await queryClient.cancelQueries({ queryKey: config.queryKey });
      const snapshots = queryClient.getQueriesData({ queryKey: config.queryKey });

      for (const [queryKey, value] of snapshots) {
        const updated = removeEntityFromValue(value, entityId);
        if (updated.changed) queryClient.setQueryData(queryKey, updated.value);
      }

      return { snapshots };
    },
    onSuccess: (response: Response | { _savedOffline?: true }, _entityId: string) => {
      const queued = isSavedOfflineResponse(response);
      notify({
        title: queued ? config.messages.queuedTitle : config.messages.successTitle,
        description: queued ? config.messages.queued : config.messages.online,
        variant: "success",
      });
    },
    onError: async (error: unknown, _entityId: string, context?: DeleteContext) => {
      for (const [queryKey, value] of context?.snapshots ?? []) {
        queryClient.setQueryData(queryKey, value);
      }
      notify(
        await createErrorToast(
          error,
          config.messages.errorTitle,
          config.messages.error,
          config.messages.networkError ?? config.messages.error
        )
      );
    },
    onSettled: (
      response: Response | { _savedOffline?: true } | undefined,
      error: unknown
    ) => {
      if (!error && response && !isSavedOfflineResponse(response)) {
        return queryClient.invalidateQueries({ queryKey: config.queryKey });
      }
    },
  };
}

export function useOfflineDeleteMutation(config: OfflineDeleteConfig) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation(
    createOfflineDeleteMutationOptions(config, queryClient, toast)
  );
}
