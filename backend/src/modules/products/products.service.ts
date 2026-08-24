import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { PaginationOptions } from "../../lib/pagination";
import type {
  Product,
  InsertProduct,
  ProductVariant,
  InsertProductVariant,
  ProductPricing,
  StockMovement,
} from "@shared/schema";
import { normalizeBarcode } from "../../lib/exceptions";
import { ProductsRepository } from "./products.repository";
import { ProductsLockService } from "./products-lock.service";
import { StockRepository } from "../stock/stock.repository";
import type {
  CreateProductPricingDto,
  UpdateProductPricingDto,
} from "./dto/product-pricing.dto";
import type { CreateSellingPriceDto } from "./dto/product-selling-price.dto";

@Injectable()
export class ProductsService {
  constructor(
    private readonly embeddedRepository: ProductsRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly productsLockService?: ProductsLockService,
    private readonly stockRepository?: StockRepository
  ) {}

  // Parse date range string to Date objects
  private parseDateRange(dateRange: string): { start: Date; end: Date } {
    const now = new Date();
    let days = 7; // default

    switch (dateRange) {
      case "7d":
        days = 7;
        break;
      case "30d":
        days = 30;
        break;
      case "90d":
        days = 90;
        break;
      default:
        days = 7;
    }

    const start = new Date(now);
    start.setDate(start.getDate() - days);
    start.setHours(0, 0, 0, 0); // Start of day

    const end = new Date(now);
    end.setHours(23, 59, 59, 999); // End of today

    return { start, end };
  }

  async findByTenant(
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    return this.productsRepository.findByTenant(tenantId, options);
  }

  async search(
    query: string,
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    return this.productsRepository.search(query, tenantId, options);
  }

  async findByBarcode(barcode: string, tenantId: string): Promise<any> {
    const product = await this.productsRepository.findByBarcode(barcode, tenantId);
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    return product;
  }

  async create(data: InsertProduct): Promise<Product> {
    return this.productsRepository.create({
      ...data,
      barcode: normalizeBarcode(data.barcode),
    });
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertProduct>,
    deviceId?: string
  ): Promise<Product> {
    const existing = await this.productsRepository.findById(id, tenantId);
    if (!existing) {
      throw new NotFoundException("Product not found");
    }
    await this.productsLockService?.assertHeldByDevice(
      id,
      tenantId,
      deviceId
    );

    const updates = { ...data } as Record<string, unknown>;
    if (data.barcode !== undefined) {
      updates.barcode = normalizeBarcode(data.barcode);
    }
    if (updates.cost !== undefined) {
      updates.cost = Number(updates.cost).toFixed(2);
    }
    return this.productsRepository.update(
      id,
      tenantId,
      updates as Partial<InsertProduct>
    );
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.productsRepository.archiveRequired(id, tenantId);
  }

  // Product Variants
  async getVariants(productId: string, tenantId: string): Promise<ProductVariant[]> {
    return this.embeddedRepository.getVariants(productId, tenantId);
  }

  async getVariant(id: string, tenantId: string): Promise<ProductVariant> {
    return this.embeddedRepository.getVariant(id, tenantId);
  }

  async createVariant(
    data: InsertProductVariant,
    _userId: string | undefined,
    tenantId: string
  ): Promise<ProductVariant> {
    const product = await this.productsRepository.findById(data.productId, tenantId);
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    const dataWithInheritedMinStock = {
      ...data,
      minStockAlert: product.minStockAlert,
    };
    return this.embeddedRepository.createVariant(
      dataWithInheritedMinStock,
      tenantId
    );
  }

  async updateVariant(
    id: string,
    tenantId: string,
    data: Partial<InsertProductVariant>
  ): Promise<ProductVariant> {
    const existing =
      data.quantity === undefined
        ? null
        : await this.embeddedRepository.getVariant(id, tenantId);
    const dataWithInheritedMinStock = { ...data } as Record<string, unknown>;
    if (dataWithInheritedMinStock.cost !== undefined) {
      dataWithInheritedMinStock.cost = Number(dataWithInheritedMinStock.cost).toFixed(2);
    }
    const updated = await this.embeddedRepository.updateVariant(
      id,
      tenantId,
      dataWithInheritedMinStock
    );
    if (existing && this.stockRepository) {
      const previousQuantity = Number(existing.quantity ?? 0);
      const newQuantity = Number(updated.quantity ?? data.quantity ?? 0);
      const delta = newQuantity - previousQuantity;
      if (delta !== 0) {
        try {
          await this.stockRepository.recordRequired({
            id: randomUUID(),
            productId: existing.productId,
            variantId: id,
            type: delta > 0 ? "entry" : "exit",
            quantity: Math.abs(delta),
            previousQuantity,
            newQuantity,
            reason: "Stock correction from variant update",
            priceType: null,
            unitPrice: null,
            purchaseId: null,
            userId: null,
            tenantId,
            createdAt: new Date(),
          } as StockMovement);
        } catch (error) {
          await this.embeddedRepository
            .updateVariant(id, tenantId, { quantity: previousQuantity })
            .catch(() => undefined);
          throw error;
        }
      }
    }
    return updated;
  }

  async deleteVariant(id: string, tenantId: string): Promise<void> {
    await this.embeddedRepository.archiveVariant(id, tenantId);
  }

  // Product Analytics
  async getProductAnalytics(
    productId: string,
    dateRange: string,
    tenantId: string
  ): Promise<any[]> {
    const { start, end } = this.parseDateRange(dateRange);
    return this.embeddedRepository.getProductAnalytics(
      productId,
      start,
      end,
      tenantId
    );
  }

  // Product Price Calculation
  async calculateProductPrice(
    productId: string,
    quantity: number,
    tenantId: string,
    variantId?: string,
    priceType?: string
  ): Promise<{ price: string; rule?: any }> {
    await this.assertPricingOwnership(productId, tenantId, variantId);
    return this.embeddedRepository.calculateProductPrice(
      tenantId,
      productId,
      quantity,
      variantId,
      priceType
    );
  }

  // Product Pricing CRUD
  private validatePricingRule(rule: {
    price: number | string;
    minQuantity: number;
    maxQuantity?: number | null;
    validFrom?: Date | string | null;
    validTo?: Date | string | null;
  }): void {
    if (Number(rule.price) <= 0 || rule.minQuantity < 1) {
      throw new BadRequestException("Price and minimum quantity must be positive");
    }
    if (rule.maxQuantity != null && rule.maxQuantity < rule.minQuantity) {
      throw new BadRequestException("Maximum quantity cannot be below minimum quantity");
    }
    if (
      rule.validFrom &&
      rule.validTo &&
      new Date(rule.validTo).getTime() < new Date(rule.validFrom).getTime()
    ) {
      throw new BadRequestException("Valid-to date cannot be before valid-from date");
    }
  }

  private async assertPricingOwnership(
    productId: string,
    tenantId: string,
    variantId?: string | null
  ): Promise<void> {
    const product = await this.productsRepository.findById(productId, tenantId);
    if (!product) {
      throw new NotFoundException("Product not found");
    }
    if (variantId) {
      const variant = (product.variants ?? []).find((item: any) => item.id === variantId);
      if (
        !variant ||
        variant.id !== variantId
      ) {
        throw new NotFoundException("Variant not found");
      }
    }
  }

  async getProductPricing(productId: string, tenantId: string): Promise<ProductPricing[]> {
    await this.assertPricingOwnership(productId, tenantId);
    return this.embeddedRepository.getPricing(productId, tenantId);
  }

  async createProductPricing(
    data: CreateProductPricingDto & { productId: string },
    tenantId: string
  ): Promise<ProductPricing> {
    this.validatePricingRule(data);
    await this.assertPricingOwnership(data.productId, tenantId, data.variantId);
    return this.embeddedRepository.createPricing(data.productId, tenantId, data);
  }

  async updateProductPricing(
    id: string,
    data: UpdateProductPricingDto,
    tenantId: string
  ): Promise<ProductPricing> {
    const existing = await this.embeddedRepository.getPricingById(id, tenantId);
    const merged = { ...existing, ...data };
    this.validatePricingRule(merged);
    await this.assertPricingOwnership(existing.productId, tenantId, merged.variantId);
    const updates: any = {
      ...data,
      ...(data.price === undefined ? {} : { price: Number(data.price).toFixed(2) }),
    };
    return this.embeddedRepository.updatePricing(id, tenantId, updates);
  }

  async deleteProductPricing(id: string, tenantId: string): Promise<void> {
    await this.embeddedRepository.deletePricing(id, tenantId);
  }

  async getSellingPrices(
    productId: string,
    tenantId: string,
    variantId?: string | null
  ) {
    return this.embeddedRepository.getSellingPrices(productId, tenantId, variantId ?? null);
  }

  async addSellingPrice(
    productId: string,
    tenantId: string,
    data: CreateSellingPriceDto,
    userId: string
  ) {
    return this.embeddedRepository.addSellingPrice(productId, tenantId, {
      ...data,
      createdByUserId: userId,
    });
  }
}
