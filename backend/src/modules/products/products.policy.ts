import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class ProductsPolicy extends BasePolicy {
  view(): boolean {
    return true;
  }

  create(): boolean {
    return this.isAdminOrManager();
  }

  /** Admin/manager can update product (including cost). Cost remains editable even when CMP is active. */
  update(): boolean {
    return this.isAdminOrManager();
  }

  delete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }

  viewCost(): boolean {
    // Only admin can view cost
    return this.isAdmin();
  }
}

