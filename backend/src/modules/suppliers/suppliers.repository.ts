import { Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { InsertSupplier, Supplier } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import { CouchDBService } from "../../database/couchdb.service";
import { tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class SuppliersRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<Supplier[]> {
    const limit = options?.limit ?? 100;
    const skip = options?.offset ?? (options?.page ?? 0) * limit;
    const result = await (await this.db(tenantId)).find({
      selector: { type: "supplier", tenantId },
      sort: [{ name: "asc" }],
      limit,
      skip,
    });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  async create(data: InsertSupplier): Promise<Supplier> {
    const input = data as InsertSupplier & { id?: string };
    const id = input.id ?? randomUUID();
    const doc = {
      _id: `supplier:${id}`,
      id,
      type: "supplier",
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      tenantId: input.tenantId,
      isActive: input.isActive !== false,
      createdAt: new Date().toISOString(),
    };
    await (await this.db(input.tenantId)).insert(doc as any);
    return this.hydrate(doc);
  }

  async update(id: string, tenantId: string, data: Partial<InsertSupplier>): Promise<Supplier> {
    const db = await this.db(tenantId);
    const current: any = await db.get(`supplier:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Supplier not found");
      throw error;
    });
    const updated = { ...current, ...data, id, tenantId, type: "supplier" };
    await db.insert(updated);
    return this.hydrate(updated);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const db = await this.db(tenantId);
    const current: any = await db.get(`supplier:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Supplier not found");
      throw error;
    });
    await db.destroy(current._id, current._rev);
  }

  private db(tenantId: string) {
    return this.couchDBService.getDatabase(tenantDatabaseName(tenantId));
  }

  private hydrate(doc: any): Supplier {
    const { _id, _rev, type, ...value } = doc;
    return { ...value, createdAt: new Date(doc.createdAt) } as Supplier;
  }
}
