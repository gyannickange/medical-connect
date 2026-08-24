import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { InsertSyncStatus, SyncStatus } from "@shared/schema";
import { CouchDBService } from "../../database/couchdb.service";
import { tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class SyncRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async upsert(data: InsertSyncStatus): Promise<SyncStatus> {
    const db = await this.db(data.tenantId);
    const _id = `sync_status:${encodeURIComponent(data.deviceId)}`;
    const current: any = await db.get(_id).catch((error: any) => {
      if (error?.statusCode === 404) return null;
      throw error;
    });
    const doc = {
      _id,
      ...(current?._rev ? { _rev: current._rev } : {}),
      id: current?.id ?? randomUUID(),
      type: "sync_status",
      tenantId: data.tenantId,
      deviceId: data.deviceId,
      lastSync: data.lastSync
        ? new Date(data.lastSync as string | number | Date).toISOString()
        : null,
      status: data.status ?? "offline",
      pendingChanges: data.pendingChanges ?? 0,
    };
    await db.insert(doc as any);
    return this.hydrate(doc);
  }

  async findOne(tenantId: string, deviceId: string): Promise<SyncStatus | undefined> {
    try {
      const doc = await (await this.db(tenantId)).get(
        `sync_status:${encodeURIComponent(deviceId)}`
      );
      return this.hydrate(doc as any);
    } catch (error) {
      if ((error as any)?.statusCode === 404) return undefined;
      throw error;
    }
  }

  async findAll(tenantId: string): Promise<SyncStatus[]> {
    const result = await (await this.db(tenantId)).find({
      selector: { type: "sync_status", tenantId },
      limit: 1000,
    });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  private db(tenantId: string) {
    return this.couchDBService.getDatabase(tenantDatabaseName(tenantId));
  }

  private hydrate(doc: any): SyncStatus {
    return {
      id: doc.id,
      tenantId: doc.tenantId,
      deviceId: doc.deviceId,
      lastSync: doc.lastSync ? new Date(doc.lastSync) : null,
      status: doc.status,
      pendingChanges: doc.pendingChanges,
    } as SyncStatus;
  }
}
