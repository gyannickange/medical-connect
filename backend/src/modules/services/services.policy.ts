import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class ServicesPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  create(): boolean {
    return this.isAdminOrManager();
  }

  update(): boolean {
    return this.isAdminOrManager();
  }
}
