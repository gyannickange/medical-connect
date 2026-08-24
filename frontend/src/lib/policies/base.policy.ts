import type { UserRole } from "./policy.types";

export abstract class BasePolicy {
  protected userRole: UserRole | null;

  constructor(userRole: UserRole | null) {
    this.userRole = userRole;
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

  protected isManager(): boolean {
    return this.hasRole("manager");
  }

  protected isCashier(): boolean {
    return this.hasRole("cashier");
  }

  protected isAdminOrManager(): boolean {
    return this.hasAnyRole("admin", "manager");
  }
}
