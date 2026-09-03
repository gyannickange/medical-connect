import { BasePolicy } from "./base.policy";

export class ServicesPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
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
