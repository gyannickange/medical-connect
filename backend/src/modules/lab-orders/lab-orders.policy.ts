import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class LabOrdersPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isLaboratoire();
  }

  create(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }

  update(): boolean {
    return this.isAdmin() || this.isManager() || this.isLaboratoire();
  }
}
