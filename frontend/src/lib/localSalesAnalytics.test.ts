import { describe, expect, it, vi } from "vitest";

// `localSalesAnalytics` imports `offlineCache`, which transitively imports
// `pouchdb`, whose `pouchdbAuth` singleton reads `localStorage` at module
// load - stub it before importing (same workaround used throughout this
// project's other offline-mode tests).
vi.stubGlobal("localStorage", {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {},
  key: () => null,
  length: 0,
});

const {
  computeLocalSalesAnalytics,
  computeLocalProductAnalytics,
  filterLocalSalesReport,
  filterLocalSalesByProduct,
  parseDateRangeParam,
} = await import("./localSalesAnalytics");

function saleAt(daysAgo: number, overrides: Record<string, unknown> = {}) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return {
    id: `sale-${daysAgo}-${Math.random()}`,
    createdAt: date.toISOString(),
    items: [
      {
        quantity: 2,
        unitPrice: "10.00",
        product: { cost: "4.00" },
      },
    ],
    ...overrides,
  };
}

describe("parseDateRangeParam", () => {
  // start is midnight N days ago, end is 23:59:59.999 today - an inclusive
  // span of N+1 calendar days, matching SalesService.parseDateRange exactly.
  it("defaults to a 7-day range for an unrecognized range", () => {
    const { start, end } = parseDateRangeParam("nonsense");
    const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(Math.round(diffDays)).toBe(8);
  });

  it("resolves 30d and 90d to their respective spans", () => {
    const thirty = parseDateRangeParam("30d");
    const ninety = parseDateRangeParam("90d");
    expect(
      Math.round((thirty.end.getTime() - thirty.start.getTime()) / 86_400_000)
    ).toBe(31);
    expect(
      Math.round((ninety.end.getTime() - ninety.start.getTime()) / 86_400_000)
    ).toBe(91);
  });
});

describe("computeLocalSalesAnalytics", () => {
  it("aggregates revenue, cost, and profit per day from sale items", () => {
    const sales = [saleAt(0)]; // quantity 2, unitPrice 10, cost 4

    const result = computeLocalSalesAnalytics(sales, "7d");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      sales: 2,
      revenue: "20.00",
      cost: "8.00",
      profit: "12.00",
    });
  });

  it("groups multiple sales on the same day into one row", () => {
    const sales = [saleAt(0), saleAt(0)];

    const result = computeLocalSalesAnalytics(sales, "7d");

    expect(result).toHaveLength(1);
    expect(result[0].sales).toBe(4);
    expect(result[0].revenue).toBe("40.00");
  });

  it("excludes sales outside the requested date range", () => {
    const sales = [saleAt(0), saleAt(100)];

    const result = computeLocalSalesAnalytics(sales, "7d");

    expect(result).toHaveLength(1);
  });

  it("prefers the variant's cost snapshot over the product's when both are present", () => {
    const sales = [
      saleAt(0, {
        items: [
          {
            quantity: 1,
            unitPrice: "10.00",
            product: { cost: "4.00" },
            variant: { cost: "6.00" },
          },
        ],
      }),
    ];

    const result = computeLocalSalesAnalytics(sales, "7d");

    expect(result[0].cost).toBe("6.00");
  });

  it("returns rows sorted ascending by date", () => {
    const sales = [saleAt(1), saleAt(3), saleAt(0)];

    const result = computeLocalSalesAnalytics(sales, "7d");

    const times = result.map((row) => new Date(row.date).getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("returns an empty array for a fresh install with no sales yet", () => {
    expect(computeLocalSalesAnalytics([], "7d")).toEqual([]);
  });
});

describe("computeLocalProductAnalytics", () => {
  it("only aggregates line items for the requested product", () => {
    const sales = [
      saleAt(0, {
        items: [
          { productId: "p1", quantity: 2, unitPrice: "10.00", product: { cost: "4.00" } },
          { productId: "p2", quantity: 5, unitPrice: "1.00", product: { cost: "0.50" } },
        ],
      }),
    ];

    const result = computeLocalProductAnalytics(sales, "p1", "7d");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ sales: 2, revenue: "20.00" });
  });

  it("returns no rows for a product with no sales in range", () => {
    const sales = [saleAt(0)]; // items default to a different (unset) productId

    const result = computeLocalProductAnalytics(sales, "never-sold", "7d");

    expect(result).toEqual([]);
  });
});

describe("filterLocalSalesReport", () => {
  it("keeps only sales whose createdAt falls within the given range", () => {
    const inRange = saleAt(2);
    const outOfRange = saleAt(20);
    const { start, end } = parseDateRangeParam("7d");

    const result = filterLocalSalesReport([inRange, outOfRange], start, end);

    expect(result).toEqual([inRange]);
  });

  it("ignores sales with a missing or invalid createdAt", () => {
    const bad = { id: "bad", createdAt: "not-a-date" };
    const missing = { id: "missing" };
    const { start, end } = parseDateRangeParam("7d");

    const result = filterLocalSalesReport([bad, missing], start, end);

    expect(result).toEqual([]);
  });
});

describe("filterLocalSalesByProduct", () => {
  it("keeps only sales that contain the given product, newest first", () => {
    const older = saleAt(5, { id: "older", items: [{ productId: "product-1", quantity: 1 }] });
    const newer = saleAt(1, { id: "newer", items: [{ productId: "product-1", quantity: 3 }] });
    const other = saleAt(2, { id: "other", items: [{ productId: "product-2", quantity: 1 }] });

    const result = filterLocalSalesByProduct([older, newer, other], "product-1");

    expect(result).toEqual([newer, older]);
  });

  it("returns an empty array when no sale contains the product", () => {
    const sale = saleAt(1, { items: [{ productId: "product-2", quantity: 1 }] });

    expect(filterLocalSalesByProduct([sale], "product-1")).toEqual([]);
  });

  it("ignores sales with a missing or non-array items field", () => {
    const noItems = { id: "no-items", createdAt: new Date().toISOString() };

    expect(filterLocalSalesByProduct([noItems], "product-1")).toEqual([]);
  });
});
