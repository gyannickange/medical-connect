import { Injectable } from "@nestjs/common";
import { ProductsService } from "../products/products.service";
import { StockService } from "../stock/stock.service";
import { SalesService } from "../sales/sales.service";

@Injectable()
export class DashboardService {
  constructor(
    private readonly productsService: ProductsService,
    private readonly stockService: StockService,
    private readonly salesService: SalesService
  ) {}

  async getMetrics(tenantId: string) {
    const [products, lowStock, todaysSales] = await Promise.all([
      this.productsService.findByTenant(tenantId),
      this.stockService.findLowStock(tenantId),
      this.salesService.getTodaysSales(tenantId),
    ]);

    return {
      totalProducts: products.length,
      lowStockItems: lowStock.length,
      todaysSales: todaysSales.total,
      recentSales: todaysSales.sales.slice(-5).reverse(),
      lowStockAlerts: lowStock.slice(0, 10),
    };
  }
}
