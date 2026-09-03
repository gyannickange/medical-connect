import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class PlatformPolicy extends BasePolicy {
  createTenant(): boolean {
    return this.isPlatformAdmin();
  }
}
