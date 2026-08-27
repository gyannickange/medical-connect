import { BasePolicy } from "./base.policy";

export class ConsultationsPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isMedecin();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier();
  }
}
