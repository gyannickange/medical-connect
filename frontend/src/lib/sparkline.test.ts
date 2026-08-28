import { describe, expect, it } from "vitest";
import { buildSparklinePoints } from "./sparkline";

describe("buildSparklinePoints", () => {
  it("returns an empty string for no values", () => {
    expect(buildSparklinePoints([], 100, 50)).toBe("");
  });

  it("places a single value at x=0, at the bottom since it equals both min and max (zero range)", () => {
    expect(buildSparklinePoints([120], 100, 50)).toBe("0,50");
  });

  it("scales the lowest value to the bottom and the highest to the top", () => {
    const points = buildSparklinePoints([100, 140], 100, 50);
    expect(points).toBe("0,50 100,0");
  });
});
