import { describe, expect, it } from "vitest";
import { insertProductSchema } from "@shared/schema";

const validProduct = {
  name: "Test Product",
  price: "19.99",
  cost: "9.99",
  tenantId: "11111111-1111-1111-1111-111111111111",
  barcode: "TEST-001",
  isActive: true,
};

describe("insertProductSchema", () => {
  it("rejects an empty product name", () => {
    const result = insertProductSchema.safeParse({ ...validProduct, name: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a non-empty product name", () => {
    const result = insertProductSchema.safeParse(validProduct);
    expect(result.success).toBe(true);
  });
});
