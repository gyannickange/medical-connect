import { BasePolicy } from "./base.policy";

export class ServicesPolicy extends BasePolicy {
  protected readonly module = "services" as const;

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
