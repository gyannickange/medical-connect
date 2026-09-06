import { BasePolicy } from "./base.policy";

export class ConsultationsPolicy extends BasePolicy {
  protected readonly module = "consultations" as const;

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
