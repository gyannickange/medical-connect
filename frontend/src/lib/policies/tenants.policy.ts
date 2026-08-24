import { BasePolicy } from "./base.policy";

export class TenantsPolicy extends BasePolicy {
  canView(): boolean {
    // All roles can view their own tenant
    return true;
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

