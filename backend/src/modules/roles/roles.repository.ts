import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { InsertRole, Role } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class RolesRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertRole & { isSystemRole?: boolean }): Promise<Role> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const role: Role = {
      id,
      tenantId: data.tenantId,
      name: data.name,
      description: data.description ?? null,
      isSystemRole: data.isSystemRole ?? false,
      permissions: data.permissions,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(role), _id: couchDocumentId("role", id) } as any);
      return role;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertRole>): Promise<Role> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "role" || current.tenantId !== tenantId) {
      throw new NotFoundException("Role not found");
    }

    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "role" as const,
      tenantId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  async findById(id: string, tenantId: string): Promise<Role> {
    const db = await this.database(tenantId);
    const doc = await this.findExisting(db, id);
    if (!doc || doc.type !== "role" || doc.tenantId !== tenantId) {
      throw new NotFoundException("Role not found");
    }
    return this.hydrate(doc);
  }

  async findByTenant(tenantId: string): Promise<Role[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "roles_by_tenant_name", ["tenantId", "type", "name"]);
    const result = await db.find({ selector: { type: "role", tenantId }, sort: [{ name: "asc" }], limit: 200 });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "role" || current.tenantId !== tenantId) {
      throw new NotFoundException("Role not found");
    }
    try {
      await db.destroy(current._id, current._rev);
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("role", id))) as unknown as Record<string, any>;
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

  private hydrate(doc: Record<string, any>): Role {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "role"),
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as Role;
  }

  private toDocument(role: Role) {
    return { ...role, type: "role" as const, createdAt: role.createdAt.toISOString(), updatedAt: role.updatedAt.toISOString() };
  }
}
