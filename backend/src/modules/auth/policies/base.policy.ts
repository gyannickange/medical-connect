import { Injectable } from "@nestjs/common";
import type { UserRole, RequestWithUser } from "./policy.types";

@Injectable()
export abstract class BasePolicy {
  protected user: RequestWithUser["user"];

  setUser(user: RequestWithUser["user"]) {
    this.user = user;
  }

  protected hasRole(role: UserRole): boolean {
    return this.user?.role === role;
  }

  protected hasAnyRole(...roles: UserRole[]): boolean {
    return roles.includes(this.user?.role as UserRole);
  }

  protected isAdmin(): boolean {
    return this.hasRole("admin");
  }

  protected isManager(): boolean {
    return this.hasRole("manager");
  }

  protected isCashier(): boolean {
    return this.hasRole("cashier");
  }

  protected isAccueil(): boolean {
    return this.hasRole("accueil");
  }

  protected isInfirmier(): boolean {
    return this.hasRole("infirmier");
  }

  protected isMedecin(): boolean {
    return this.hasRole("medecin");
  }

  protected isLaboratoire(): boolean {
    return this.hasRole("laboratoire");
  }

  protected isPharmacien(): boolean {
    return this.hasRole("pharmacien");
  }

  protected isPlatformAdmin(): boolean {
    return this.hasRole("platform_admin");
  }

  protected isAdminOrManager(): boolean {
    return this.hasAnyRole("admin", "manager");
  }
}

