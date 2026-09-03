import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class TenantsPolicy extends BasePolicy {
  view(): boolean {
    // All roles can view their own tenant
    return true;
  }

  create(): boolean {
    // Only a platform admin can create a tenant
    return this.isPlatformAdmin();
  }

  update(): boolean {
    // Only a platform admin can update a tenant
    return this.isPlatformAdmin();
  }

  delete(): boolean {
    // Only a platform admin can delete a tenant
    return this.isPlatformAdmin();
  }
}

