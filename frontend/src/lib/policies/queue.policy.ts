import { BasePolicy } from "./base.policy";

export class QueuePolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  canAppendEvent(): boolean {
    return this.canView();
  }
}
