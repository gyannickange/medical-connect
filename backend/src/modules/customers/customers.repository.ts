import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { Customer, InsertCustomer } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import {
  couchDocumentId,
  publicDocumentId,
  tenantDatabaseName,
} from "../../database/couchdb-naming";

@Injectable()
export class CustomersRepository {
  private readonly logger = new Logger(CustomersRepository.name);
  private readonly operationQueues = new Map<string, Promise<unknown>>();

  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertCustomer): Promise<Customer> {
    const input = data as InsertCustomer & { id?: string };
    const customer: Customer = {
      id: input.id ?? randomUUID(),
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      tenantId: input.tenantId,
      totalPurchases: "0.00",
      createdAt: new Date(),
    } as Customer;
    const db = await this.couchDBService.getDatabase(this.databaseName(customer.tenantId));
    await db.insert({
      ...this.toDocument(customer),
      _id: couchDocumentId("customer", customer.id),
      id: customer.id,
    } as any);
    return customer;
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertCustomer>
  ): Promise<Customer> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const current = await this.findExisting(db, id);
    if (!current) throw new NotFoundException("Customer not found");
    const updated = {
      ...current,
      ...data,
      _id: couchDocumentId("customer", id),
      _rev: current._rev,
      type: "customer" as const,
      tenantId,
      totalPurchases: current.totalPurchases ?? "0.00",
      createdAt: current.createdAt,
    };
    await db.insert(updated as any);
    return this.hydrate(updated);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const current = await this.findExisting(db, id);
    if (!current) throw new NotFoundException("Customer not found");
    await db.destroy(current._id, current._rev);
  }

  async upsert(customer: Customer): Promise<boolean> {
    return this.enqueue(customer.id, () => this.doUpsert(customer));
  }

  async remove(customerId: string, tenantId: string): Promise<void> {
    return this.enqueue(customerId, () => this.doRemove(customerId, tenantId));
  }

  async findById(customerId: string, tenantId: string): Promise<any | undefined> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const existing = await this.findExisting(db, customerId);
    return existing ?? undefined;
  }

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "customers_by_tenant_name",
      ["tenantId", "type", "lastName", "firstName"]
    );
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: { type: "customer", tenantId },
      sort: [{ lastName: "asc" }, { firstName: "asc" }],
      limit,
      skip,
    });
    return result.docs.map((doc: any) => ({
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "customer"),
    }));
  }

  async search(
    query: string,
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const escaped = this.escapeRegex(query);
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: {
        type: "customer",
        tenantId,
        $or: [
          { firstName: { $regex: escaped } },
          { lastName: { $regex: escaped } },
          { email: { $regex: escaped } },
          { phone: { $regex: escaped } },
        ],
      },
      limit,
      skip,
    });
    return result.docs.map((doc: any) => ({
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "customer"),
    }));
  }

  // Chains operations for the same customer id so concurrent, un-awaited
  // callers can never complete out of call order - matches
  // CategoriesRepository/ProductsRepository's reasoning.
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

  private async doUpsert(customer: Customer): Promise<boolean> {
    try {
      const db = await this.couchDBService.getDatabase(
        this.databaseName(customer.tenantId)
      );
      const existing = await this.findExisting(db, customer.id);
      await db.insert(
        {
          ...this.toDocument(customer),
          _id: couchDocumentId("customer", customer.id),
          id: customer.id,
          ...(existing ? { _rev: existing._rev } : {}),
        } as any
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to record customer ${customer.id} to CouchDB: ${error}`
      );
      return false;
    }
  }

  private async doRemove(customerId: string, tenantId: string): Promise<void> {
    try {
      const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
      const existing = await this.findExisting(db, customerId);
      if (!existing) return;
      await db.destroy(existing._id, existing._rev);
    } catch (error) {
      this.logger.warn(
        `Failed to remove customer ${customerId} from CouchDB: ${error}`
      );
    }
  }

  private async findExisting(
    db: DocumentScope<unknown>,
    id: string
  ): Promise<Record<string, any> | null> {
    try {
      const doc = await db.get(couchDocumentId("customer", id));
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

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private toDocument(customer: Customer) {
    return {
      type: "customer" as const,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone ?? null,
      email: customer.email ?? null,
      address: customer.address ?? null,
      tenantId: customer.tenantId,
      totalPurchases: customer.totalPurchases,
      createdAt: customer.createdAt.toISOString(),
    };
  }

  private hydrate(doc: Record<string, any>): Customer {
    return {
      id: doc.id ?? publicDocumentId(doc._id, "customer"),
      firstName: doc.firstName,
      lastName: doc.lastName,
      phone: doc.phone ?? null,
      email: doc.email ?? null,
      address: doc.address ?? null,
      tenantId: doc.tenantId,
      totalPurchases: doc.totalPurchases ?? "0.00",
      createdAt: new Date(doc.createdAt),
    } as Customer;
  }
}
