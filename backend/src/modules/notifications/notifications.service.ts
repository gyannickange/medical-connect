import { Injectable } from "@nestjs/common";
import type { InsertAppNotification } from "@shared/schema";
import { NotificationsRepository } from "./notifications.repository";

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsRepository: NotificationsRepository) {}

  notifyUser(data: InsertAppNotification) {
    return this.notificationsRepository.notifyUser(data);
  }

  findForRecipient(tenantId: string, recipientUserId: string) {
    return this.notificationsRepository.findForRecipient(tenantId, recipientUserId);
  }

  markRead(id: string, tenantId: string, recipientUserId: string) {
    return this.notificationsRepository.markRead(id, tenantId, recipientUserId);
  }
}
