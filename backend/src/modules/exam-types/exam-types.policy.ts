import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class ExamTypesPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isLaboratoire();
  }

  create(): boolean {
    return this.isAdminOrManager();
  }

  update(): boolean {
    return this.isAdminOrManager();
  }

  delete(): boolean {
    return this.isAdminOrManager();
  }
}
