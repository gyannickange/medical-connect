import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { AuditLog, InsertAuditLog } from "@shared/schema";
import { CouchDBService } from "../../database/couchdb.service";
import { tenantDatabaseName } from "../../database/couchdb-naming";

export interface AuditQuery {
  limit?: number;
  offset?: number;
  page?: number;
  startDate?: Date;
  endDate?: Date;
  action?: string;
  status?: string;
  entityType?: string;
  entityId?: string;
  userId?: string;
}

@Injectable()
export class AuditRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertAuditLog): Promise<AuditLog> {
    const input = data as InsertAuditLog & { id?: string };
    const id = input.id ?? randomUUID();
    const doc = {
      ...input,
      _id: `audit_log:${id}`,
      id,
      type: "audit_log",
      createdAt: new Date().toISOString(),
    };
    await (await this.db(input.tenantId)).insert(doc as any);
    return this.hydrate(doc);
  }

  async find(tenantId: string, options: AuditQuery = {}): Promise<AuditLog[]> {
    const limit = options.limit ?? 100;
    const skip = options.offset ?? (options.page ?? 0) * limit;
    const selector: any = { type: "audit_log", tenantId };
    for (const key of ["action", "status", "entityType", "entityId", "userId"] as const) {
      if (options[key] !== undefined) selector[key] = options[key];
    }
    if (options.startDate || options.endDate) {
      selector.createdAt = {
        ...(options.startDate ? { $gte: options.startDate.toISOString() } : {}),
        ...(options.endDate ? { $lte: options.endDate.toISOString() } : {}),
      };
    }
    const dbName = tenantDatabaseName(tenantId);
    await this.couchDBService.ensureIndex(dbName, "audit_by_tenant_createdAt", [
      "tenantId",
      "type",
      "createdAt",
    ]);
    const result = await (await this.db(tenantId)).find({
      selector,
      sort: [{ createdAt: "desc" }],
      limit,
      skip,
    });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  private db(tenantId: string) {
    return this.couchDBService.getDatabase(tenantDatabaseName(tenantId));
  }

  private hydrate(doc: any): AuditLog {
    const { _id, _rev, type, ...value } = doc;
    return { ...value, createdAt: new Date(doc.createdAt) } as AuditLog;
  }
}
