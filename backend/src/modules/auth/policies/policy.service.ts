import { Injectable, Scope } from "@nestjs/common";
import type { Type } from "@nestjs/common";
import type { Role } from "@shared/schema";
import { BasePolicy } from "./base.policy";
import { RolesRepository } from "../../roles/roles.repository";

@Injectable({ scope: Scope.REQUEST })
export class PolicyService {
  private readonly roleCache = new Map<string, Role | null>();

  constructor(private readonly rolesRepository: RolesRepository) {}

  private async resolveRole(tenantId: string, roleId: string): Promise<Role | null> {
    const cacheKey = `${tenantId}:${roleId}`;
    if (!this.roleCache.has(cacheKey)) {
      const role = await this.rolesRepository.findById(roleId, tenantId).catch(() => null);
      this.roleCache.set(cacheKey, role);
    }
    return this.roleCache.get(cacheKey) ?? null;
  }

  /**
   * Creates a new policy instance for each check to prevent race conditions
   * where concurrent requests could overwrite each other's user state.
   */
  private createPolicyInstance<T extends BasePolicy>(policyClass: Type<T>): T {
    const policy = new policyClass();
    policy.setRoleResolver((tenantId, roleId) => this.resolveRole(tenantId, roleId));
    return policy;
  }

  async checkPolicy(
    policyClass: Type<BasePolicy>,
    action: string,
    user: any
  ): Promise<boolean> {
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
