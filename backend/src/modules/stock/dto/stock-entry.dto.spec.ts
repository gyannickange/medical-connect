import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { StockEntryDto } from "./stock-entry.dto";

describe("StockEntryDto", () => {
  const validBase = {
    quantity: 10,
    userId: "user-1",
    tenantId: "tenant-1",
  };

  // Test 3: accepts the minimum valid quantity (1) and rejects zero and negative
  it("accepts the minimum valid quantity of 1", async () => {
    const dto = plainToInstance(StockEntryDto, { ...validBase, quantity: 1 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects zero quantity", async () => {
    const dto = plainToInstance(StockEntryDto, { ...validBase, quantity: 0 });
    const errors = await validate(dto);
    const quantityErrors = errors.filter((e) => e.property === "quantity");
    expect(quantityErrors.length).toBeGreaterThan(0);
  });

  it("rejects negative quantity", async () => {
    const dto = plainToInstance(StockEntryDto, { ...validBase, quantity: -5 });
    const errors = await validate(dto);
    const quantityErrors = errors.filter((e) => e.property === "quantity");
    expect(quantityErrors.length).toBeGreaterThan(0);
  });

  it("rejects non-integer quantity (fractional)", async () => {
    const dto = plainToInstance(StockEntryDto, {
      ...validBase,
      quantity: 1.5,
    });
    const errors = await validate(dto);
    const quantityErrors = errors.filter((e) => e.property === "quantity");
    expect(quantityErrors.length).toBeGreaterThan(0);
  });

  // Transform: numeric string for quantity should be converted
  it("transforms numeric string quantity to number", async () => {
    const dto = plainToInstance(StockEntryDto, {
      ...validBase,
      quantity: "25",
    });
    expect(typeof dto.quantity).toBe("number");
    expect(dto.quantity).toBe(25);

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Optional reason normalization
  it("normalizes empty reason to undefined", async () => {
    const dto = plainToInstance(StockEntryDto, {
      ...validBase,
      quantity: 5,
      reason: "",
    });
    expect(dto.reason).toBeUndefined();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
