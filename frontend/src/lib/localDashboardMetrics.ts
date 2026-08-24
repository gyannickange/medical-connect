import { getCachedResponse, listCacheKeyFor } from "./offlineCache";

/**
 * Recomputes /api/dashboard/:tenantId's aggregate client-side from the
 * products and sales lists that are already correctly cached, mirroring
 * DashboardService.getMetrics on the backend (totalProducts, lowStockItems,
 * todaysSales, recentSales, lowStockAlerts). A local install - or a
 * temporarily offline connected one - never reaches the server for this
 * endpoint, and unlike a plain list there is no raw "dashboard" data to
 * queue and replay; the only way to have real numbers here is to derive
 * them from data already on the device.
 */
export interface DashboardMetrics {
  totalProducts: number;
  lowStockItems: number;
  todaysSales: string;
  recentSales: Record<string, unknown>[];
  lowStockAlerts: Record<string, unknown>[];
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function computeLocalDashboardMetrics(
  products: Record<string, unknown>[],
  sales: Record<string, unknown>[]
): DashboardMetrics {
  const now = new Date();

  const todaysSales = sales.filter((sale) => {
    const createdAt = sale.createdAt ? new Date(sale.createdAt as string) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) && isSameDay(createdAt, now);
  });

  const todaysSalesTotal = todaysSales.reduce(
    (sum, sale) => sum + (parseFloat(String(sale.total ?? 0)) || 0),
    0
  );

  const recentSales = [...todaysSales]
    .sort(
      (a, b) =>
        new Date(a.createdAt as string).getTime() -
        new Date(b.createdAt as string).getTime()
    )
    .slice(-5)
    .reverse();

  const lowStockAlerts = products
    .filter((product) => {
      const stocks = product.stocks as Record<string, unknown> | null | undefined;
      const quantity = (stocks?.quantity as number) ?? 0;
      const minStockAlert = (product.minStockAlert as number) ?? 0;
      return quantity <= minStockAlert;
    })
    .slice(0, 10)
    .map((product) => ({
      id: product.id,
      quantity: (product.stocks as Record<string, unknown> | null)?.quantity ?? 0,
      product: { id: product.id, name: product.name },
    }));

  return {
    totalProducts: products.length,
    lowStockItems: lowStockAlerts.length,
    todaysSales: todaysSalesTotal.toFixed(2),
    recentSales,
    lowStockAlerts,
  };
}

export async function getLocalDashboardMetrics(
  tenantId: string
): Promise<DashboardMetrics> {
  const [products, sales] = await Promise.all([
    getCachedResponse(listCacheKeyFor("products", tenantId), "products"),
    getCachedResponse(listCacheKeyFor("sales", tenantId), "sales"),
  ]);
  return computeLocalDashboardMetrics(
    (products as Record<string, unknown>[]) ?? [],
    (sales as Record<string, unknown>[]) ?? []
  );
}
