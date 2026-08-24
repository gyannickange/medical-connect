import { BasePolicy } from "./base.policy";

export class SalesPolicy extends BasePolicy {
  canView(): boolean {
    // All roles can view
    return true;
  }

  canCreate(): boolean {
    // All roles can create
    return true;
  }

  canUpdate(): boolean {
    // Admin and manager can update
    return this.isAdminOrManager();
  }

  canDelete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }
}

