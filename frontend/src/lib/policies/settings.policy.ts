import { BasePolicy } from "./base.policy";

export class SettingsPolicy extends BasePolicy {
  canView(): boolean {
    // Only admin and manager can view settings
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
