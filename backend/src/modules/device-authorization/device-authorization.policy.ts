import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class DeviceAuthorizationPolicy extends BasePolicy {
  protected readonly module = "deviceAuthorization" as const;

  list(): Promise<boolean> {
    return this.can("list");
  }

  approve(): Promise<boolean> {
    return this.can("approve");
  }

  revoke(): Promise<boolean> {
    return this.can("revoke");
  }
}
