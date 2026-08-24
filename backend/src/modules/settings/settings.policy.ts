import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class SettingsPolicy extends BasePolicy {
  view(): boolean {
    // Only admin and manager can view settings
    return this.isAdminOrManager();
  }

  create(): boolean {
    // Only admin can create
    return this.isAdmin();
  }

  update(): boolean {
    // Only admin can update
    return this.isAdmin();
  }

  delete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }
}
