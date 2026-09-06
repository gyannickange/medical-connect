import { BasePolicy } from "./base.policy";

export class ExamTypesPolicy extends BasePolicy {
  protected readonly module = "examTypes" as const;

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
