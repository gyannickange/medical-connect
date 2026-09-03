import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import type { User } from "@shared/schema";

export function useStaffDirectory() {
  const { currentTenant } = useTenant();
  const { data: staffList = [] } = useQuery<User[]>({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
  return staffList;
}

export function useDoctors() {
  return useStaffDirectory().filter((member) => member.role === "medecin");
}
