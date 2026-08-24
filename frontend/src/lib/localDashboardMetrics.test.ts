import { describe, expect, it, vi } from "vitest";

// `localDashboardMetrics` imports `offlineCache`, which transitively imports
// `pouchdb`, whose `pouchdbAuth` singleton reads `localStorage` at module
// load - stub it before importing (same workaround as offlineCache.test.ts).
vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
});

const { computeLocalDashboardMetrics } = await import("./localDashboardMetrics");

function iso(daysAgo: number, hour = 12): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

describe("computeLocalDashboardMetrics", () => {
  it("reports the total product count regardless of stock level", () => {
    const products = [
      { id: "p1", name: "A", stocks: { quantity: 5 }, minStockAlert: 1 },
      { id: "p2", name: "B", stocks: { quantity: 0 }, minStockAlert: 10 },
    ];

    const result = computeLocalDashboardMetrics(products, []);

    expect(result.totalProducts).toBe(2);
  });

  it("flags products at or below their minStockAlert as low stock, others not", () => {
    const products = [
      { id: "low", name: "Low", stocks: { quantity: 2 }, minStockAlert: 5 },
      {
        id: "exact",
        name: "Exact",
        stocks: { quantity: 5 },
        minStockAlert: 5,
      },
      { id: "fine", name: "Fine", stocks: { quantity: 20 }, minStockAlert: 5 },
      { id: "no-stock-field", name: "NoStock", stocks: null, minStockAlert: 0 },
    ];

    const result = computeLocalDashboardMetrics(products, []);

    expect(result.lowStockItems).toBe(3);
    expect(result.lowStockAlerts.map((a: any) => a.id)).toEqual([
      "low",
      "exact",
      "no-stock-field",
    ]);
    expect(result.lowStockAlerts[0]).toEqual({
      id: "low",
      quantity: 2,
      product: { id: "low", name: "Low" },
    });
  });

  it("caps low stock alerts at 10, matching the backend's findLowStock limit", () => {
    const products = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
      stocks: { quantity: 0 },
      minStockAlert: 5,
    }));

    const result = computeLocalDashboardMetrics(products, []);

    expect(result.lowStockAlerts).toHaveLength(10);
  });

  it("sums only today's sales into todaysSales, ignoring other days", () => {
    const sales = [
      { id: "s1", total: "10.00", createdAt: iso(0) },
      { id: "s2", total: "5.50", createdAt: iso(0) },
      { id: "s3", total: "100.00", createdAt: iso(1) }, // yesterday
      { id: "s4", total: "50.00", createdAt: iso(30) }, // last month
    ];

    const result = computeLocalDashboardMetrics([], sales);

    expect(result.todaysSales).toBe("15.50");
  });

  it("returns the 5 most recent of today's sales, newest first", () => {
    const sales = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i}`,
      total: "1.00",
      createdAt: iso(0, i), // hour i today, so s7 is the latest
    }));

    const result = computeLocalDashboardMetrics([], sales);

    expect(result.recentSales.map((s: any) => s.id)).toEqual([
      "s7",
      "s6",
      "s5",
      "s4",
      "s3",
    ]);
  });

  it("excludes sales from other days from recentSales", () => {
    const sales = [
      { id: "today", total: "1.00", createdAt: iso(0) },
      { id: "yesterday", total: "1.00", createdAt: iso(1) },
    ];

    const result = computeLocalDashboardMetrics([], sales);

    expect(result.recentSales.map((s: any) => s.id)).toEqual(["today"]);
  });

  it("handles a fresh install with no products or sales yet", () => {
    const result = computeLocalDashboardMetrics([], []);

    expect(result).toEqual({
      totalProducts: 0,
      lowStockItems: 0,
      todaysSales: "0.00",
      recentSales: [],
      lowStockAlerts: [],
    });
  });

  it("ignores a sale with a missing or invalid createdAt rather than crashing", () => {
    const sales = [
      { id: "bad", total: "1.00", createdAt: "not-a-date" },
      { id: "missing", total: "1.00" },
    ];

    const result = computeLocalDashboardMetrics([], sales);

    expect(result.todaysSales).toBe("0.00");
    expect(result.recentSales).toEqual([]);
  });
});
