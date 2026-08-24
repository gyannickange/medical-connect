import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class TenantsPolicy extends BasePolicy {
  view(): boolean {
    // All roles can view their own tenant
    return true;
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

