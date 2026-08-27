import { BasePolicy } from "./base.policy";

export class PatientsPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }
}
