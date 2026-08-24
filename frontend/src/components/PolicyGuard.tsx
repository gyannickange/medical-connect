import React, { ReactNode } from "react";
import { usePolicy } from "@/hooks/usePolicy";
import { BasePolicy } from "@/lib/policies/base.policy";
import type { UserRole } from "@/lib/policies/policy.types";

interface PolicyGuardProps {
  policy: new (userRole: UserRole | null) => BasePolicy;
  action: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export const PolicyGuard: React.FC<PolicyGuardProps> = ({
  policy,
  action,
  children,
  fallback = null,
}) => {
  const policyInstance = usePolicy(policy);
  const canPerform = (policyInstance as any)[action]?.() ?? false;

  return canPerform ? <>{children}</> : <>{fallback}</>;
};

