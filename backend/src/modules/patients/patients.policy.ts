import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class PatientsPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  create(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }

  update(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }
}
