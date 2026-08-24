import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class CustomersPolicy extends BasePolicy {
  view(): boolean {
    // All roles can view
    return true;
  }

  create(): boolean {
    // All roles can create
    return true;
  }

  update(): boolean {
    // All roles can update
    return true;
  }

  delete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }
}

