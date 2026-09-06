import { Injectable } from "@nestjs/common";
import type { UserRole, RequestWithUser } from "./policy.types";
import type { PermissionModule, Role } from "@shared/schema";

@Injectable()
export abstract class BasePolicy {
  protected user: RequestWithUser["user"];
  protected readonly module?: PermissionModule;
  private roleResolver?: (tenantId: string, roleId: string) => Promise<Role | null>;

  setUser(user: RequestWithUser["user"]) {
    this.user = user;
  }

  setRoleResolver(resolver: (tenantId: string, roleId: string) => Promise<Role | null>) {
    this.roleResolver = resolver;
  }

  protected async can(action: string): Promise<boolean> {
    if (this.user?.role === "admin") return true;
    if (!this.module || !this.roleResolver || !this.user?.tenantId) return false;
    const role = await this.roleResolver(this.user.tenantId, this.user.role);
    return role?.permissions?.[this.module]?.[action] === true;
  }

  protected hasRole(role: UserRole): boolean {
    return this.user?.role === role;
  }

  protected hasAnyRole(...roles: UserRole[]): boolean {
    return roles.includes(this.user?.role as UserRole);
  }

  protected isPlatformAdmin(): boolean {
    return this.hasRole("platform_admin");
  }
}

