import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

// Ownership-based, not role-based, unlike every other policy in this codebase:
// any authenticated user may view/mark-read their OWN notifications. The
// actual scoping happens in NotificationsRepository (filtering by
// recipientUserId), the same way tenant scoping happens by which database
// is opened rather than by a role check here.
@Injectable()
export class NotificationsPolicy extends BasePolicy {
  view(): boolean {
    return Boolean(this.user);
  }

  markRead(): boolean {
    return Boolean(this.user);
  }
}
