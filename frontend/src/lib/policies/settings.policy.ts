import { BasePolicy } from "./base.policy";

export class SettingsPolicy extends BasePolicy {
  protected readonly module = "settings" as const;

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
