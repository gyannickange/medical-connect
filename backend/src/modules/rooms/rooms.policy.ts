import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class RoomsPolicy extends BasePolicy {
  protected readonly module = "rooms" as const;

  view(): Promise<boolean> {
    return this.can("view");
  }

  create(): Promise<boolean> {
    return this.can("create");
  }

  update(): Promise<boolean> {
    return this.can("update");
  }

  assign(): Promise<boolean> {
    return this.can("assign");
  }

  release(): Promise<boolean> {
    return this.can("release");
  }
}
