import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class RoomsPolicy extends BasePolicy {
  view(): boolean {
    return this.hasAnyRole("admin", "manager", "medecin", "infirmier", "accueil");
  }

  create(): boolean {
    return this.isAdminOrManager();
  }

  update(): boolean {
    return this.isAdminOrManager();
  }
}
