import { BasePolicy } from "./base.policy";

export class QueuePolicy extends BasePolicy {
  protected readonly module = "queue" as const;

  canView(): boolean {
    return this.can("view");
  }

  canAppendEvent(): boolean {
    return this.can("appendEvent");
  }
}
