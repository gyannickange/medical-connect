import { describe, expect, it } from "vitest";
import { calculateProfitability } from "./calculateProfitability";

describe("calculateProfitability", () => {
  it("computes profit, margin rate and markup for a normal case", () => {
    const result = calculateProfitability("15.00", "10.00");
    expect(result.unitProfit).toBe("5.00");
    expect(result.marginRate).toBe("0.3333");
    expect(result.markup).toBe("0.5000");
  });

  it("returns null margin rate when the selling price is zero", () => {
    expect(calculateProfitability("0.00", "10.00").marginRate).toBeNull();
  });

  it("returns null markup when the cost is zero", () => {
    expect(calculateProfitability("15.00", "0.00").markup).toBeNull();
  });
});
