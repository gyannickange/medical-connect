import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class AuditPolicy extends BasePolicy {
  protected readonly module = "audit" as const;

  view(): Promise<boolean> {
    return this.can("view");
  }
}
