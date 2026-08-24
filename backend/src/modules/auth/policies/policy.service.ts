import { Injectable, Scope } from "@nestjs/common";
import type { Type } from "@nestjs/common";
import { BasePolicy } from "./base.policy";

@Injectable({ scope: Scope.REQUEST })
export class PolicyService {
  constructor() {}

  /**
   * Creates a new policy instance for each request to avoid race conditions.
   * Since policies don't have dependencies and only contain role-checking logic,
   * creating new instances is safe and ensures request isolation.
   */
  private createPolicyInstance<T extends BasePolicy>(policyClass: Type<T>): T {
    return new policyClass();
  }

  async checkPolicy(
    policyClass: Type<BasePolicy>,
    action: string,
    user: any
  ): Promise<boolean> {
    // Create a new policy instance for each check to prevent race conditions
    // where concurrent requests could overwrite each other's user state
    const policy = this.createPolicyInstance(policyClass);
    policy.setUser(user);

    if (typeof (policy as any)[action] !== "function") {
      throw new Error(
        `Policy ${policyClass.name} does not have action ${action}`
      );
    }

    const result = await (policy as any)[action]();
    return result === true || result === undefined;
  }
}
