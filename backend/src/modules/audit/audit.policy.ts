import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class AuditPolicy extends BasePolicy {
  view(): boolean {
    // Only admin can view audit logs
    return this.isAdmin();
  }
}
