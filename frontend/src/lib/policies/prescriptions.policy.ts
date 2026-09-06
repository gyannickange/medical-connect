import { BasePolicy } from "./base.policy";

export class PrescriptionsPolicy extends BasePolicy {
  protected readonly module = "prescriptions" as const;

  canView(): boolean {
    return this.can("view");
  }

  canCreate(): boolean {
    return this.can("create");
  }

  canUpdate(): boolean {
    return this.can("update");
  }
}
