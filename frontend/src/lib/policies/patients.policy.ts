import { BasePolicy } from "./base.policy";

export class PatientsPolicy extends BasePolicy {
  protected readonly module = "patients" as const;

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
