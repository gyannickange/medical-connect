import type { QueryClient } from "@tanstack/react-query";
import { upsertEntityInValue } from "./offlineCacheTransforms";

export interface OfflineMutationDetail {
  collection: string;
  method: string;
  entity: Record<string, unknown>;
}

export function applyOfflineMutationToQueryCache(
  queryClient: QueryClient,
  detail: OfflineMutationDetail
): void {
  if (!detail.entity || !detail.collection) return;

  const prefix = [`/api/${detail.collection}`];
  for (const [queryKey, value] of queryClient.getQueriesData({
    queryKey: prefix,
  })) {
    if (
      detail.method === "POST" &&
      (queryKey.length !== 2 ||
        (typeof detail.entity.tenantId === "string" &&
          queryKey[1] !== detail.entity.tenantId))
    ) {
      continue;
    }
    const updated = upsertEntityInValue(
      value,
      detail.entity,
      detail.method === "POST"
    );
    if (updated.changed) queryClient.setQueryData(queryKey, updated.value);
  }
}
