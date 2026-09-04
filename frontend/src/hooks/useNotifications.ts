import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { useTenant } from "@/contexts/TenantContext";
import type { AppNotification } from "@shared/schema";

export const useNotifications = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    enabled: Boolean(currentTenant),
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await offlineApiRequest("PATCH", `/api/notifications/${id}/read`, undefined, { collection: "notifications" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    markRead: markReadMutation.mutate,
  };
};
