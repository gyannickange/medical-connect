import { BasePolicy } from "./base.policy";

export class RoomsPolicy extends BasePolicy {
  canView(): boolean {
    return this.hasAnyRole("admin", "manager", "medecin", "infirmier", "accueil");
  }

  canCreate(): boolean {
    return this.isAdminOrManager();
  }

  canUpdate(): boolean {
    return this.isAdminOrManager();
  }
}
