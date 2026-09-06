import { BasePolicy } from "./base.policy";

export class LabOrdersPolicy extends BasePolicy {
  protected readonly module = "labOrders" as const;

  canView(): boolean {
    return this.can("view");
  }

  canCreate(): boolean {
    return this.can("create");
  }

  canUpdate(): boolean {
    return this.can("update");
  }

  canRecordFollowUp(): boolean {
    return this.can("recordFollowUp");
  }
}
