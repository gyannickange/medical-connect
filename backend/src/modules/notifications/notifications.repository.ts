import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { AppNotification, InsertAppNotification } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class NotificationsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async notifyUser(data: InsertAppNotification): Promise<AppNotification> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const notification: AppNotification = {
      id,
      tenantId: data.tenantId,
      recipientUserId: data.recipientUserId,
      notificationType: data.notificationType,
      data: data.data,
      relatedEntity: data.relatedEntity,
      createdAt: now,
      readAt: null,
    };

    try {
      await db.insert({ ...this.toDocument(notification), _id: couchDocumentId("notification", id) } as any);
      return notification;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async findForRecipient(tenantId: string, recipientUserId: string, limit = 50): Promise<AppNotification[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "notifications_by_tenant_recipient_created", ["tenantId", "type", "recipientUserId", "createdAt"]);
    const result = await db.find({
      selector: { type: "notification", tenantId, recipientUserId },
      sort: [{ createdAt: "desc" }],
      limit,
    });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  async markRead(id: string, tenantId: string, recipientUserId: string): Promise<AppNotification> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "notification" || current.tenantId !== tenantId || current.recipientUserId !== recipientUserId) {
      throw new NotFoundException("Notification not found");
    }

    const updated = { ...current, readAt: new Date().toISOString() };
    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("notification", id))) as unknown as Record<string, any>;
    } catch (error: any) {
      if (error?.statusCode === 404) return null;
      throw error;
    }
  }

  private async database(tenantId: string): Promise<DocumentScope<unknown>> {
    try {
      return await this.couchDBService.getDatabase(this.databaseName(tenantId));
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
  }

  private hydrate(doc: Record<string, any>): AppNotification {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "notification"),
      createdAt: new Date(doc.createdAt),
      readAt: doc.readAt ? new Date(doc.readAt) : null,
    } as AppNotification;
  }

  private toDocument(notification: AppNotification) {
    return {
      ...notification,
      type: "notification" as const,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
    };
  }
}
