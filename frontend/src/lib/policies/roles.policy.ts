import { BasePolicy } from "./base.policy";

export class RolesPolicy extends BasePolicy {
  protected readonly module = "roles" as const;

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
