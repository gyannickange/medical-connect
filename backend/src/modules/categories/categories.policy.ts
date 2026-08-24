import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class CategoriesPolicy extends BasePolicy {
  view(): boolean {
    // All roles can view
    return true;
  }

  create(): boolean {
    // Admin and manager can create
    return this.isAdminOrManager();
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

