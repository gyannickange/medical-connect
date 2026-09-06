import { BasePolicy } from "./base.policy";

export class AuditPolicy extends BasePolicy {
  protected readonly module = "audit" as const;

  canView(): boolean {
    return this.can("view");
  }
}
