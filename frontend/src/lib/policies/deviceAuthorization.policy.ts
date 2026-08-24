import { BasePolicy } from "./base.policy";

export class DeviceAuthorizationPolicy extends BasePolicy {
  canList(): boolean {
    return this.isAdminOrManager();
  }

  canApprove(): boolean {
    return this.isAdmin();
  }

  canRevoke(): boolean {
    return this.isAdmin();
  }
}
