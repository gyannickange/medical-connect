import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { PermissionsMatrix, UserRole } from "@/lib/policies/policy.types";
import { BasePolicy } from "@/lib/policies/base.policy";
import { useMyPermissions } from "./useMyPermissions";

export function usePolicy<T extends BasePolicy>(
  PolicyClass: new (userRole: UserRole | null, permissions?: PermissionsMatrix | null) => T
): T {
  const { user } = useAuth();
  const userRole = (user?.role as UserRole | null) || null;
  const { data: permissions } = useMyPermissions();

  return useMemo(() => {
    return new PolicyClass(userRole, permissions ?? null);
  }, [PolicyClass, userRole, permissions]);
}

export function useCan(
  PolicyClass: new (userRole: UserRole | null, permissions?: PermissionsMatrix | null) => BasePolicy,
  action: string
): boolean {
  const policy = usePolicy(PolicyClass);
  return (policy as any)[action]?.() ?? false;
}
