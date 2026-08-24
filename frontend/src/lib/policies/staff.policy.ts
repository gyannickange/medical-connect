import { BasePolicy } from "./base.policy";

export class StaffPolicy extends BasePolicy {
  canView(): boolean {
    // Admin and manager can view
    return this.isAdminOrManager();
  }

  canCreate(): boolean {
    // Only admin can create
    return this.isAdmin();
  }

  canUpdate(): boolean {
    // Only admin can update
    return this.isAdmin();
  }

  canDelete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }
}

