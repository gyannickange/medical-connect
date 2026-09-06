import { BasePolicy } from "./base.policy";

export class DeviceAuthorizationPolicy extends BasePolicy {
  protected readonly module = "deviceAuthorization" as const;

  canList(): boolean {
    return this.can("list");
  }

  canApprove(): boolean {
    return this.can("approve");
  }

  canRevoke(): boolean {
    return this.can("revoke");
  }
}
