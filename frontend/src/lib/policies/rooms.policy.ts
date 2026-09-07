import { BasePolicy } from "./base.policy";

export class RoomsPolicy extends BasePolicy {
  protected readonly module = "rooms" as const;

  canView(): boolean {
    return this.can("view");
  }

  canCreate(): boolean {
    return this.can("create");
  }

  canUpdate(): boolean {
    return this.can("update");
  }

  canAssign(): boolean {
    return this.can("assign");
  }

  canRelease(): boolean {
    return this.can("release");
  }
}
