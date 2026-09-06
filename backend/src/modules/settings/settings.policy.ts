import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class SettingsPolicy extends BasePolicy {
  protected readonly module = "settings" as const;

  view(): Promise<boolean> {
    return this.can("view");
  }

  create(): Promise<boolean> {
    return this.can("create");
  }

  update(): Promise<boolean> {
    return this.can("update");
  }

  delete(): Promise<boolean> {
    return this.can("delete");
  }
}
