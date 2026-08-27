import { BasePolicy } from "./base.policy";

export class LabOrdersPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isLaboratoire();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isLaboratoire();
  }
}
