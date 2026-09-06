import { BasePolicy } from "./base.policy";

export class SpecialtiesPolicy extends BasePolicy {
  protected readonly module = "specialties" as const;

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
