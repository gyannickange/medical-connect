import { BasePolicy } from "./base.policy";

export class StockPolicy extends BasePolicy {
  canView(): boolean {
    // All roles can view
    return true;
  }

  canEntry(): boolean {
    // Admin and manager can create stock entries
    return this.isAdminOrManager();
  }

  canExit(): boolean {
    // All roles can create stock exits (sales)
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

