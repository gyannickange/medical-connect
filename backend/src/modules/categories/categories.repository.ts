import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { Category, InsertCategory } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import {
  couchDocumentId,
  publicDocumentId,
  tenantDatabaseName,
} from "../../database/couchdb-naming";

@Injectable()
export class CategoriesRepository {
  private readonly logger = new Logger(CategoriesRepository.name);
  private readonly operationQueues = new Map<string, Promise<unknown>>();

  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertCategory): Promise<Category> {
    const input = data as InsertCategory & { id?: string };
    const category: Category = {
      id: input.id ?? randomUUID(),
      name: input.name,
      description: input.description ?? null,
      tenantId: input.tenantId,
      parentCategoryId: input.parentCategoryId ?? null,
      taxRate: input.taxRate == null ? null : String(input.taxRate),
      isDefault: input.isDefault ?? false,
      createdAt: new Date(),
    } as Category;
    const db = await this.couchDBService.getDatabase(this.databaseName(category.tenantId));
    await db.insert({
      ...this.toDocument(category),
      _id: couchDocumentId("category", category.id),
      id: category.id,
    } as any);
    return category;
  }

  async findById(id: string, tenantId: string): Promise<Category | undefined> {
    const doc = await this.findExisting(
      await this.couchDBService.getDatabase(this.databaseName(tenantId)),
      id
    );
    return doc ? this.hydrate(doc) : undefined;
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertCategory>
  ): Promise<Category> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const current = await this.findExisting(db, id);
    if (!current) throw new NotFoundException("Category not found");
    const updated = {
      ...current,
      ...data,
      _id: couchDocumentId("category", id),
      _rev: current._rev,
      type: "category" as const,
      tenantId,
      taxRate:
        data.taxRate === undefined
          ? current.taxRate
          : data.taxRate == null
            ? null
            : String(data.taxRate),
      createdAt: current.createdAt,
    };
    await db.insert(updated as any);
    return this.hydrate(updated);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const current = await this.findExisting(db, id);
    if (!current) throw new NotFoundException("Category not found");
    await db.destroy(current._id, current._rev);
  }

  async upsert(category: Category): Promise<boolean> {
    return this.enqueue(category.id, () => this.doUpsert(category));
  }

  async remove(categoryId: string, tenantId: string): Promise<void> {
    return this.enqueue(categoryId, () => this.doRemove(categoryId, tenantId));
  }

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "categories_by_tenant_name",
      ["tenantId", "type", "name"]
    );
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: { type: "category", tenantId },
      sort: [{ name: "asc" }],
      limit,
      skip,
    });
    return result.docs.map((doc: any) => ({
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "category"),
    }));
  }

  // Chains operations for the same category id so concurrent, un-awaited
  // callers (CategoriesService fires these with `void`) can never complete
  // out of call order - matches ProductsRepository's reasoning.
  private enqueue<T>(id: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operationQueues.get(id) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const settled = result.then(
      () => undefined,
      () => undefined
    );
    this.operationQueues.set(id, settled);
    settled.finally(() => {
      if (this.operationQueues.get(id) === settled) {
        this.operationQueues.delete(id);
      }
    });
    return result;
  }

  private async doUpsert(category: Category): Promise<boolean> {
    try {
      const db = await this.couchDBService.getDatabase(
        this.databaseName(category.tenantId)
      );
      const existing = await this.findExisting(db, category.id);
      await db.insert(
        {
          ...this.toDocument(category),
          _id: couchDocumentId("category", category.id),
          id: category.id,
          ...(existing ? { _rev: existing._rev } : {}),
        } as any
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to record category ${category.id} to CouchDB: ${error}`
      );
      return false;
    }
  }

  private async doRemove(categoryId: string, tenantId: string): Promise<void> {
    try {
      const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
      const existing = await this.findExisting(db, categoryId);
      if (!existing) return;
      await db.destroy(existing._id, existing._rev);
    } catch (error) {
      this.logger.warn(
        `Failed to remove category ${categoryId} from CouchDB: ${error}`
      );
    }
  }

  private async findExisting(
    db: DocumentScope<unknown>,
    id: string
  ): Promise<Record<string, any> | null> {
    try {
      const doc = await db.get(couchDocumentId("category", id));
      return doc as unknown as Record<string, any>;
    } catch (error: any) {
      if (error?.statusCode === 404) return null;
      throw error;
    }
  }

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }

  private pagination(options?: PaginationOptions): { limit: number; skip: number } {
    const limit = options?.limit ?? 100;
    const skip = options?.offset ?? (options?.page ?? 0) * limit;
    return { limit, skip };
  }

  private toDocument(category: Category) {
    return {
      type: "category" as const,
      name: category.name,
      description: category.description ?? null,
      parentCategoryId: category.parentCategoryId ?? null,
      taxRate: category.taxRate ?? null,
      isDefault: category.isDefault,
      tenantId: category.tenantId,
      createdAt: category.createdAt.toISOString(),
    };
  }

  private hydrate(doc: Record<string, any>): Category {
    return {
      id: doc.id ?? publicDocumentId(doc._id, "category"),
      name: doc.name,
      description: doc.description ?? null,
      tenantId: doc.tenantId,
      parentCategoryId: doc.parentCategoryId ?? null,
      taxRate: doc.taxRate ?? null,
      isDefault: doc.isDefault ?? false,
      createdAt: new Date(doc.createdAt),
    } as Category;
  }
}
