import { BasePolicy } from "./base.policy";

export class StaffPolicy extends BasePolicy {
  protected readonly module = "staff" as const;

  canView(): boolean {
    return this.can("view");
  }

  canCreate(): boolean {
    return this.can("create");
  }

  canUpdate(): boolean {
    return this.can("update");
  }

  canDelete(): boolean {
    return this.can("delete");
  }
}
