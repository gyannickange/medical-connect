import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { PaginationOptions } from "../../lib/pagination";
import { PriceMismatchException, VariantNotFoundException } from "../../lib/exceptions";
import type { Sale, InsertSale, InsertSaleItem, StockMovement } from "@shared/schema";
import { StockRepository } from "../stock/stock.repository";
import { ProductsRepository } from "../products/products.repository";
import { CustomersRepository } from "../customers/customers.repository";
import {
  SalesRepository,
  type SaleItemSnapshot,
  type SaleCustomerSnapshot,
} from "./sales.repository";

// Narrow shape matching the fields guaranteed by the validated CreateSaleDto.
type RawSaleItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
  unitPrice: number | string;
  totalPrice: number | string;
  priceType?: string | null;
  pricingId?: string | null;
};

interface ResolvedSaleItem {
  item: RawSaleItem;
  itemQty: number;
  unitPriceServer: number;
  itemTotal: number;
  product: any;
  variant: any | null;
}

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly pricingRepository: ProductsRepository,
    private readonly salesRepository: SalesRepository,
    private readonly productsRepository: ProductsRepository,
    private readonly customersRepository: CustomersRepository,
    private readonly stockRepository?: StockRepository
  ) {}

  async findByTenant(
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    return this.salesRepository.findByTenant(tenantId, options);
  }

  async getTodaysSales(tenantId: string, options?: PaginationOptions) {
    const sales = await this.salesRepository.getTodaysSales(tenantId, options);
    const totalSales = sales.reduce(
      (sum, sale) => sum + parseFloat(sale.total),
      0
    );

    return {
      sales,
      count: sales.length,
      total: totalSales.toFixed(2),
    };
  }

  async getSalesReport(
    tenantId: string,
    startDate: Date,
    endDate: Date
  ): Promise<any[]> {
    return this.salesRepository.findByDateRange(tenantId, startDate, endDate);
  }

  async getSalesByProduct(productId: string, tenantId: string): Promise<any[]> {
    return this.salesRepository.findByProduct(productId, tenantId);
  }

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

  async getSalesAnalytics(dateRange: string, tenantId: string): Promise<any[]> {
    const { start, end } = this.parseDateRange(dateRange);
    const salesInRange = await this.salesRepository.findByDateRange(
      tenantId,
      start,
      end
    );
    return this.aggregateByDate(salesInRange);
  }

  // Groups sale items by day, using each item's frozen product/variant cost
  // snapshot (not the product's current cost) so a later price/cost change
  // never rewrites the profit of a past sale.
  private aggregateByDate(sales: any[]): any[] {
    const groupedByDate = sales.reduce(
      (acc, sale) => {
        for (const item of sale.items ?? []) {
          const dateKey = new Date(sale.createdAt).toISOString().split("T")[0];

          if (!acc[dateKey]) {
            acc[dateKey] = {
              date: dateKey,
              views: 0,
              sales: 0,
              revenue: 0,
              cost: 0,
              profit: 0,
            };
          }

          const quantity = item.quantity;
          const unitPrice = parseFloat(item.unitPrice);
          const cost = parseFloat(
            String(item.variant?.cost ?? item.product?.cost ?? "0")
          );

          acc[dateKey].sales += quantity;
          acc[dateKey].revenue += unitPrice * quantity;
          acc[dateKey].cost += cost * quantity;
          acc[dateKey].profit += (unitPrice - cost) * quantity;
        }
        return acc;
      },
      {} as Record<string, any>
    );

    const result = Object.values(groupedByDate).map((day: any) => ({
      date: new Date(day.date).toISOString(),
      views: day.views,
      sales: day.sales,
      revenue: day.revenue.toFixed(2),
      cost: day.cost.toFixed(2),
      profit: day.profit.toFixed(2),
    }));

    return result.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
  }

  /**
   * Creates a sale entirely against CouchDB - no Postgres transaction backs
   * this anymore. In place of one atomic transaction, this runs as an
   * explicit saga: resolve + verify (read-only), decrement stock item by
   * item with optimistic-concurrency retry (ProductsRepository.adjustStock),
   * then persist the sale document. If any step in the stock phase fails,
   * every already-applied decrement for this sale is reverted before the
   * error propagates. If persisting the sale document itself fails, the
   * same rollback runs - a sale is never reported successful while stock
   * silently failed to record it.
   */
  async create(saleData: InsertSale, items: InsertSaleItem[]): Promise<Sale> {
    const rawSaleData = saleData as unknown as {
      customerId?: string | null;
      userId: string;
      tenantId: string;
      tax?: number | string | null;
      total: number | string;
      paymentMethod: "cash" | "card" | "mobile";
      status?: "pending" | "completed" | "cancelled" | "refunded";
      id?: string;
    };
    const rawItems = items as unknown as RawSaleItem[];
    const tenantId = String(rawSaleData.tenantId);

    if (rawSaleData.id) {
      const replayed = await this.salesRepository.findById(rawSaleData.id, tenantId);
      if (replayed) return replayed;
    }

    const { resolved, computedSubtotal, computedTax, computedTotal, totalProfit } =
      await this.resolveAndVerify(rawSaleData, rawItems, tenantId);

    const saleId = rawSaleData.id ?? randomUUID();
    const applied: Array<{ productId: string; variantId: string | null; quantity: number }> = [];
    const movements: StockMovement[] = [];

    try {
      for (const r of resolved) {
        const variantId = r.item.variantId ?? null;
        const { previousQuantity, newQuantity } = await this.productsRepository.adjustStock(
          r.item.productId,
          tenantId,
          -r.itemQty,
          variantId
        );
        applied.push({ productId: r.item.productId, variantId, quantity: r.itemQty });
        movements.push({
          id: randomUUID(),
          productId: r.item.productId,
          variantId,
          type: "exit",
          quantity: r.itemQty,
          previousQuantity,
          newQuantity,
          reason: `Sale-${Date.now()}`,
          priceType: r.item.priceType ?? null,
          unitPrice: String(r.unitPriceServer.toFixed(2)),
          userId: rawSaleData.userId,
          tenantId,
          createdAt: new Date(),
        } as unknown as StockMovement);
      }
    } catch (error) {
      await this.rollbackStock(applied, tenantId, saleId);
      throw error;
    }

    const sale: Sale = {
      id: saleId,
      saleNumber: `SALE-${Date.now()}`,
      customerId: rawSaleData.customerId ?? null,
      userId: rawSaleData.userId,
      subtotal: String(computedSubtotal.toFixed(2)),
      tax: String(computedTax.toFixed(2)),
      total: String(computedTotal.toFixed(2)),
      profit: String(totalProfit.toFixed(2)),
      qrCode: this.generateQrCode(saleId),
      paymentMethod: rawSaleData.paymentMethod,
      status: rawSaleData.status ?? "completed",
      tenantId,
      createdAt: new Date(),
    } as unknown as Sale;

    const enrichedItems = resolved.map((r) => this.toItemSnapshot(r));
    const customer = await this.resolveCustomerSnapshot(sale.customerId, tenantId);

    const stockEffects = movements.map((movement) => ({
      productId: movement.productId,
      variantId: movement.variantId,
      quantity: movement.quantity,
      previousQuantity: movement.previousQuantity,
      newQuantity: movement.newQuantity,
    }));
    const recorded = await this.salesRepository.record(
      sale,
      enrichedItems,
      customer,
      stockEffects
    );
    if (!recorded) {
      await this.rollbackStock(applied, tenantId, saleId);
      const replayed = await this.salesRepository.findById(sale.id, tenantId);
      if (replayed) return replayed;
      throw new Error(`Failed to persist sale ${sale.id}`);
    }

    return sale;
  }

  private async resolveAndVerify(
    rawSaleData: { tax?: number | string | null; total: number | string },
    rawItems: RawSaleItem[],
    tenantId: string
  ): Promise<{
    resolved: ResolvedSaleItem[];
    computedSubtotal: number;
    computedTax: number;
    computedTotal: number;
    totalProfit: number;
  }> {
    const resolved: ResolvedSaleItem[] = [];
    let computedSubtotal = 0;
    let totalProfit = 0;

    for (const item of rawItems) {
      const itemQty = Number(item.quantity);
      const product = await this.productsRepository.findById(item.productId, tenantId);
      if (!product) {
        throw new NotFoundException(`Product ${item.productId} not found`);
      }

      let cost = parseFloat(String(product.cost ?? "0"));
      let variant: any = null;

      if (item.variantId) {
        variant = (product.variants ?? []).find((v: any) => v.id === item.variantId) ?? null;
        if (!variant) {
          throw new VariantNotFoundException(item.variantId, item.productId);
        }
        if (variant.cost != null) {
          cost = parseFloat(String(variant.cost));
        }
      }

      const priceResult = await this.pricingRepository.calculateProductPrice(
        tenantId,
        item.productId,
        itemQty,
        item.variantId ?? undefined,
        item.priceType ?? undefined
      );
      const unitPriceServer = parseFloat(priceResult.price);

      const itemTotal = parseFloat((unitPriceServer * itemQty).toFixed(2));
      computedSubtotal = parseFloat((computedSubtotal + itemTotal).toFixed(2));
      totalProfit += (unitPriceServer - cost) * itemQty;

      resolved.push({ item, itemQty, unitPriceServer, itemTotal, product, variant });
    }

    computedSubtotal = parseFloat(computedSubtotal.toFixed(2));
    const computedTax =
      rawSaleData.tax != null ? parseFloat(Number(rawSaleData.tax).toFixed(2)) : 0;
    const computedTotal = parseFloat((computedSubtotal + computedTax).toFixed(2));
    totalProfit = parseFloat(totalProfit.toFixed(2));

    const clientTotal = parseFloat(Number(rawSaleData.total).toFixed(2));
    if (clientTotal !== computedTotal) {
      throw new PriceMismatchException("total", String(clientTotal), String(computedTotal));
    }

    return { resolved, computedSubtotal, computedTax, computedTotal, totalProfit };
  }

  private async rollbackStock(
    applied: Array<{ productId: string; variantId: string | null; quantity: number }>,
    tenantId: string,
    saleId: string
  ): Promise<void> {
    for (const a of [...applied].reverse()) {
      await this.productsRepository
        .adjustStock(a.productId, tenantId, a.quantity, a.variantId)
        .catch((rollbackError) => {
          // Best-effort compensation: the original error is still what
          // surfaces to the caller, and a stuck rollback here would need
          // manual reconciliation either way - but that reconciliation is
          // only possible if this failure is visible, so it must never be
          // swallowed silently.
          this.logger.error(
            `Stock rollback FAILED for sale ${saleId}, tenant ${tenantId}: ` +
              `could not restore product ${a.productId}${a.variantId ? ` (variant ${a.variantId})` : ""} ` +
              `by ${a.quantity}. Stock is now out of sync and needs manual reconciliation.`,
            rollbackError instanceof Error ? rollbackError.stack : String(rollbackError)
          );
        });
    }
  }

  private generateQrCode(saleId: string): string {
    const timestamp = Date.now();
    const uniqueSegment = randomUUID().substring(0, 8);
    return `${timestamp}-${uniqueSegment}-${saleId.substring(0, 8)}`;
  }

  private toItemSnapshot(r: ResolvedSaleItem): SaleItemSnapshot {
    return {
      productId: r.item.productId,
      variantId: r.item.variantId ?? null,
      quantity: r.itemQty,
      unitPrice: String(r.unitPriceServer.toFixed(2)),
      totalPrice: String(r.itemTotal.toFixed(2)),
      priceType: r.item.priceType ?? null,
      pricingId: r.item.pricingId ?? null,
      product: {
        id: r.product._id,
        name: r.product.name,
        description: r.product.description ?? null,
        cost: r.product.cost,
      },
      variant: r.variant
        ? {
            id: r.variant.id,
            sku: r.variant.sku ?? null,
            attributes: r.variant.attributes,
            price: r.variant.price ?? null,
            cost: r.variant.cost ?? null,
          }
        : null,
    };
  }

  private async resolveCustomerSnapshot(
    customerId: string | null | undefined,
    tenantId: string
  ): Promise<SaleCustomerSnapshot | null> {
    if (!customerId) return null;
    try {
      const customer = await this.customersRepository.findById(customerId, tenantId);
      return customer
        ? { id: customer.id, name: `${customer.firstName} ${customer.lastName}` }
        : null;
    } catch {
      return null;
    }
  }

}
