import React from "react";
import { Button, ButtonProps } from "@/components/ui/button";
import { usePolicy } from "@/hooks/usePolicy";
import { BasePolicy } from "@/lib/policies/base.policy";
import type { UserRole } from "@/lib/policies/policy.types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PolicyButtonProps extends ButtonProps {
  policy: new (userRole: UserRole | null) => BasePolicy;
  action: string;
  disabledTooltip?: string;
  hideWhenDisabled?: boolean;
  children: React.ReactNode;
}

export const PolicyButton: React.FC<PolicyButtonProps> = ({
  policy,
  action,
  disabledTooltip,
  hideWhenDisabled = false,
  children,
  disabled,
  ...buttonProps
}) => {
  const policyInstance = usePolicy(policy);
  const canPerform = (policyInstance as any)[action]?.() ?? false;
  const isDisabled = disabled || !canPerform;

  if (!canPerform && hideWhenDisabled) {
    return null;
  }

  const button = (
    <Button {...buttonProps} disabled={isDisabled}>
      {children}
    </Button>
  );

  if (isDisabled && disabledTooltip) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent>{disabledTooltip}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return button;
};

