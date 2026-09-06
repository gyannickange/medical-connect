import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import type { PermissionsMatrix } from "@/lib/policies/policy.types";

export function useMyPermissions() {
  const { user } = useAuth();

  return useQuery<PermissionsMatrix>({
    queryKey: ["/api/roles/mine", user?.id],
    queryFn: async () => {
      const response = await fetch("/api/roles/mine", { credentials: "include" });
      return response.json();
    },
    enabled: !!user,
  });
}
