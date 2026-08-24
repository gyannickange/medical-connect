import { BasePolicy } from "./base.policy";

export class CustomersPolicy extends BasePolicy {
  canView(): boolean {
    // All roles can view
    return true;
  }

  canCreate(): boolean {
    // All roles can create
    return true;
  }

  canUpdate(): boolean {
    // All roles can update
    return true;
  }

  canDelete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }
}

