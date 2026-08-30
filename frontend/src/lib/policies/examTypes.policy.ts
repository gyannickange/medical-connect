import { BasePolicy } from "./base.policy";

export class ExamTypesPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isLaboratoire();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager();
  }

  canDelete(): boolean {
    return this.isAdmin() || this.isManager();
  }
}
