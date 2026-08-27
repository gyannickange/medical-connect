import { BasePolicy } from "./base.policy";

export class PrescriptionsPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isPharmacien();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isPharmacien();
  }
}
