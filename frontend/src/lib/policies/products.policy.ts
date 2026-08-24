import { BasePolicy } from "./base.policy";

export class ProductsPolicy extends BasePolicy {
  canView(): boolean {
    // All roles can view
    return true;
  }

  canCreate(): boolean {
    // Admin and manager can create
    return this.isAdminOrManager();
  }

  canUpdate(): boolean {
    // Admin and manager can update
    return this.isAdminOrManager();
  }

  canDelete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }

  canViewCost(): boolean {
    // Only admin can view cost
    return this.isAdmin();
  }
}

