import { BasePolicy } from "./base.policy";

export class AuditPolicy extends BasePolicy {
  canView(): boolean {
    // Only admin can view audit logs
    return this.isAdmin();
  }
}
