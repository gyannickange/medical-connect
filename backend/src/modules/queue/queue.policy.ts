import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class QueuePolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  appendEvent(): boolean {
    return this.view();
  }
}
