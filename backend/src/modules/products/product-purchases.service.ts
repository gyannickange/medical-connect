import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { PurchaseEntry, StockMovement } from "@shared/schema";
import { ProductsRepository } from "./products.repository";
import { StockRepository } from "../stock/stock.repository";
import { SettingsService } from "../settings/settings.service";
import type { CreatePurchaseDto } from "./dto/product-purchase.dto";

@Injectable()
export class ProductPurchasesService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly stockRepository: StockRepository,
    private readonly settingsService: SettingsService
  ) {}

  async getPurchases(
    productId: string,
    tenantId: string,
    variantId?: string | null
  ): Promise<PurchaseEntry[]> {
    return this.productsRepository.getPurchases(productId, tenantId, variantId ?? null);
  }

  async addPurchase(
    productId: string,
    tenantId: string,
    dto: CreatePurchaseDto,
    userId: string
  ): Promise<PurchaseEntry> {
    const referenceCurrency = (await this.settingsService.getReferenceCurrency(tenantId))
      .trim()
      .toUpperCase();
    const purchaseCurrency = dto.purchaseCurrency.trim().toUpperCase();
    const conversionRate = purchaseCurrency === referenceCurrency ? 1 : dto.conversionRate;

    const result = await this.productsRepository.addPurchase(productId, tenantId, {
      id: dto.id,
      variantId: dto.variantId ?? null,
      quantity: dto.quantity,
      unitPurchasePrice: dto.unitPurchasePrice,
      purchaseCurrency,
      conversionRate,
      referenceCurrency,
      supplierId: dto.supplierId ?? null,
      purchaseDate: dto.purchaseDate,
      createdByUserId: userId,
    });

    if (result.alreadyApplied) {
      return result.purchase;
    }

    try {
      await this.stockRepository.recordRequired({
        id: randomUUID(),
        productId,
        variantId: result.variantId,
        type: "entry",
        quantity: result.purchase.quantity,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
        reason: "purchase",
        priceType: null,
        unitPrice: result.purchase.unitCostConverted,
        purchaseId: result.purchase.id,
        userId,
        tenantId,
        createdAt: new Date(),
      } as StockMovement);
    } catch (error) {
      // Same guard as StockService.adjust()'s own compensating call: if the
      // revert itself fails too, swallow that second failure so the caller
      // still sees the original stock-movement error instead of a
      // misleading one from the rollback attempt.
      await this.productsRepository
        .revertPurchaseImpact(
          productId,
          tenantId,
          result.variantId,
          result.previousQuantity,
          result.previousCost
        )
        .catch(() => undefined);
      throw error;
    }

    return result.purchase;
  }
}
