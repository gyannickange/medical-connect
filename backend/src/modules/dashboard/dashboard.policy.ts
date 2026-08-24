import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class DashboardPolicy extends BasePolicy {
  view(): boolean {
    // All roles can view (with role-based data filtering)
    return true;
  }
}

