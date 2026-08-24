import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { StockExitDto } from "./stock-exit.dto";

describe("StockExitDto", () => {
  const validBase = {
    quantity: 10,
    userId: "user-1",
    tenantId: "tenant-1",
  };

  // Test 4: accepts the minimum valid quantity and rejects zero and negative
  it("accepts the minimum valid quantity of 1", async () => {
    const dto = plainToInstance(StockExitDto, { ...validBase, quantity: 1 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects zero quantity", async () => {
    const dto = plainToInstance(StockExitDto, { ...validBase, quantity: 0 });
    const errors = await validate(dto);
    const quantityErrors = errors.filter((e) => e.property === "quantity");
    expect(quantityErrors.length).toBeGreaterThan(0);
  });

  it("rejects negative quantity", async () => {
    const dto = plainToInstance(StockExitDto, { ...validBase, quantity: -5 });
    const errors = await validate(dto);
    const quantityErrors = errors.filter((e) => e.property === "quantity");
    expect(quantityErrors.length).toBeGreaterThan(0);
  });

  it("rejects non-integer quantity (fractional)", async () => {
    const dto = plainToInstance(StockExitDto, {
      ...validBase,
      quantity: 2.3,
    });
    const errors = await validate(dto);
    const quantityErrors = errors.filter((e) => e.property === "quantity");
    expect(quantityErrors.length).toBeGreaterThan(0);
  });

  it("transforms numeric string quantity to number", async () => {
    const dto = plainToInstance(StockExitDto, {
      ...validBase,
      quantity: "15",
    });
    expect(typeof dto.quantity).toBe("number");
    expect(dto.quantity).toBe(15);

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
