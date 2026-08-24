import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

/**
 * Stock entry is admin/manager only. Cashiers cannot perform stock entry.
 */
@Injectable()
export class StockPolicy extends BasePolicy {
  view(): boolean {
    return true;
  }

  /** Admin/manager only. */
  entry(): boolean {
    return this.isAdminOrManager();
  }

  exit(): boolean {
    return true;
  }

  update(): boolean {
    // Admin and manager can update
    return this.isAdminOrManager();
  }

  delete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }
}

