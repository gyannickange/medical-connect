import { describe, expect, it } from "vitest";
import {
  getMovementBadgeVariant,
  getQuantityChange,
} from "./movementFormat";

describe("getMovementBadgeVariant", () => {
  it("maps entry to success", () => {
    expect(getMovementBadgeVariant("entry")).toBe("success");
  });

  it("maps exit to destructive", () => {
    expect(getMovementBadgeVariant("exit")).toBe("destructive");
  });

  it("maps adjustment to warning", () => {
    expect(getMovementBadgeVariant("adjustment")).toBe("warning");
  });

  it("maps transfer to secondary", () => {
    expect(getMovementBadgeVariant("transfer")).toBe("secondary");
  });

  it("falls back to success for unknown types", () => {
    expect(getMovementBadgeVariant("unknown")).toBe("success");
  });
});

describe("getQuantityChange", () => {
  it("is positive and green for entry", () => {
    expect(getQuantityChange("entry")).toEqual({
      prefix: "+",
      colorClass: "text-chart-positive",
    });
  });

  it("is negative and red for any non-entry type", () => {
    expect(getQuantityChange("exit")).toEqual({
      prefix: "-",
      colorClass: "text-chart-negative",
    });
    expect(getQuantityChange("adjustment")).toEqual({
      prefix: "-",
      colorClass: "text-chart-negative",
    });
  });
});
