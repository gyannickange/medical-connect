import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import {
  CalculateProductPriceQueryDto,
  CreateProductPricingDto,
} from "./product-pricing.dto";

describe("product pricing DTOs", () => {
  it("CreateProductPricingDto transforms price and quantity strings and accepts a valid rule", async () => {
    const dto = plainToInstance(CreateProductPricingDto, {
      priceType: "bulk",
      price: "12.50",
      minQuantity: "5",
      maxQuantity: "10",
    });

    expect(await validate(dto)).toHaveLength(0);
    expect(dto).toMatchObject({ price: 12.5, minQuantity: 5, maxQuantity: 10 });
  });

  it("CreateProductPricingDto rejects unsupported priceType", async () => {
    const dto = plainToInstance(CreateProductPricingDto, {
      priceType: "vip",
      price: 10,
      minQuantity: 1,
    });

    expect(await validate(dto)).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: "priceType" })]),
    );
  });

  it.each([
    { price: 0, minQuantity: 1 },
    { price: 10, minQuantity: 0 },
  ])("CreateProductPricingDto rejects non-positive price or minQuantity", async (values) => {
    const dto = plainToInstance(CreateProductPricingDto, {
      priceType: "retail",
      ...values,
    });

    expect((await validate(dto)).length).toBeGreaterThan(0);
  });

  it.each([undefined, "abc", "0", "-1"])(
    "calculate-price rejects missing, nonnumeric, zero, and negative quantity with 400",
    async (quantity) => {
      const pipe = new ValidationPipe({ transform: true });
      await expect(
        pipe.transform(
          { quantity },
          { type: "query", metatype: CalculateProductPriceQueryDto },
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
});
