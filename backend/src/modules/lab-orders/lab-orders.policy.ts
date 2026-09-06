import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class LabOrdersPolicy extends BasePolicy {
  protected readonly module = "labOrders" as const;

  view(): Promise<boolean> {
    return this.can("view");
  }

  create(): Promise<boolean> {
    return this.can("create");
  }

  update(): Promise<boolean> {
    return this.can("update");
  }

  recordFollowUp(): Promise<boolean> {
    return this.can("recordFollowUp");
  }
}
