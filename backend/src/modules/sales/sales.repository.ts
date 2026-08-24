import { Injectable, Logger } from "@nestjs/common";
import { CouchDBService } from "../../database/couchdb.service";
import {
  couchDocumentId,
  publicDocumentId,
  tenantDatabaseName,
} from "../../database/couchdb-naming";
import type { Sale } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";

export interface SaleItemSnapshot {
  productId: string;
  variantId: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  priceType: string | null;
  pricingId: string | null;
  product: { id: string; name: string; description: string | null; cost: string } | null;
  variant: {
    id: string;
    sku: string | null;
    attributes: unknown;
    price: string | null;
    cost: string | null;
  } | null;
}

export interface SaleCustomerSnapshot {
  id: string;
  name: string;
}

// Reports/analytics span an entire tenant history, not a single page - CouchDB
// still requires a numeric limit (its own default is 25), so this stands in
// for "no limit" rather than truncating a report silently.
const UNBOUNDED_LIMIT = 100_000;

@Injectable()
export class SalesRepository {
  private readonly logger = new Logger(SalesRepository.name);

  constructor(private readonly couchDBService: CouchDBService) {}

  /**
   * Sales are an immutable, append-only ledger - each sale is written to
   * CouchDB exactly once, under its own id, with its line items nested
   * inside. There is no update/remove path. Items and customer arrive
   * pre-enriched with the product/variant/customer snapshot at the time of
   * sale, since CouchDB has no join to reconstruct that later.
   */
  async record(
    sale: Sale,
    items: SaleItemSnapshot[],
    customer: SaleCustomerSnapshot | null = null,
    stockEffects: Array<{
      productId: string;
      variantId: string | null;
      quantity: number;
      previousQuantity: number;
      newQuantity: number;
    }> = []
  ): Promise<boolean> {
    try {
      const db = await this.couchDBService.getDatabase(
        this.databaseName(sale.tenantId)
      );
      await db.insert({
        ...this.toDocument(sale, items, customer, stockEffects),
        _id: couchDocumentId("sale", sale.id),
        id: sale.id,
      } as any);
      return true;
    } catch (error) {
      this.logger.warn(`Failed to record sale ${sale.id} to CouchDB: ${error}`);
      return false;
    }
  }

  async findById(id: string, tenantId: string): Promise<Sale | undefined> {
    try {
      const doc: any = await (
        await this.couchDBService.getDatabase(this.databaseName(tenantId))
      ).get(couchDocumentId("sale", id));
      if (doc.type !== "sale" || doc.tenantId !== tenantId) return undefined;
      const { _id, _rev, type, items, customer, stockEffects, ...sale } = doc;
      return {
        ...sale,
        id: doc.id ?? publicDocumentId(_id, "sale"),
        createdAt: new Date(doc.createdAt),
      } as Sale;
    } catch (error: any) {
      if (error?.statusCode === 404) return undefined;
      throw error;
    }
  }

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    return this.queryByCreatedAt(
      tenantId,
      undefined,
      this.pagination(options)
    );
  }

  async getTodaysSales(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.queryByCreatedAt(
      tenantId,
      { $gte: start.toISOString(), $lt: end.toISOString() },
      this.pagination(options)
    );
  }

  async findByDateRange(tenantId: string, startDate: Date, endDate: Date): Promise<any[]> {
    return this.queryByCreatedAt(
      tenantId,
      { $gte: startDate.toISOString(), $lte: endDate.toISOString() },
      { limit: UNBOUNDED_LIMIT, skip: 0 }
    );
  }

  async findByProduct(productId: string, tenantId: string): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const result = await db.find({
      selector: {
        type: "sale",
        tenantId,
        items: { $elemMatch: { productId } },
      },
    });
    return [...result.docs].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async findByCustomer(customerId: string, tenantId: string): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const result = await db.find({
      selector: { type: "sale", tenantId, customerId },
    });
    return [...result.docs].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private async queryByCreatedAt(
    tenantId: string,
    createdAt: { $gte: string; $lt?: string; $lte?: string } | undefined,
    pagination: { limit: number; skip: number }
  ): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "sales_by_tenant_createdAt",
      ["tenantId", "type", "createdAt"]
    );
    const result = await db.find({
      selector: {
        type: "sale",
        tenantId,
        ...(createdAt ? { createdAt } : {}),
      },
      sort: [{ createdAt: "desc" }],
      limit: pagination.limit,
      skip: pagination.skip,
    });
    return result.docs;
  }

  private pagination(options?: PaginationOptions): { limit: number; skip: number } {
    const limit = options?.limit ?? 100;
    const skip = options?.offset ?? (options?.page ?? 0) * limit;
    return { limit, skip };
  }

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }

  private toDocument(
    sale: Sale,
    items: SaleItemSnapshot[],
    customer: SaleCustomerSnapshot | null,
    stockEffects: Array<{
      productId: string;
      variantId: string | null;
      quantity: number;
      previousQuantity: number;
      newQuantity: number;
    }>
  ) {
    return {
      type: "sale" as const,
      saleNumber: sale.saleNumber,
      customerId: sale.customerId ?? null,
      customer,
      userId: sale.userId,
      subtotal: sale.subtotal,
      tax: sale.tax,
      total: sale.total,
      profit: sale.profit,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      tenantId: sale.tenantId,
      createdAt: sale.createdAt.toISOString(),
      items,
      stockEffects,
    };
  }
}
