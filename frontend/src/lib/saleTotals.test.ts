import { describe, expect, it } from "vitest";
import { computeSaleTotals } from "./saleTotals";

describe("computeSaleTotals", () => {
  it("adds 20% tax on top of the pre-tax subtotal", () => {
    const result = computeSaleTotals(100);
    expect(result).toEqual({ subtotal: 100, tax: 20, total: 120 });
  });

  it("treats the input as tax-exclusive, matching the backend's recomputation", () => {
    // The backend sales ledger computes the subtotal as the
    // raw sum of unitPrice * quantity, then computedTotal = computedSubtotal
    // + tax. The cart's raw sum must map to `subtotal` here, not `total`.
    const cartRawSum = 70000; // e.g. one item at 70,000 FCFA
    const result = computeSaleTotals(cartRawSum);
    expect(result.subtotal).toBe(cartRawSum);
    expect(result.total).toBe(cartRawSum * 1.2);
  });

  it("rounds the subtotal to 2 decimal places", () => {
    const result = computeSaleTotals(33.336);
    expect(result.subtotal).toBe(33.34);
  });

  it("supports a custom tax rate", () => {
    const result = computeSaleTotals(100, 0.18);
    expect(result).toEqual({ subtotal: 100, tax: 18, total: 118 });
  });
});
