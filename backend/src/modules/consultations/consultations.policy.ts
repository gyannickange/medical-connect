import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class ConsultationsPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  create(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isMedecin();
  }

  update(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier();
  }

  cancel(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }
}
