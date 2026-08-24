import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { VariantNotFoundException } from "../../lib/exceptions";
import { InsufficientStockException } from "../../lib/exceptions/insufficient-stock.exception";
import type { InsertProduct, Product } from "@shared/schema";
import {
  resolveCurrentSellingPrice,
  sortPurchasesDesc,
  sortSellingPricesDesc,
} from "./product-pricing-history";
import type { PaginationOptions } from "../../lib/pagination";
import {
  couchDocumentId,
  publicDocumentId,
  tenantDatabaseName,
} from "../../database/couchdb-naming";
import { normalizeBarcode } from "../../lib/exceptions";

// findLowStock needs the whole tenant catalog in memory to compare two
// fields per document (CouchDB selectors can't do that) - this stands in
// for "no limit" rather than truncating the catalog before filtering.
const UNBOUNDED_LIMIT = 100_000;

@Injectable()
export class ProductsRepository {
  private readonly logger = new Logger(ProductsRepository.name);
  private readonly operationQueues = new Map<string, Promise<unknown>>();

  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertProduct): Promise<Product> {
    const input = data as InsertProduct & { id?: string };
    const id = input.id ?? randomUUID();
    const now = new Date();
    const barcode = normalizeBarcode(input.barcode) ?? null;
    const db = await this.database(input.tenantId);
    const category = input.categoryId
      ? await this.requireReference(db, input.categoryId, input.tenantId, "category")
      : null;
    if (input.supplierId) {
      await this.requireReference(db, input.supplierId, input.tenantId, "supplier");
    }
    const rayon = input.rayonId
      ? await this.requireReference(db, input.rayonId, input.tenantId, "rayon")
      : null;

    const product: Product = {
      id,
      name: input.name,
      description: input.description ?? null,
      price: Number(input.price).toFixed(2),
      cost: Number(input.cost).toFixed(2),
      barcode,
      qrCode: input.qrCode ?? null,
      categoryId: input.categoryId ?? null,
      supplierId: input.supplierId ?? null,
      rayonId: input.rayonId ?? null,
      tenantId: input.tenantId,
      minStockAlert: Number(input.minStockAlert ?? 10),
      isActive: input.isActive === undefined ? true : Boolean(input.isActive),
      createdAt: now,
      updatedAt: now,
    };

    let reservation: { _id: string; _rev?: string } | null = null;
    try {
      if (barcode) {
        const reservationId = this.barcodeReservationId(barcode);
        const result: any = await db.insert({
          _id: reservationId,
          type: "barcode_reservation",
          tenantId: input.tenantId,
          barcode,
          productId: id,
        } as any);
        reservation = { _id: reservationId, _rev: result?.rev };
      }
      await db.insert({
        ...this.toDocument(
          product,
          category && { id: category.id, name: category.name },
          rayon && { id: rayon.id, name: rayon.name }
        ),
        _id: couchDocumentId("product", id),
        id,
        initialQuantity: 0,
        stocks: {
          quantity: 0,
          reservedQuantity: 0,
          lastUpdated: now.toISOString(),
        },
        variants: [],
        pricingRules: [],
        sellingPrices: [],
        purchases: [],
      } as any);
      return product;
    } catch (error) {
      if (reservation?._rev) {
        await db.destroy(reservation._id, reservation._rev).catch(() => undefined);
      }
      if (this.statusCode(error) === 409) {
        throw new ConflictException(
          barcode ? "Product barcode already exists" : "Product already exists"
        );
      }
      throw this.unavailable(error);
    }
  }

  async update(
    productId: string,
    tenantId: string,
    data: Partial<InsertProduct>
  ): Promise<Product> {
    return this.enqueue(productId, async () => {
      const db = await this.database(tenantId);
      const current = await this.findExisting(db, productId);
      if (!current || current.type !== "product" || current.tenantId !== tenantId) {
        throw new NotFoundException("Product not found");
      }

      const categoryId =
        data.categoryId === undefined ? current.categoryId : data.categoryId;
      const supplierId =
        data.supplierId === undefined ? current.supplierId : data.supplierId;
      const category = categoryId
        ? await this.requireReference(db, categoryId, tenantId, "category")
        : null;
      if (supplierId) {
        await this.requireReference(db, supplierId, tenantId, "supplier");
      }
      const rayonId =
        data.rayonId === undefined ? current.rayonId : data.rayonId;
      const rayon = rayonId
        ? await this.requireReference(db, rayonId, tenantId, "rayon")
        : null;

      const nextBarcode =
        data.barcode === undefined
          ? current.barcode ?? null
          : normalizeBarcode(data.barcode) ?? null;
      const barcodeChanged = nextBarcode !== (current.barcode ?? null);
      let reservation: { _id: string; _rev?: string } | null = null;

      try {
        if (barcodeChanged && nextBarcode) {
          const reservationId = this.barcodeReservationId(nextBarcode);
          const result: any = await db.insert({
            _id: reservationId,
            type: "barcode_reservation",
            tenantId,
            barcode: nextBarcode,
            productId,
          } as any);
          reservation = { _id: reservationId, _rev: result?.rev };
        }

        const updated = {
          ...current,
          ...data,
          _id: current._id,
          _rev: current._rev,
          id: productId,
          type: "product" as const,
          tenantId,
          barcode: nextBarcode,
          categoryId: categoryId ?? null,
          category: category ? { id: category.id, name: category.name } : null,
          supplierId: supplierId ?? null,
          rayonId: rayonId ?? null,
          rayon: rayon ? { id: rayon.id, name: rayon.name } : null,
          price:
            data.price === undefined ? current.price : Number(data.price).toFixed(2),
          cost:
            data.cost === undefined ? current.cost : Number(data.cost).toFixed(2),
          createdAt: current.createdAt,
          updatedAt: new Date().toISOString(),
          stocks: current.stocks ?? null,
          variants: current.variants ?? [],
          pricingRules: current.pricingRules ?? [],
        };
        await db.insert(updated as any);

        if (barcodeChanged && current.barcode) {
          await this.removeReservation(db, current.barcode, productId);
        }
        return this.hydrate(updated);
      } catch (error) {
        if (reservation?._rev) {
          await db.destroy(reservation._id, reservation._rev).catch(() => undefined);
        }
        if (this.statusCode(error) === 409) {
          throw new ConflictException(
            barcodeChanged && nextBarcode && !reservation
              ? "Product barcode already exists"
              : "Product was modified concurrently"
          );
        }
        if (error instanceof NotFoundException) throw error;
        throw this.unavailable(error);
      }
    });
  }

  async archiveRequired(productId: string, tenantId: string): Promise<void> {
    await this.enqueue(productId, async () => {
      const db = await this.database(tenantId);
      const current = await this.findExisting(db, productId);
      if (!current || current.type !== "product" || current.tenantId !== tenantId) {
        throw new NotFoundException("Product not found");
      }
      try {
        await db.insert({
          ...current,
          _id: current._id,
          _rev: current._rev,
          isActive: false,
          updatedAt: new Date().toISOString(),
        } as any);
      } catch (error) {
        if (this.statusCode(error) === 409) {
          throw new ConflictException("Product was modified concurrently");
        }
        throw this.unavailable(error);
      }
    });
  }

  async upsert(
    product: Product,
    category: { id: string; name: string } | null = null
  ): Promise<boolean> {
    return this.enqueue(product.id, () => this.doUpsert(product, category));
  }

  async remove(productId: string, tenantId: string): Promise<void> {
    return this.enqueue(productId, () => this.doRemove(productId, tenantId));
  }

  /**
   * Marks a product as archived on its mirrored document by flipping
   * `isActive` to false, leaving the document (and its `stocks`/`variants`
   * snapshots) in place. Called by ProductsService.delete() instead of
   * `remove`, since products are now archived rather than hard-deleted.
   */
  async archive(productId: string, tenantId: string): Promise<boolean> {
    return this.enqueue(productId, () =>
      this.doPatchField(productId, tenantId, "isActive", false)
    );
  }

  /**
   * Patches just the `stocks` field on an already-mirrored product document,
   * leaving every other field (including `variants`) untouched. Called by
   * StockService/SalesService after any operation that changes a product's
   * current stock quantity, so the product document stays a faithful
   * snapshot without those services needing the full Product entity.
   */
  async updateStockSnapshot(
    productId: string,
    tenantId: string,
    stocks: { quantity: number; reservedQuantity: number; lastUpdated: string } | null
  ): Promise<boolean> {
    return this.enqueue(productId, () =>
      this.doPatchField(productId, tenantId, "stocks", stocks)
    );
  }

  /**
   * Patches just the `variants` field on an already-mirrored product
   * document. Called by ProductsService after any variant create/update/
   * delete, with the full current list of the product's variants.
   */
  async updateVariantsSnapshot(
    productId: string,
    tenantId: string,
    variants: Array<{
      id: string;
      sku: string | null;
      attributes: unknown;
      price: string | null;
      cost: string | null;
      barcode: string | null;
      quantity: number;
      minStockAlert: number;
      isActive: boolean;
    }>
  ): Promise<boolean> {
    return this.enqueue(productId, () =>
      this.doPatchField(productId, tenantId, "variants", variants)
    );
  }

  /**
   * Applies a signed quantity change to a product's (or one of its
   * variants') stock, using the document's `_rev` for optimistic
   * concurrency: on a write conflict (another writer updated the same
   * document first) it re-reads and retries, up to `maxAttempts`. Unlike
   * the mirror methods above, this is a required guard, not a best-effort
   * push — it throws NotFoundException/VariantNotFoundException/
   * InsufficientStockException instead of swallowing failures, since it's
   * the actual authoritative stock decrement (no Postgres transaction
   * backs this anymore), and callers (SalesService, StockService) must be
   * able to react to - and roll back from - a failed adjustment.
   */
  async adjustStock(
    productId: string,
    tenantId: string,
    delta: number,
    variantId: string | null = null
  ): Promise<{ previousQuantity: number; newQuantity: number }> {
    return this.enqueue(productId, () =>
      this.doAdjustStock(productId, tenantId, delta, variantId)
    );
  }

  private async doAdjustStock(
    productId: string,
    tenantId: string,
    delta: number,
    variantId: string | null
  ): Promise<{ previousQuantity: number; newQuantity: number }> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const doc = await this.findExisting(db, productId);
      if (!doc) {
        throw new NotFoundException(`Product ${productId} not found`);
      }

      const { previousQuantity, newQuantity, patch } = variantId
        ? this.planVariantAdjustment(doc, productId, variantId, delta)
        : this.planProductAdjustment(doc, productId, delta);

      if (newQuantity < 0) {
        throw new InsufficientStockException(
          productId,
          Math.abs(delta),
          previousQuantity
        );
      }

      try {
        await db.insert({ ...doc, ...patch, _id: doc._id } as any);
        return { previousQuantity, newQuantity };
      } catch (error: any) {
        if (error?.statusCode === 409 && attempt < maxAttempts) continue;
        throw error;
      }
    }
    /* istanbul ignore next -- unreachable: loop always returns or throws */
    throw new Error(`Failed to adjust stock for product ${productId}`);
  }

  private planProductAdjustment(
    doc: Record<string, any>,
    productId: string,
    delta: number
  ) {
    const stocks = doc.stocks as
      | { quantity: number; reservedQuantity: number }
      | null;
    const previousQuantity = stocks?.quantity ?? 0;
    const newQuantity = previousQuantity + delta;
    return {
      previousQuantity,
      newQuantity,
      patch: {
        stocks: {
          quantity: newQuantity,
          reservedQuantity: stocks?.reservedQuantity ?? 0,
          lastUpdated: new Date().toISOString(),
        },
      },
    };
  }

  private planVariantAdjustment(
    doc: Record<string, any>,
    productId: string,
    variantId: string,
    delta: number
  ) {
    const variants = (doc.variants ?? []) as any[];
    const variant = variants.find((v) => v.id === variantId);
    if (!variant) {
      throw new VariantNotFoundException(variantId, productId);
    }
    const previousQuantity = variant.quantity ?? 0;
    const newQuantity = previousQuantity + delta;
    const updatedVariants = variants.map((v) =>
      v.id === variantId ? { ...v, quantity: newQuantity } : v
    );
    // A variant-managed product's own aggregate stock is the sum of its
    // active variants' quantities (archived variants contribute 0) -
    // mirrors updateProductStockFromVariants' Postgres semantics.
    const totalActiveQuantity = updatedVariants.reduce(
      (sum: number, v: any) => sum + (v.isActive !== false ? v.quantity || 0 : 0),
      0
    );
    return {
      previousQuantity,
      newQuantity,
      patch: {
        variants: updatedVariants,
        stocks: {
          quantity: totalActiveQuantity,
          reservedQuantity: (doc.stocks as any)?.reservedQuantity ?? 0,
          lastUpdated: new Date().toISOString(),
        },
      },
    };
  }

  /**
   * Cascades a category rename to every product that references it. Fired
   * from CategoriesService.update() when a category's name changes, since
   * the category name is denormalized onto each product's mirrored document.
   */
  async renameCategoryOnProducts(
    tenantId: string,
    categoryId: string,
    categoryName: string
  ): Promise<void> {
    try {
      const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
      const result = await db.find({
        selector: { type: "product", tenantId, categoryId },
      });
      for (const doc of result.docs) {
        try {
          await db.insert({
            ...doc,
            category: { id: categoryId, name: categoryName },
          } as any);
        } catch (error) {
          this.logger.warn(
            `Failed to cascade category rename ${categoryId} to product ${doc._id}: ${error}`
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cascade category rename ${categoryId} to products: ${error}`
      );
    }
  }

  /**
   * Cascades a rayon rename to every product that references it. Fired
   * from RayonsService.update() when a rayon's name changes, mirroring
   * renameCategoryOnProducts exactly, including its log-and-continue
   * behavior on a per-product or getDatabase failure.
   */
  async renameRayonOnProducts(
    tenantId: string,
    rayonId: string,
    rayonName: string
  ): Promise<void> {
    try {
      const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
      const result = await db.find({
        selector: { type: "product", tenantId, rayonId },
        limit: UNBOUNDED_LIMIT,
      });
      for (const doc of result.docs) {
        try {
          await db.insert({
            ...doc,
            rayon: { id: rayonId, name: rayonName },
          } as any);
        } catch (error) {
          this.logger.warn(
            `Failed to cascade rayon rename ${rayonId} to product ${doc._id}: ${error}`
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `Failed to cascade rayon rename ${rayonId} to products: ${error}`
      );
    }
  }

  async hasProductsReferencing(
    tenantId: string,
    field: "categoryId" | "supplierId",
    value: string
  ): Promise<boolean> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const result = await db.find({
      selector: { type: "product", tenantId, [field]: value },
      limit: 1,
    });
    return result.docs.length > 0;
  }

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "products_by_tenant_name",
      ["tenantId", "type", "isActive", "name"]
    );
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: { type: "product", tenantId, isActive: true },
      sort: [{ name: "asc" }],
      limit,
      skip,
    });
    return result.docs;
  }

  async search(
    query: string,
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "products_by_tenant_name",
      ["tenantId", "type", "isActive", "name"]
    );
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: {
        type: "product",
        tenantId,
        name: { $regex: this.escapeRegex(query) },
      },
      sort: [{ name: "asc" }],
      limit,
      skip,
    });
    return result.docs;
  }

  async findByBarcode(barcode: string, tenantId: string): Promise<any | undefined> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "products_by_tenant_barcode",
      ["tenantId", "type", "barcode"]
    );
    const result = await db.find({
      selector: { type: "product", tenantId, barcode },
      limit: 1,
    });
    return result.docs[0];
  }

  /**
   * Lists every active product for the tenant as a stock entry, keyed by
   * product rather than a separate stock document - the `stocks` snapshot
   * already lives on the product's mirrored document. Products that have
   * never had a stock movement mirrored default to a zero-quantity entry
   * instead of being silently omitted.
   */
  async findWithStock(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "products_by_tenant_name",
      ["tenantId", "type", "isActive", "name"]
    );
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: { type: "product", tenantId, isActive: true },
      sort: [{ name: "asc" }],
      limit,
      skip,
    });
    return result.docs.map((doc: any) => this.toStockEntry(doc, tenantId));
  }

  /**
   * Same shape as findWithStock, filtered to products whose stock quantity
   * is below their own minStockAlert. CouchDB selectors can't compare two
   * fields of the same document, so the comparison and pagination happen
   * in memory - acceptable for a single tenant's catalog on a local caisse.
   */
  async findLowStock(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    await this.couchDBService.ensureIndex(
      this.databaseName(tenantId),
      "products_by_tenant_name",
      ["tenantId", "type", "isActive", "name"]
    );
    const result = await db.find({
      selector: { type: "product", tenantId, isActive: true },
      sort: [{ name: "asc" }],
      limit: UNBOUNDED_LIMIT,
    });
    const lowStock = result.docs
      .map((doc: any) => this.toStockEntry(doc, tenantId))
      .filter((entry: any) => entry.quantity <= entry.product.minStockAlert);
    const { limit, skip } = this.pagination(options);
    return lowStock.slice(skip, skip + limit);
  }

  private toStockEntry(doc: any, tenantId: string) {
    return {
      id: doc.id ?? publicDocumentId(doc._id, "product"),
      productId: doc.id ?? publicDocumentId(doc._id, "product"),
      tenantId,
      quantity: doc.stocks?.quantity ?? 0,
      reservedQuantity: doc.stocks?.reservedQuantity ?? 0,
      lastUpdated: doc.stocks?.lastUpdated ?? doc.updatedAt,
      product: {
        id: doc.id ?? publicDocumentId(doc._id, "product"),
        name: doc.name,
        description: doc.description ?? null,
        price: doc.price,
        cost: doc.cost,
        barcode: doc.barcode ?? null,
        categoryId: doc.categoryId ?? null,
        category: doc.category ?? null,
        rayonId: doc.rayonId ?? null,
        rayon: doc.rayon ?? null,
        minStockAlert: doc.minStockAlert,
        isActive: doc.isActive,
        variants: doc.variants ?? [],
      },
    };
  }

  /**
   * Returns the raw mirrored document for a single product (including its
   * nested `variants` snapshot), or undefined if it hasn't been mirrored.
   * Used by SalesService to freeze a product/variant snapshot onto a sale
   * without going back to Postgres for an already-migrated entity.
   */
  async findById(productId: string, tenantId: string): Promise<any | undefined> {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const existing = await this.findExisting(db, productId);
    return existing ?? undefined;
  }

  async calculateProductPrice(
    tenantId: string,
    productId: string,
    quantity: number,
    variantId?: string,
    priceType?: string
  ): Promise<{ price: string; rule?: any }> {
    const product = await this.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Product not found");
    const variant = variantId
      ? (product.variants ?? []).find((item: any) => item.id === variantId)
      : null;
    if (variantId && !variant) {
      throw new VariantNotFoundException(variantId, productId);
    }

    const now = Date.now();
    const priorities: Record<string, number> = {
      promotional: 1,
      bulk: 2,
      wholesale: 3,
      retail: 4,
    };
    const rules = (product.pricingRules ?? [])
      .filter((rule: any) => {
        if (rule.isActive === false) return false;
        if (priceType && rule.priceType !== priceType) return false;
        if (rule.variantId && rule.variantId !== variantId) return false;
        if (!variantId && rule.variantId) return false;
        if (quantity < Number(rule.minQuantity ?? 1)) return false;
        if (rule.maxQuantity != null && quantity > Number(rule.maxQuantity)) return false;
        if (rule.validFrom && new Date(rule.validFrom).getTime() > now) return false;
        if (rule.validTo && new Date(rule.validTo).getTime() < now) return false;
        return true;
      })
      .sort((a: any, b: any) => {
        const typeOrder = (priorities[a.priceType] ?? 5) - (priorities[b.priceType] ?? 5);
        if (typeOrder !== 0) return typeOrder;
        if (variantId && Boolean(a.variantId) !== Boolean(b.variantId)) {
          return a.variantId ? -1 : 1;
        }
        return Number(b.price) - Number(a.price);
      });
    if (rules[0]) return { price: String(rules[0].price), rule: rules[0] };
    const fallback = String(variant?.price ?? product.price);
    return { price: resolveCurrentSellingPrice(product.sellingPrices, variantId ?? null, fallback) };
  }

  async getVariants(productId: string, tenantId: string): Promise<any[]> {
    const product = await this.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Product not found");
    return (product.variants ?? []).filter((variant: any) => variant.isActive !== false);
  }

  async getVariant(variantId: string, tenantId: string): Promise<any> {
    const db = await this.database(tenantId);
    const result = await db.find({
      selector: {
        type: "product",
        tenantId,
        variants: { $elemMatch: { id: variantId } },
      },
      limit: 1,
    });
    const product: any = result.docs[0];
    const variant = product?.variants?.find((item: any) => item.id === variantId);
    if (!variant) throw new NotFoundException("Variant not found");
    return {
      ...variant,
      productId: product.id ?? publicDocumentId(product._id, "product"),
      tenantId,
    };
  }

  async createVariant(data: any, tenantId: string): Promise<any> {
    const now = new Date().toISOString();
    const barcode = normalizeBarcode(data.barcode) ?? null;
    const variant = {
      id: data.id ?? randomUUID(),
      productId: data.productId,
      attributes: data.attributes,
      sku: data.sku ?? null,
      price: data.price == null ? null : Number(data.price).toFixed(2),
      cost: data.cost == null ? null : Number(data.cost).toFixed(2),
      barcode,
      quantity: Number(data.quantity ?? 0),
      initialQuantity: Number(data.quantity ?? 0),
      minStockAlert: Number(data.minStockAlert ?? 10),
      isActive: data.isActive ?? true,
      tenantId,
      createdAt: now,
      updatedAt: now,
    };
    const db = await this.database(tenantId);
    let reservation: { _id: string; _rev?: string } | null = null;
    try {
      if (barcode) {
        const reservationId = this.barcodeReservationId(barcode);
        const result: any = await db.insert({
          _id: reservationId,
          type: "barcode_reservation",
          tenantId,
          barcode,
          productId: data.productId,
          variantId: variant.id,
        } as any);
        reservation = { _id: reservationId, _rev: result?.rev };
      }
      await this.patchProduct(data.productId, tenantId, (product) => {
        if ((product.variants ?? []).some((item: any) => item.id === variant.id)) {
          throw new ConflictException("Variant already exists");
        }
        const variants = [...(product.variants ?? []), variant];
        return { variants, stocks: this.aggregateVariantStock(product, variants) };
      });
    } catch (error) {
      if (reservation?._rev) {
        await db.destroy(reservation._id, reservation._rev).catch(() => undefined);
      }
      if (this.statusCode(error) === 409) {
        throw new ConflictException("Product barcode already exists");
      }
      throw error;
    }
    return { ...variant, createdAt: new Date(now), updatedAt: new Date(now) };
  }

  async updateVariant(variantId: string, tenantId: string, data: any): Promise<any> {
    const existing = await this.getVariant(variantId, tenantId);
    const nextBarcode =
      data.barcode === undefined
        ? existing.barcode ?? null
        : normalizeBarcode(data.barcode) ?? null;
    const barcodeChanged = nextBarcode !== (existing.barcode ?? null);
    const db = await this.database(tenantId);
    let reservation: { _id: string; _rev?: string } | null = null;
    let updatedVariant: any;
    try {
      if (barcodeChanged && nextBarcode) {
        const reservationId = this.barcodeReservationId(nextBarcode);
        const result: any = await db.insert({
          _id: reservationId,
          type: "barcode_reservation",
          tenantId,
          barcode: nextBarcode,
          productId: existing.productId,
          variantId,
        } as any);
        reservation = { _id: reservationId, _rev: result?.rev };
      }
      await this.patchProduct(existing.productId, tenantId, (product) => {
        const variants = (product.variants ?? []).map((variant: any) => {
          if (variant.id !== variantId) return variant;
          updatedVariant = {
            ...variant,
            ...data,
            id: variantId,
            productId: existing.productId,
            tenantId,
            barcode: nextBarcode,
            price:
              data.price === undefined
                ? variant.price ?? null
                : data.price == null
                  ? null
                  : Number(data.price).toFixed(2),
            cost:
              data.cost === undefined
                ? variant.cost ?? null
                : data.cost == null
                  ? null
                  : Number(data.cost).toFixed(2),
            updatedAt: new Date().toISOString(),
          };
          return updatedVariant;
        });
        return { variants, stocks: this.aggregateVariantStock(product, variants) };
      });
      if (barcodeChanged && existing.barcode) {
        await this.removeReservation(
          db,
          existing.barcode,
          existing.productId,
          variantId
        );
      }
    } catch (error) {
      if (reservation?._rev) {
        await db.destroy(reservation._id, reservation._rev).catch(() => undefined);
      }
      if (this.statusCode(error) === 409) {
        throw new ConflictException("Product barcode already exists");
      }
      throw error;
    }
    return {
      ...updatedVariant,
      createdAt: new Date(updatedVariant.createdAt),
      updatedAt: new Date(updatedVariant.updatedAt),
    };
  }

  async archiveVariant(variantId: string, tenantId: string): Promise<void> {
    const existing = await this.getVariant(variantId, tenantId);
    await this.patchProduct(existing.productId, tenantId, (product) => {
      const variants = (product.variants ?? []).map((variant: any) =>
        variant.id === variantId
          ? { ...variant, isActive: false, updatedAt: new Date().toISOString() }
          : variant
      );
      return { variants, stocks: this.aggregateVariantStock(product, variants) };
    });
  }

  async getPricing(productId: string, tenantId: string): Promise<any[]> {
    const product = await this.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Product not found");
    return (product.pricingRules ?? []).map((rule: any) => this.hydratePricing(rule));
  }

  async getPricingById(ruleId: string, tenantId: string): Promise<any> {
    return this.hydratePricing(await this.findPricing(ruleId, tenantId));
  }

  async createPricing(productId: string, tenantId: string, data: any): Promise<any> {
    const rule = {
      id: data.id ?? randomUUID(),
      productId,
      variantId: data.variantId ?? null,
      priceType: data.priceType,
      price: Number(data.price).toFixed(2),
      minQuantity: Number(data.minQuantity ?? 1),
      maxQuantity: data.maxQuantity ?? null,
      validFrom: data.validFrom ? new Date(data.validFrom).toISOString() : null,
      validTo: data.validTo ? new Date(data.validTo).toISOString() : null,
      isActive: data.isActive ?? true,
      tenantId,
      createdAt: new Date().toISOString(),
    };
    await this.patchProduct(productId, tenantId, (product) => {
      if (rule.variantId && !(product.variants ?? []).some((v: any) => v.id === rule.variantId)) {
        throw new NotFoundException("Variant not found");
      }
      return { pricingRules: [...(product.pricingRules ?? []), rule] };
    });
    return this.hydratePricing(rule);
  }

  async updatePricing(ruleId: string, tenantId: string, data: any): Promise<any> {
    const located = await this.findPricing(ruleId, tenantId);
    let updated: any;
    await this.patchProduct(located.productId, tenantId, (product) => {
      const pricingRules = (product.pricingRules ?? []).map((rule: any) => {
        if (rule.id !== ruleId) return rule;
        updated = {
          ...rule,
          ...data,
          id: ruleId,
          productId: located.productId,
          tenantId,
          price: data.price === undefined ? rule.price : Number(data.price).toFixed(2),
          validFrom:
            data.validFrom === undefined
              ? rule.validFrom
              : data.validFrom
                ? new Date(data.validFrom).toISOString()
                : null,
          validTo:
            data.validTo === undefined
              ? rule.validTo
              : data.validTo
                ? new Date(data.validTo).toISOString()
                : null,
        };
        if (updated.variantId && !(product.variants ?? []).some((v: any) => v.id === updated.variantId)) {
          throw new NotFoundException("Variant not found");
        }
        return updated;
      });
      return { pricingRules };
    });
    return this.hydratePricing(updated);
  }

  async deletePricing(ruleId: string, tenantId: string): Promise<void> {
    const located = await this.findPricing(ruleId, tenantId);
    await this.patchProduct(located.productId, tenantId, (product) => ({
      pricingRules: (product.pricingRules ?? []).filter((rule: any) => rule.id !== ruleId),
    }));
  }

  async getSellingPrices(
    productId: string,
    tenantId: string,
    variantId: string | null = null
  ): Promise<any[]> {
    const product = await this.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Product not found");
    return sortSellingPricesDesc(
      (product.sellingPrices ?? []).filter(
        (entry: any) => (entry.variantId ?? null) === variantId
      )
    );
  }

  async addSellingPrice(productId: string, tenantId: string, data: any): Promise<any> {
    const entryId = data.id ?? randomUUID();
    // Cheap pre-check so a sequential offline retry (the common case) never
    // triggers a redundant patchProduct write. The identical check stays
    // inside the patch callback below as a safety net for the rare case of
    // two concurrent requests racing between this read and that write.
    const existingProduct = await this.findById(productId, tenantId);
    if (!existingProduct) throw new NotFoundException("Product not found");
    const alreadyPresent = (existingProduct.sellingPrices ?? []).find(
      (entry: any) => entry.id === entryId
    );
    if (alreadyPresent) return alreadyPresent;

    let result: any;
    await this.patchProduct(productId, tenantId, (product) => {
      const existing = (product.sellingPrices ?? []).find((entry: any) => entry.id === entryId);
      if (existing) {
        result = existing;
        return {};
      }
      const variantId = this.assertVariantScope(product, data.variantId ?? null);
      const entry = {
        id: entryId,
        variantId,
        price: Number(data.price).toFixed(2),
        effectiveAt: data.effectiveAt
          ? new Date(data.effectiveAt).toISOString()
          : new Date().toISOString(),
        createdByUserId: data.createdByUserId,
        createdAt: new Date().toISOString(),
      };
      result = entry;
      return { sellingPrices: [...(product.sellingPrices ?? []), entry] };
    });
    return result;
  }

  async getPurchases(
    productId: string,
    tenantId: string,
    variantId: string | null = null
  ): Promise<any[]> {
    const product = await this.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Product not found");
    return sortPurchasesDesc(
      (product.purchases ?? []).filter(
        (entry: any) => (entry.variantId ?? null) === variantId
      )
    );
  }

  async addPurchase(productId: string, tenantId: string, data: any): Promise<{
    purchase: any;
    variantId: string | null;
    previousQuantity: number;
    previousCost: string;
    newQuantity: number;
    newCost: string;
    alreadyApplied: boolean;
  }> {
    const entryId = data.id ?? randomUUID();
    // Same pre-check as addSellingPrice: avoids a redundant patchProduct
    // write on a sequential offline retry, while the identical check inside
    // the patch callback below still guards the rare concurrent-race case.
    const existingProduct = await this.findById(productId, tenantId);
    if (!existingProduct) throw new NotFoundException("Product not found");
    const alreadyPresent = (existingProduct.purchases ?? []).find(
      (entry: any) => entry.id === entryId
    );
    if (alreadyPresent) {
      return {
        purchase: alreadyPresent,
        variantId: alreadyPresent.variantId,
        previousQuantity: 0,
        previousCost: "0.00",
        newQuantity: 0,
        newCost: "0.00",
        alreadyApplied: true,
      };
    }

    let outcome!: {
      purchase: any;
      variantId: string | null;
      previousQuantity: number;
      previousCost: string;
      newQuantity: number;
      newCost: string;
      alreadyApplied: boolean;
    };

    await this.patchProduct(productId, tenantId, (product) => {
      const existing = (product.purchases ?? []).find((entry: any) => entry.id === entryId);
      if (existing) {
        outcome = {
          purchase: existing,
          variantId: existing.variantId,
          previousQuantity: 0,
          previousCost: "0.00",
          newQuantity: 0,
          newCost: "0.00",
          alreadyApplied: true,
        };
        return {};
      }

      const variantId = this.assertVariantScope(product, data.variantId ?? null);
      const variant = variantId
        ? (product.variants ?? []).find((v: any) => v.id === variantId)
        : null;
      const currentQuantity = variantId
        ? Number(variant?.quantity ?? 0)
        : Number(product.stocks?.quantity ?? 0);
      const currentCost = Number(variantId ? (variant?.cost ?? 0) : (product.cost ?? 0));
      const unitCostConverted = Number(
        (Number(data.unitPurchasePrice) * Number(data.conversionRate)).toFixed(2)
      );
      const newQuantity = currentQuantity + Number(data.quantity);
      const newCost =
        newQuantity === 0
          ? unitCostConverted
          : Number(
              (
                (currentQuantity * currentCost + Number(data.quantity) * unitCostConverted) /
                newQuantity
              ).toFixed(2)
            );

      const purchase = {
        id: entryId,
        variantId,
        quantity: Number(data.quantity),
        unitPurchasePrice: Number(data.unitPurchasePrice).toFixed(2),
        purchaseCurrency: data.purchaseCurrency,
        conversionRate: Number(data.conversionRate).toFixed(4),
        referenceCurrency: data.referenceCurrency,
        unitCostConverted: unitCostConverted.toFixed(2),
        supplierId: data.supplierId ?? null,
        purchaseDate: data.purchaseDate
          ? new Date(data.purchaseDate).toISOString()
          : new Date().toISOString(),
        createdByUserId: data.createdByUserId,
        createdAt: new Date().toISOString(),
      };

      outcome = {
        purchase,
        variantId,
        previousQuantity: currentQuantity,
        previousCost: currentCost.toFixed(2),
        newQuantity,
        newCost: newCost.toFixed(2),
        alreadyApplied: false,
      };

      const purchases = [...(product.purchases ?? []), purchase];
      if (variantId) {
        const variants = (product.variants ?? []).map((v: any) =>
          v.id === variantId
            ? { ...v, cost: newCost.toFixed(2), quantity: newQuantity, updatedAt: new Date().toISOString() }
            : v
        );
        return { purchases, variants, stocks: this.aggregateVariantStock(product, variants) };
      }
      return {
        purchases,
        cost: newCost.toFixed(2),
        stocks: {
          ...(product.stocks ?? {}),
          quantity: newQuantity,
          lastUpdated: new Date().toISOString(),
        },
      };
    });

    return outcome;
  }

  async revertPurchaseImpact(
    productId: string,
    tenantId: string,
    variantId: string | null,
    previousQuantity: number,
    previousCost: string
  ): Promise<void> {
    await this.patchProduct(productId, tenantId, (product) => {
      if (variantId) {
        const variants = (product.variants ?? []).map((v: any) =>
          v.id === variantId
            ? { ...v, cost: previousCost, quantity: previousQuantity, updatedAt: new Date().toISOString() }
            : v
        );
        return { variants, stocks: this.aggregateVariantStock(product, variants) };
      }
      return {
        cost: previousCost,
        stocks: {
          ...(product.stocks ?? {}),
          quantity: previousQuantity,
          lastUpdated: new Date().toISOString(),
        },
      };
    });
  }

  async getProductAnalytics(
    productId: string,
    start: Date,
    end: Date,
    tenantId: string
  ): Promise<any[]> {
    const db = await this.database(tenantId);
    const result = await db.find({
      selector: {
        type: "sale",
        tenantId,
        createdAt: { $gte: start.toISOString(), $lte: end.toISOString() },
        items: { $elemMatch: { productId } },
      },
      limit: UNBOUNDED_LIMIT,
    });
    const byDate: Record<string, any> = {};
    for (const sale of result.docs as any[]) {
      const key = new Date(sale.createdAt).toISOString().slice(0, 10);
      byDate[key] ??= { date: key, views: 0, sales: 0, revenue: 0, cost: 0, profit: 0 };
      for (const item of (sale.items ?? []).filter((line: any) => line.productId === productId)) {
        const cost = Number(item.variant?.cost ?? item.product?.cost ?? 0);
        byDate[key].sales += Number(item.quantity);
        byDate[key].revenue += Number(item.unitPrice) * Number(item.quantity);
        byDate[key].cost += cost * Number(item.quantity);
        byDate[key].profit += (Number(item.unitPrice) - cost) * Number(item.quantity);
      }
    }
    return Object.values(byDate)
      .map((day: any) => ({
        ...day,
        date: new Date(day.date).toISOString(),
        revenue: day.revenue.toFixed(2),
        cost: day.cost.toFixed(2),
        profit: day.profit.toFixed(2),
      }))
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }

  private async doPatchField(
    productId: string,
    tenantId: string,
    field: "stocks" | "variants" | "isActive",
    value: unknown
  ): Promise<boolean> {
    try {
      const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
      const existing = await this.findExisting(db, productId);
      if (!existing) {
        this.logger.warn(
          `Skipped ${field} snapshot update for product ${productId}: product not yet recorded`
        );
        return false;
      }
      await db.insert({ ...existing, [field]: value, _id: existing._id } as any);
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to update ${field} snapshot for product ${productId}: ${error}`
      );
      return false;
    }
  }

  // Chains operations for the same product id so concurrent, un-awaited
  // callers (ProductsService fires these with `void`) can never complete out
  // of call order — e.g. an update's insert finishing after a later delete's
  // destroy, which would resurrect the document in CouchDB.
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

  private async doUpsert(
    product: Product,
    category: { id: string; name: string } | null
  ): Promise<boolean> {
    try {
      const db = await this.couchDBService.getDatabase(
        this.databaseName(product.tenantId)
      );
      const existing = await this.findExisting(db, product.id);
      await db.insert(
        {
          ...this.toDocument(product, category),
          initialQuantity: existing?.initialQuantity ?? 0,
          stocks: existing?.stocks ?? null,
          variants: existing?.variants ?? [],
          _id: couchDocumentId("product", product.id),
          id: product.id,
          ...(existing ? { _rev: existing._rev } : {}),
        } as any
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to record product ${product.id} to CouchDB: ${error}`
      );
      return false;
    }
  }

  private async doRemove(productId: string, tenantId: string): Promise<void> {
    try {
      const db = await this.couchDBService.getDatabase(
        this.databaseName(tenantId)
      );
      const existing = await this.findExisting(db, productId);
      if (!existing) return;
      await db.destroy(existing._id, existing._rev);
    } catch (error) {
      this.logger.warn(
        `Failed to remove product ${productId} from CouchDB: ${error}`
      );
    }
  }

  private async findExisting(
    db: DocumentScope<unknown>,
    id: string
  ): Promise<Record<string, any> | null> {
    try {
      const doc = await db.get(couchDocumentId("product", id));
      return doc as unknown as Record<string, any>;
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

  private async requireReference(
    db: DocumentScope<unknown>,
    id: string,
    tenantId: string,
    type: "category" | "supplier" | "rayon"
  ): Promise<Record<string, any>> {
    const label = this.referenceLabel(type);
    try {
      const doc = (await db.get(
        couchDocumentId(type, id)
      )) as unknown as Record<string, any>;
      if (doc.type !== type || doc.tenantId !== tenantId) {
        throw new NotFoundException(`${label} not found`);
      }
      return doc;
    } catch (error) {
      if (error instanceof NotFoundException || this.statusCode(error) === 404) {
        throw new NotFoundException(`${label} not found`);
      }
      throw this.unavailable(error);
    }
  }

  private referenceLabel(type: "category" | "supplier" | "rayon"): string {
    if (type === "category") return "Category";
    if (type === "supplier") return "Supplier";
    return "Rayon";
  }

  private async removeReservation(
    db: DocumentScope<unknown>,
    barcode: string,
    productId: string,
    variantId?: string
  ): Promise<void> {
    try {
      const reservation: any = await db.get(this.barcodeReservationId(barcode));
      const sameOwner =
        reservation.productId === productId &&
        (variantId
          ? reservation.variantId === variantId
          : reservation.variantId == null);
      if (sameOwner) {
        await db.destroy(reservation._id, reservation._rev);
      }
    } catch (error) {
      if (this.statusCode(error) !== 404) throw error;
    }
  }

  private async patchProduct(
    productId: string,
    tenantId: string,
    patch: (product: Record<string, any>) => Record<string, unknown>
  ): Promise<Record<string, any>> {
    const db = await this.database(tenantId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.findExisting(db, productId);
      if (!current || current.type !== "product" || current.tenantId !== tenantId) {
        throw new NotFoundException("Product not found");
      }
      const updated = {
        ...current,
        ...patch(current),
        _id: current._id,
        _rev: current._rev,
        id: productId,
        type: "product",
        tenantId,
        updatedAt: new Date().toISOString(),
      };
      try {
        await db.insert(updated as any);
        return updated;
      } catch (error) {
        if (this.statusCode(error) === 409 && attempt < 2) continue;
        if (this.statusCode(error) === 409) {
          throw new ConflictException("Product was modified concurrently");
        }
        throw this.unavailable(error);
      }
    }
    throw new ConflictException("Product was modified concurrently");
  }

  private assertVariantScope(
    product: Record<string, any>,
    variantId: string | null | undefined
  ): string | null {
    const hasVariants = (product.variants ?? []).some((v: any) => v.isActive !== false);
    if (!hasVariants) {
      if (variantId) {
        throw new BadRequestException(
          "This product has no variants; variantId must be omitted"
        );
      }
      return null;
    }
    if (!variantId) {
      throw new BadRequestException(
        "This product has variants; variantId is required"
      );
    }
    const variant = (product.variants ?? []).find(
      (v: any) => v.id === variantId && v.isActive !== false
    );
    if (!variant) {
      throw new VariantNotFoundException(variantId, product.id);
    }
    return variantId;
  }

  private aggregateVariantStock(product: Record<string, any>, variants: any[]) {
    return {
      quantity: variants.reduce(
        (sum, variant) =>
          sum + (variant.isActive !== false ? Number(variant.quantity ?? 0) : 0),
        0
      ),
      reservedQuantity: product.stocks?.reservedQuantity ?? 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  private async findPricing(ruleId: string, tenantId: string): Promise<any> {
    const db = await this.database(tenantId);
    const result = await db.find({
      selector: {
        type: "product",
        tenantId,
        pricingRules: { $elemMatch: { id: ruleId } },
      },
      limit: 1,
    });
    const product: any = result.docs[0];
    const rule = product?.pricingRules?.find((item: any) => item.id === ruleId);
    if (!rule) throw new NotFoundException("Pricing rule not found");
    return {
      ...rule,
      productId: product.id ?? publicDocumentId(product._id, "product"),
    };
  }

  private hydratePricing(rule: any): any {
    return {
      ...rule,
      validFrom: rule.validFrom ? new Date(rule.validFrom) : null,
      validTo: rule.validTo ? new Date(rule.validTo) : null,
      createdAt: new Date(rule.createdAt),
    };
  }

  private barcodeReservationId(barcode: string): string {
    return `barcode:${createHash("sha256").update(barcode).digest("hex")}`;
  }

  private statusCode(error: unknown): number | undefined {
    return typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : undefined;
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
  }

  private hydrate(doc: Record<string, any>): Product {
    return {
      id: doc.id ?? publicDocumentId(doc._id, "product"),
      name: doc.name,
      description: doc.description ?? null,
      price: doc.price,
      cost: doc.cost,
      barcode: doc.barcode ?? null,
      qrCode: doc.qrCode ?? null,
      categoryId: doc.categoryId ?? null,
      supplierId: doc.supplierId ?? null,
      rayonId: doc.rayonId ?? null,
      tenantId: doc.tenantId,
      minStockAlert: doc.minStockAlert ?? 10,
      isActive: doc.isActive !== false,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as Product;
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

  private toDocument(
    product: Product,
    category: { id: string; name: string } | null,
    rayon: { id: string; name: string } | null = null
  ) {
    return {
      type: "product" as const,
      id: product.id,
      name: product.name,
      description: product.description ?? null,
      price: product.price,
      cost: product.cost,
      barcode: product.barcode ?? null,
      qrCode: product.qrCode ?? null,
      categoryId: product.categoryId ?? null,
      category,
      supplierId: product.supplierId ?? null,
      rayonId: product.rayonId ?? null,
      rayon,
      tenantId: product.tenantId,
      minStockAlert: product.minStockAlert,
      isActive: product.isActive,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }
}
