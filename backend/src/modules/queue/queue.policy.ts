import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class QueuePolicy extends BasePolicy {
  protected readonly module = "queue" as const;

  view(): Promise<boolean> {
    return this.can("view");
  }

  appendEvent(): Promise<boolean> {
    return this.can("appendEvent");
  }
}
