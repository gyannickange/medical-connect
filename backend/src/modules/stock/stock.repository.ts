import { ConflictException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { CouchDBService } from "../../database/couchdb.service";
import { couchDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";
import type { StockMovement } from "@shared/schema";

@Injectable()
export class StockRepository {
  private readonly logger = new Logger(StockRepository.name);

  constructor(private readonly couchDBService: CouchDBService) {}

  async findProjectedQuantities(tenantId: string): Promise<Record<string, number>> {
    const dbName = this.databaseName(tenantId);
    try {
      await this.couchDBService.ensureDesignDocument(dbName, "stock", {
        by_product_variant: {
          map: STOCK_BY_PRODUCT_VARIANT_MAP,
          reduce: "_sum",
        },
      });
      const db: any = await this.couchDBService.getDatabase(dbName);
      const result: any = await db.view("stock", "by_product_variant", {
        group: true,
      });
      return (result.rows ?? []).reduce(
        (quantities: Record<string, number>, row: any) => {
          const [productId, variantId] = row.key as [string, string | null];
          quantities[
            variantId == null ? productId : `${productId}::${variantId}`
          ] = Number(row.value ?? 0);
          return quantities;
        },
        {}
      );
    } catch (error) {
      throw new ServiceUnavailableException("CouchDB is unavailable", {
        cause: error,
      });
    }
  }

  async recordRequired(movement: StockMovement): Promise<void> {
    try {
      const db = await this.couchDBService.getDatabase(
        this.databaseName(movement.tenantId)
      );
      await db.insert({
        ...this.toDocument(movement),
        _id: couchDocumentId("stock_movement", movement.id),
        id: movement.id,
      } as any);
    } catch (error: any) {
      if (error?.statusCode === 409) {
        throw new ConflictException("Stock operation already exists");
      }
      throw new ServiceUnavailableException("CouchDB is unavailable", {
        cause: error,
      });
    }
  }

  /**
   * Stock movements are an immutable, append-only ledger - each one is
   * written to CouchDB exactly once, under its own id. There is no
   * update/remove path and therefore no need to serialize operations per id.
   */
  async record(movement: StockMovement): Promise<boolean> {
    try {
      const db = await this.couchDBService.getDatabase(
        this.databaseName(movement.tenantId)
      );
      await db.insert({
        ...this.toDocument(movement),
        _id: couchDocumentId("stock_movement", movement.id),
        id: movement.id,
      } as any);
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to record stock movement ${movement.id} to CouchDB: ${error}`
      );
      return false;
    }
  }

  /**
   * Movements are queried by productId/variantId, both plain equality
   * fields not covered by an index - CouchDB still answers these correctly
   * via a full-collection scan, and per-tenant movement volume on a local
   * caisse is small enough that this doesn't need a dedicated index yet.
   */
  async findByProduct(productId: string, tenantId: string): Promise<any[]> {
    return this.queryMovements(tenantId, { productId });
  }

  async findByVariant(variantId: string, tenantId: string): Promise<any[]> {
    return this.queryMovements(tenantId, { variantId });
  }

  private async queryMovements(
    tenantId: string,
    extra: Record<string, unknown>
  ): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const result = await db.find({
      selector: { type: "stock_movement", tenantId, ...extra },
    });
    return [...result.docs].sort(
      (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }

  private toDocument(movement: StockMovement) {
    return {
      type: "stock_movement" as const,
      productId: movement.productId,
      variantId: movement.variantId ?? null,
      movementType: movement.type,
      quantity: movement.quantity,
      previousQuantity: movement.previousQuantity,
      newQuantity: movement.newQuantity,
      reason: movement.reason ?? null,
      priceType: movement.priceType ?? null,
      unitPrice: movement.unitPrice ?? null,
      purchaseId: movement.purchaseId ?? null,
      userId: movement.userId ?? null,
      tenantId: movement.tenantId,
      createdAt: movement.createdAt.toISOString(),
    };
  }
}

const STOCK_BY_PRODUCT_VARIANT_MAP = `function (doc) {
  function emitDelta(productId, variantId, delta) {
    emit([productId, null], delta);
    if (variantId) emit([productId, variantId], delta);
  }

  if (doc.type === "product") {
    if (doc.variants && doc.variants.length) {
      doc.variants.forEach(function (variant) {
        var initial = Number(variant.initialQuantity || 0);
        emitDelta(doc.id || doc._id.replace(/^product:/, ""), variant.id, initial);
      });
    } else {
      emitDelta(doc.id || doc._id.replace(/^product:/, ""), null, Number(doc.initialQuantity || 0));
    }
  } else if (doc.type === "stock_movement") {
    emitDelta(doc.productId, doc.variantId, Number(doc.newQuantity) - Number(doc.previousQuantity));
  } else if (doc.type === "sale" && doc.stockEffects) {
    doc.stockEffects.forEach(function (effect) {
      emitDelta(effect.productId, effect.variantId, Number(effect.newQuantity) - Number(effect.previousQuantity));
    });
  }
}`;
