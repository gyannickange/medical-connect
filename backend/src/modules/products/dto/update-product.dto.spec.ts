import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { UpdateProductDto } from "./update-product.dto";

describe("UpdateProductDto", () => {
  // Test 1: transforms numeric strings for price, cost, and minStockAlert
  it("transforms numeric strings for price, cost, and minStockAlert", async () => {
    const raw = {
      price: "199.99",
      cost: "50.00",
      minStockAlert: "5",
    };

    const dto = plainToInstance(UpdateProductDto, raw);
    expect(typeof dto.price).toBe("number");
    expect(dto.price).toBe(199.99);
    expect(typeof dto.cost).toBe("number");
    expect(dto.cost).toBe(50.0);
    expect(typeof dto.minStockAlert).toBe("number");
    expect(dto.minStockAlert).toBe(5);

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Test 2: rejects negative numeric values and non-numeric strings
  it("rejects negative numeric values for price, cost, and minStockAlert", async () => {
    const dto = plainToInstance(UpdateProductDto, {
      price: -10,
      cost: -5,
      minStockAlert: -2,
    });

    const errors = await validate(dto);
    const propertyNames = errors.map((e) => e.property);
    expect(propertyNames).toContain("price");
    expect(propertyNames).toContain("cost");
    expect(propertyNames).toContain("minStockAlert");
  });

  it("rejects non-numeric strings for numeric fields", async () => {
    const dto = plainToInstance(UpdateProductDto, {
      price: "abc",
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(1);
    expect(errors[0].property).toBe("price");
  });

  // Edge: valid zero values should pass (business may allow zero price for promotions)
  it("accepts zero values for price, cost, and minStockAlert", async () => {
    const dto = plainToInstance(UpdateProductDto, {
      price: 0,
      cost: 0,
      minStockAlert: 0,
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Edge: partial updates should work
  it("accepts partial updates with only some fields", async () => {
    const dto = plainToInstance(UpdateProductDto, { name: "Updated Name" });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
