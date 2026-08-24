import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { PaginationOptions } from "../../lib/pagination";
import type { Stock, StockMovement } from "@shared/schema";
import { StockRepository } from "./stock.repository";
import { ProductsRepository } from "../products/products.repository";

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    private readonly stockRepository: StockRepository,
    private readonly productsRepository: ProductsRepository
  ) {}

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const [stocks, quantities] = await Promise.all([
      this.productsRepository.findWithStock(tenantId, options),
      this.stockRepository.findProjectedQuantities(tenantId),
    ]);
    return stocks.map((stock) => this.applyProjection(stock, quantities));
  }

  async findLowStock(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const [stocks, quantities] = await Promise.all([
      this.productsRepository.findWithStock(tenantId, {
        limit: 100_000,
        offset: 0,
      }),
      this.stockRepository.findProjectedQuantities(tenantId),
    ]);
    const lowStock = stocks
      .map((stock) => this.applyProjection(stock, quantities))
      .filter((stock) => stock.quantity <= Number(stock.product?.minStockAlert ?? 0));
    const limit = options?.limit ?? 100;
    const skip = options?.offset ?? (options?.page ?? 0) * limit;
    return lowStock.slice(skip, skip + limit);
  }

  async stockEntry(
    productId: string,
    quantity: number,
    reason: string | undefined,
    userId: string,
    tenantId: string
  ): Promise<Stock> {
    this.logger.log(
      `Stock entry: productId=${productId}, quantity=${quantity}, reason=${reason ?? "(none)"}`
    );
    return this.adjust(productId, null, quantity, "entry", reason, userId, tenantId);
  }

  async stockExit(
    productId: string,
    quantity: number,
    reason: string | undefined,
    userId: string,
    tenantId: string
  ): Promise<Stock> {
    return this.adjust(productId, null, -quantity, "exit", reason, userId, tenantId);
  }

  async getMovementsByProduct(productId: string, tenantId: string): Promise<StockMovement[]> {
    return this.stockRepository.findByProduct(productId, tenantId);
  }

  async getMovementsByVariant(variantId: string, tenantId: string): Promise<StockMovement[]> {
    return this.stockRepository.findByVariant(variantId, tenantId);
  }

  async variantStockEntry(
    variantId: string,
    quantity: number,
    reason: string | undefined,
    userId: string,
    tenantId: string,
    productId: string
  ): Promise<any> {
    await this.adjust(productId, variantId, quantity, "entry", reason, userId, tenantId);
    return this.updatedVariant(productId, variantId, tenantId);
  }

  async variantStockExit(
    variantId: string,
    quantity: number,
    reason: string,
    userId: string,
    tenantId: string,
    productId: string
  ): Promise<any> {
    await this.adjust(productId, variantId, -quantity, "exit", reason, userId, tenantId);
    return this.updatedVariant(productId, variantId, tenantId);
  }

  private async adjust(
    productId: string,
    variantId: string | null,
    delta: number,
    type: "entry" | "exit",
    reason: string | undefined,
    userId: string,
    tenantId: string
  ): Promise<Stock> {
    const result = await this.productsRepository.adjustStock(
      productId,
      tenantId,
      delta,
      variantId
    );
    const movement = {
      id: randomUUID(),
      productId,
      variantId,
      type,
      quantity: Math.abs(delta),
      previousQuantity: result.previousQuantity,
      newQuantity: result.newQuantity,
      reason: reason || null,
      priceType: null,
      unitPrice: null,
      purchaseId: null,
      userId,
      tenantId,
      createdAt: new Date(),
    } as StockMovement;

    try {
      await this.stockRepository.recordRequired(movement);
    } catch (error) {
      await this.productsRepository
        .adjustStock(productId, tenantId, -delta, variantId)
        .catch(() => undefined);
      throw error;
    }

    const product = await this.productsRepository.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Stock not found");
    return {
      id: productId,
      productId,
      quantity: product.stocks?.quantity ?? result.newQuantity,
      reservedQuantity: product.stocks?.reservedQuantity ?? 0,
      tenantId,
      lastUpdated: new Date(product.stocks?.lastUpdated ?? movement.createdAt),
    } as Stock;
  }

  private async updatedVariant(productId: string, variantId: string, tenantId: string) {
    const product = await this.productsRepository.findById(productId, tenantId);
    const variant = product?.variants?.find((item: any) => item.id === variantId);
    if (!variant) throw new NotFoundException("Variant not found");
    return variant;
  }

  private applyProjection(stock: any, quantities: Record<string, number>): any {
    const productId = stock.productId ?? stock.id;
    return {
      ...stock,
      quantity: quantities[productId] ?? 0,
      product: stock.product
        ? {
            ...stock.product,
            variants: (stock.product.variants ?? []).map((variant: any) => ({
              ...variant,
              quantity: quantities[`${productId}::${variant.id}`] ?? 0,
            })),
          }
        : stock.product,
    };
  }
}
