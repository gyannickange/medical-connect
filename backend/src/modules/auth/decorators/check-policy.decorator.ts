import { SetMetadata } from "@nestjs/common";
import type { Type } from "@nestjs/common";
import { BasePolicy } from "../policies/base.policy";

export const POLICY_KEY = "policy";

export interface PolicyMetadata {
  policy: Type<BasePolicy>;
  action: string;
}

export const CheckPolicy = (policy: Type<BasePolicy>, action: string) =>
  SetMetadata(POLICY_KEY, { policy, action });

