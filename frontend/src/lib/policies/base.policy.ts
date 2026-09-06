import type { PermissionsMatrix, UserRole } from "./policy.types";
import type { PermissionModule } from "@shared/schema";

export abstract class BasePolicy {
  protected userRole: UserRole | null;
  protected permissions: PermissionsMatrix | null;
  protected readonly module?: PermissionModule;

  constructor(userRole: UserRole | null, permissions: PermissionsMatrix | null = null) {
    this.userRole = userRole;
    this.permissions = permissions;
  }

  protected can(action: string): boolean {
    if (this.userRole === "admin") return true;
    if (!this.module || !this.permissions) return false;
    return this.permissions[this.module]?.[action] === true;
  }

  protected hasRole(role: UserRole): boolean {
    return this.userRole === role;
  }

  protected hasAnyRole(...roles: UserRole[]): boolean {
    return this.userRole !== null && roles.includes(this.userRole);
  }

  protected isAdmin(): boolean {
    return this.hasRole("admin");
  }
}
