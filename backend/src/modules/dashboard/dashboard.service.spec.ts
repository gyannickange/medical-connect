import { DashboardService } from "./dashboard.service";

describe("DashboardService", () => {
  describe("getMetrics", () => {
    it("aggregates product count, low stock count, today's sales total, and the top 10 low-stock alerts", async () => {
      const products = [{ id: "p1" }, { id: "p2" }, { id: "p3" }];
      const lowStock = Array.from({ length: 12 }, (_, i) => ({
        id: `low-${i}`,
      }));
      const todaysSales = {
        sales: Array.from({ length: 8 }, (_, i) => ({ id: `sale-${i}` })),
        count: 8,
        total: "123.45",
      };

      const productsService = {
        findByTenant: jest.fn().mockResolvedValue(products),
      };
      const stockService = {
        findLowStock: jest.fn().mockResolvedValue(lowStock),
      };
      const salesService = {
        getTodaysSales: jest.fn().mockResolvedValue(todaysSales),
      };

      const service = new DashboardService(
        productsService as any,
        stockService as any,
        salesService as any
      );

      const result = await service.getMetrics("tenant-1");

      expect(result.totalProducts).toBe(3);
      expect(result.lowStockItems).toBe(12);
      expect(result.todaysSales).toBe("123.45");
      expect(result.lowStockAlerts).toEqual(lowStock.slice(0, 10));
    });

    it("returns the 5 most recent sales, most recent first", async () => {
      const sales = Array.from({ length: 8 }, (_, i) => ({ id: `sale-${i}` }));
      const productsService = { findByTenant: jest.fn().mockResolvedValue([]) };
      const stockService = { findLowStock: jest.fn().mockResolvedValue([]) };
      const salesService = {
        getTodaysSales: jest.fn().mockResolvedValue({
          sales,
          count: 8,
          total: "0.00",
        }),
      };

      const service = new DashboardService(
        productsService as any,
        stockService as any,
        salesService as any
      );

      const result = await service.getMetrics("tenant-1");

      expect(result.recentSales).toEqual([
        sales[7],
        sales[6],
        sales[5],
        sales[4],
        sales[3],
      ]);
    });
  });
});
