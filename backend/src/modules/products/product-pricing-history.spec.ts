import {
  resolveCurrentSellingPrice,
  sortSellingPricesDesc,
  sortPurchasesDesc,
} from "./product-pricing-history";
import type { SellingPriceEntry, PurchaseEntry } from "@shared/schema";

function sellingPrice(overrides: Partial<SellingPriceEntry> = {}): SellingPriceEntry {
  return {
    id: "sp-1",
    variantId: null,
    price: "10.00",
    effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
    createdByUserId: "user-1",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("resolveCurrentSellingPrice", () => {
  it("falls back when there is no selling price history", () => {
    expect(resolveCurrentSellingPrice(undefined, null, "9.99")).toBe("9.99");
    expect(resolveCurrentSellingPrice([], null, "9.99")).toBe("9.99");
  });

  it("picks the most recent entry that is already effective", () => {
    const entries = [
      sellingPrice({ id: "sp-old", price: "10.00", effectiveAt: new Date("2026-08-01") }),
      sellingPrice({ id: "sp-new", price: "12.00", effectiveAt: new Date("2026-08-10") }),
    ];
    expect(resolveCurrentSellingPrice(entries, null, "9.99")).toBe("12.00");
  });

  it("ignores an entry scheduled in the future", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const entries = [
      sellingPrice({ id: "sp-current", price: "10.00", effectiveAt: new Date("2026-08-01") }),
      sellingPrice({ id: "sp-future", price: "15.00", effectiveAt: future as any }),
    ];
    expect(resolveCurrentSellingPrice(entries, null, "9.99")).toBe("10.00");
  });

  it("scopes resolution to the given variantId", () => {
    const entries = [
      sellingPrice({ id: "sp-parent", variantId: null, price: "10.00" }),
      sellingPrice({ id: "sp-variant", variantId: "variant-1", price: "20.00" }),
    ];
    expect(resolveCurrentSellingPrice(entries, "variant-1", "9.99")).toBe("20.00");
    expect(resolveCurrentSellingPrice(entries, "variant-2", "9.99")).toBe("9.99");
  });
});

describe("sortSellingPricesDesc", () => {
  it("sorts by effectiveAt desc, then createdAt desc on ties", () => {
    const entries = [
      sellingPrice({ id: "a", effectiveAt: new Date("2026-08-01"), createdAt: new Date("2026-08-01T08:00:00Z") }),
      sellingPrice({ id: "b", effectiveAt: new Date("2026-08-01"), createdAt: new Date("2026-08-01T09:00:00Z") }),
      sellingPrice({ id: "c", effectiveAt: new Date("2026-08-05"), createdAt: new Date("2026-08-05T00:00:00Z") }),
    ];
    expect(sortSellingPricesDesc(entries).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});

describe("sortPurchasesDesc", () => {
  it("sorts by purchaseDate desc, then createdAt desc on ties", () => {
    const purchase = (overrides: Partial<PurchaseEntry>): PurchaseEntry => ({
      id: "p",
      variantId: null,
      quantity: 1,
      unitPurchasePrice: "1.00",
      purchaseCurrency: "XOF",
      conversionRate: "1.00",
      referenceCurrency: "XOF",
      unitCostConverted: "1.00",
      supplierId: null,
      purchaseDate: new Date("2026-08-01"),
      createdByUserId: "user-1",
      createdAt: new Date("2026-08-01"),
      ...overrides,
    });
    const entries = [
      purchase({ id: "a", purchaseDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T08:00:00Z") }),
      purchase({ id: "b", purchaseDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T09:00:00Z") }),
      purchase({ id: "c", purchaseDate: new Date("2026-08-05"), createdAt: new Date("2026-08-05T00:00:00Z") }),
    ];
    expect(sortPurchasesDesc(entries).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});
