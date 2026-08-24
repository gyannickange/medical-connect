import { describe, expect, it } from "vitest";
import { resolveProductPrice, type ProductWithPricing } from "./resolveProductPrice";
import type { ProductPricing, ProductVariant } from "../../shared/schema";

function product(overrides: Partial<ProductWithPricing> = {}): ProductWithPricing {
  return {
    id: "product-1",
    name: "Tea",
    description: null,
    price: "10.00",
    cost: "5.00",
    barcode: null,
    qrCode: null,
    categoryId: null,
    supplierId: null,
    tenantId: "tenant-1",
    minStockAlert: 0,
    isActive: true,
    createdAt: "",
    updatedAt: "",
    variants: [],
    pricingRules: [],
    ...overrides,
  };
}

function variant(overrides: Partial<ProductVariant> = {}): ProductVariant {
  return {
    id: "variant-1",
    productId: "product-1",
    attributes: [],
    sku: null,
    price: "12.00",
    cost: "6.00",
    barcode: null,
    quantity: 0,
    minStockAlert: 0,
    isActive: true,
    tenantId: "tenant-1",
    createdAt: "",
    updatedAt: "",
    ...overrides,
  };
}

function rule(overrides: Partial<ProductPricing> = {}): ProductPricing {
  return {
    id: "rule-1",
    productId: "product-1",
    variantId: null,
    priceType: "retail",
    price: "9.00",
    minQuantity: 1,
    maxQuantity: null,
    validFrom: null,
    validTo: null,
    isActive: true,
    tenantId: "tenant-1",
    createdAt: "",
    ...overrides,
  };
}

describe("resolveProductPrice", () => {
  it("falls back to the product's base price with no matching rules", () => {
    const result = resolveProductPrice(product(), 1);
    expect(result).toEqual({ price: "10.00" });
  });

  it("falls back to the variant's price when a variant is selected", () => {
    const p = product({ variants: [variant({ id: "v1", price: "12.00" })] });
    const result = resolveProductPrice(p, 1, "v1");
    expect(result).toEqual({ price: "12.00" });
  });

  it("applies a matching pricing rule over the base price", () => {
    const p = product({ pricingRules: [rule({ price: "8.00" })] });
    const result = resolveProductPrice(p, 1);
    expect(result.price).toBe("8.00");
    expect(result.rule?.id).toBe("rule-1");
  });

  it("ignores inactive rules", () => {
    const p = product({ pricingRules: [rule({ isActive: false, price: "1.00" })] });
    expect(resolveProductPrice(p, 1).price).toBe("10.00");
  });

  it("filters rules by requested price type", () => {
    const p = product({
      pricingRules: [rule({ priceType: "wholesale", price: "7.00" })],
    });
    expect(resolveProductPrice(p, 1, undefined, "retail").price).toBe("10.00");
    expect(resolveProductPrice(p, 1, undefined, "wholesale").price).toBe("7.00");
  });

  it("excludes variant-specific rules when no variant is selected", () => {
    const p = product({
      pricingRules: [rule({ variantId: "v1", price: "1.00" })],
    });
    expect(resolveProductPrice(p, 1).price).toBe("10.00");
  });

  it("excludes rules scoped to a different variant", () => {
    const p = product({
      variants: [variant({ id: "v1", price: "12.00" }), variant({ id: "v2", price: "15.00" })],
      pricingRules: [rule({ variantId: "v1", price: "11.00" })],
    });
    expect(resolveProductPrice(p, 1, "v2").price).toBe("15.00");
  });

  it("applies a general (non-variant) rule to a variant purchase", () => {
    const p = product({
      variants: [variant({ id: "v1", price: "12.00" })],
      pricingRules: [rule({ variantId: null, price: "9.50" })],
    });
    expect(resolveProductPrice(p, 1, "v1").price).toBe("9.50");
  });

  it("respects minQuantity/maxQuantity boundaries", () => {
    const p = product({
      pricingRules: [rule({ minQuantity: 5, maxQuantity: 10, price: "6.00" })],
    });
    expect(resolveProductPrice(p, 4).price).toBe("10.00");
    expect(resolveProductPrice(p, 5).price).toBe("6.00");
    expect(resolveProductPrice(p, 10).price).toBe("6.00");
    expect(resolveProductPrice(p, 11).price).toBe("10.00");
  });

  it("respects validFrom/validTo date windows", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const future = new Date(Date.now() + 86_400_000).toISOString();

    const notYetActive = product({
      pricingRules: [rule({ validFrom: future, price: "1.00" })],
    });
    expect(resolveProductPrice(notYetActive, 1).price).toBe("10.00");

    const expired = product({
      pricingRules: [rule({ validTo: past, price: "1.00" })],
    });
    expect(resolveProductPrice(expired, 1).price).toBe("10.00");

    const currentlyActive = product({
      pricingRules: [rule({ validFrom: past, validTo: future, price: "1.00" })],
    });
    expect(resolveProductPrice(currentlyActive, 1).price).toBe("1.00");
  });

  it("prioritizes promotional > bulk > wholesale > retail when multiple rules match", () => {
    const p = product({
      pricingRules: [
        rule({ id: "retail", priceType: "retail", price: "10.00" }),
        rule({ id: "wholesale", priceType: "wholesale", price: "9.00" }),
        rule({ id: "bulk", priceType: "bulk", price: "8.00" }),
        rule({ id: "promotional", priceType: "promotional", price: "5.00" }),
      ],
    });
    const result = resolveProductPrice(p, 1);
    expect(result.rule?.id).toBe("promotional");
    expect(result.price).toBe("5.00");
  });

  it("prefers a variant-specific rule over a general rule of the same priority", () => {
    const p = product({
      variants: [variant({ id: "v1", price: "12.00" })],
      pricingRules: [
        rule({ id: "general", variantId: null, priceType: "bulk", price: "7.00" }),
        rule({ id: "specific", variantId: "v1", priceType: "bulk", price: "7.00" }),
      ],
    });
    const result = resolveProductPrice(p, 1, "v1");
    expect(result.rule?.id).toBe("specific");
  });

  it("breaks ties between equal-priority rules by preferring the higher price", () => {
    const p = product({
      pricingRules: [
        rule({ id: "low", priceType: "bulk", price: "5.00" }),
        rule({ id: "high", priceType: "bulk", price: "7.00" }),
      ],
    });
    const result = resolveProductPrice(p, 1);
    expect(result.rule?.id).toBe("high");
  });

  it("prefers a dated selling price over product.price when no pricing rule matches", () => {
    const p = product({
      price: "9.99",
      sellingPrices: [
        {
          id: "sp-1",
          variantId: null,
          price: "12.50",
          effectiveAt: "2026-08-01T00:00:00.000Z",
          createdByUserId: "user-1",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });

    expect(resolveProductPrice(p, 1)).toEqual({ price: "12.50" });
  });

  it("ignores a selling price scheduled in the future", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const p = product({
      price: "9.99",
      sellingPrices: [
        {
          id: "sp-1",
          variantId: null,
          price: "15.00",
          effectiveAt: future,
          createdByUserId: "user-1",
          createdAt: future,
        },
      ],
    });

    expect(resolveProductPrice(p, 1)).toEqual({ price: "9.99" });
  });
});
