import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import type { UserRole } from "@/lib/policies/policy.types";
import { BasePolicy } from "@/lib/policies/base.policy";

export function usePolicy<T extends BasePolicy>(
  PolicyClass: new (userRole: UserRole | null) => T
): T {
  const { user } = useAuth();
  const userRole = (user?.role as UserRole | null) || null;

  return useMemo(() => {
    return new PolicyClass(userRole);
  }, [PolicyClass, userRole]);
}

export function useCan(
  PolicyClass: new (userRole: UserRole | null) => BasePolicy,
  action: string
): boolean {
  const policy = usePolicy(PolicyClass);
  return (policy as any)[action]?.() ?? false;
}

