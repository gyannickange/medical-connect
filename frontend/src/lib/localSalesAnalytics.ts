import { getCachedResponse, listCacheKeyFor } from "./offlineCache";

/**
 * Recomputes /api/sales/analytics/:tenantId and /api/sales/:tenantId/report/
 * :start/:end client-side from the sales list that's already correctly
 * cached, mirroring SalesService.getSalesAnalytics/getSalesReport on the
 * backend. Same rationale as localDashboardMetrics.ts: a local install (or
 * a temporarily offline connected one) never reaches the server for these,
 * and there's no raw "analytics"/"report" data to queue and replay - the
 * only way to have real numbers is to derive them from the sales already
 * on the device.
 */

export interface DailySalesAnalytics {
  date: string;
  views: number;
  sales: number;
  revenue: string;
  cost: string;
  profit: string;
}

const DATE_RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function parseDateRangeParam(dateRange: string): { start: Date; end: Date } {
  const days = DATE_RANGE_DAYS[dateRange] ?? 7;
  const now = new Date();

  const start = new Date(now);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

function withinRange(createdAt: unknown, start: Date, end: Date): boolean {
  if (typeof createdAt !== "string") return false;
  const date = new Date(createdAt);
  return !Number.isNaN(date.getTime()) && date >= start && date <= end;
}

/**
 * Shared by both SalesService.aggregateByDate (all items) and
 * ProductsRepository.getProductAnalytics (items for one product) on the
 * backend - both group sale line items by day and sum quantity/revenue/
 * cost/profit identically, differing only in which items they include.
 */
function aggregateSaleItemsByDate(
  sales: Record<string, unknown>[],
  dateRange: string,
  includeItem: (item: Record<string, unknown>) => boolean
): DailySalesAnalytics[] {
  const { start, end } = parseDateRangeParam(dateRange);
  const salesInRange = sales.filter((sale) => withinRange(sale.createdAt, start, end));

  const byDate = new Map<
    string,
    { date: string; views: number; sales: number; revenue: number; cost: number; profit: number }
  >();

  for (const sale of salesInRange) {
    const items = Array.isArray(sale.items) ? (sale.items as Record<string, unknown>[]) : [];
    const dateKey = new Date(sale.createdAt as string).toISOString().split("T")[0];

    for (const item of items.filter(includeItem)) {
      if (!byDate.has(dateKey)) {
        byDate.set(dateKey, { date: dateKey, views: 0, sales: 0, revenue: 0, cost: 0, profit: 0 });
      }
      const day = byDate.get(dateKey)!;
      const quantity = Number(item.quantity) || 0;
      const unitPrice = parseFloat(String(item.unitPrice ?? 0)) || 0;
      const variant = item.variant as Record<string, unknown> | undefined;
      const product = item.product as Record<string, unknown> | undefined;
      const cost = parseFloat(String(variant?.cost ?? product?.cost ?? "0")) || 0;

      day.sales += quantity;
      day.revenue += unitPrice * quantity;
      day.cost += cost * quantity;
      day.profit += (unitPrice - cost) * quantity;
    }
  }

  return Array.from(byDate.values())
    .map((day) => ({
      date: new Date(day.date).toISOString(),
      views: day.views,
      sales: day.sales,
      revenue: day.revenue.toFixed(2),
      cost: day.cost.toFixed(2),
      profit: day.profit.toFixed(2),
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

/** Mirrors SalesService.aggregateByDate: groups sale items by day. */
export function computeLocalSalesAnalytics(
  sales: Record<string, unknown>[],
  dateRange: string
): DailySalesAnalytics[] {
  return aggregateSaleItemsByDate(sales, dateRange, () => true);
}

/** Mirrors ProductsRepository.getProductAnalytics: one product's items only. */
export function computeLocalProductAnalytics(
  sales: Record<string, unknown>[],
  productId: string,
  dateRange: string
): DailySalesAnalytics[] {
  return aggregateSaleItemsByDate(
    sales,
    dateRange,
    (item) => item.productId === productId
  );
}

/** Mirrors SalesService.getSalesReport / SalesRepository.findByDateRange. */
export function filterLocalSalesReport(
  sales: Record<string, unknown>[],
  startDate: Date,
  endDate: Date
): Record<string, unknown>[] {
  return sales.filter((sale) => withinRange(sale.createdAt, startDate, endDate));
}

/** Mirrors SalesRepository.findByProduct: sales containing this product, newest first. */
export function filterLocalSalesByProduct(
  sales: Record<string, unknown>[],
  productId: string
): Record<string, unknown>[] {
  return sales
    .filter((sale) => {
      const items = Array.isArray(sale.items) ? (sale.items as Record<string, unknown>[]) : [];
      return items.some((item) => item.productId === productId);
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime()
    );
}

export async function getLocalSalesAnalytics(
  tenantId: string,
  dateRange: string
): Promise<DailySalesAnalytics[]> {
  const sales = (await getCachedResponse(
    listCacheKeyFor("sales", tenantId),
    "sales"
  )) as Record<string, unknown>[] | null;
  return computeLocalSalesAnalytics(sales ?? [], dateRange);
}

export async function getLocalProductAnalytics(
  tenantId: string,
  productId: string,
  dateRange: string
): Promise<DailySalesAnalytics[]> {
  const sales = (await getCachedResponse(
    listCacheKeyFor("sales", tenantId),
    "sales"
  )) as Record<string, unknown>[] | null;
  return computeLocalProductAnalytics(sales ?? [], productId, dateRange);
}

export async function getLocalSalesReport(
  tenantId: string,
  startDate: Date,
  endDate: Date
): Promise<Record<string, unknown>[]> {
  const sales = (await getCachedResponse(
    listCacheKeyFor("sales", tenantId),
    "sales"
  )) as Record<string, unknown>[] | null;
  return filterLocalSalesReport(sales ?? [], startDate, endDate);
}

export async function getLocalSalesByProduct(
  tenantId: string,
  productId: string
): Promise<Record<string, unknown>[]> {
  const sales = (await getCachedResponse(
    listCacheKeyFor("sales", tenantId),
    "sales"
  )) as Record<string, unknown>[] | null;
  return filterLocalSalesByProduct(sales ?? [], productId);
}
