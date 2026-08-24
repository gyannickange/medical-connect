import type { QueryClient } from "@tanstack/react-query";

export const LAN_SHARED_QUERY_RESOURCES = [
  "products",
  "stock",
  "dashboard",
  "sales",
] as const;

export async function refetchLanSharedData(
  queryClient: QueryClient
): Promise<void> {
  await Promise.all(
    LAN_SHARED_QUERY_RESOURCES.map((resource) =>
      queryClient.refetchQueries({
        queryKey: [`/api/${resource}`],
        type: "active",
      })
    )
  );
}
