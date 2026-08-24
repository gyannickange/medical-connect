import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class DeviceAuthorizationPolicy extends BasePolicy {
  list(): boolean {
    return this.isAdminOrManager();
  }

  approve(): boolean {
    return this.isAdmin();
  }

  revoke(): boolean {
    return this.isAdmin();
  }
}
