import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateSaleDto } from "./create-sale.dto";

describe("CreateSaleDto", () => {
  const validSaleData = {
    subtotal: 100,
    total: 100,
    paymentMethod: "cash",
    userId: "user-1",
    tenantId: "tenant-1",
  };

  const validItem = {
    productId: "prod-1",
    quantity: 2,
    unitPrice: 50,
    totalPrice: 100,
  };

  // Test 8: rejects empty items array
  it("rejects an empty items array", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [],
    });

    const errors = await validate(dto);
    const itemsErrors = errors.filter((e) => e.property === "items");
    expect(itemsErrors.length).toBeGreaterThan(0);
  });

  // Test 9: rejects zero/negative item quantities and prices
  it("rejects zero quantity in sale item", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [{ ...validItem, quantity: 0 }],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects negative quantity in sale item", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [{ ...validItem, quantity: -1 }],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects zero unitPrice in sale item", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [{ ...validItem, unitPrice: 0 }],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects negative unitPrice in sale item", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [{ ...validItem, unitPrice: -10 }],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects zero totalPrice in sale item", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [{ ...validItem, totalPrice: 0 }],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects negative totalPrice in sale item", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [{ ...validItem, totalPrice: -100 }],
    });

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  // Test 10: transforms valid numeric strings when received through global validation pipe
  it("transforms valid numeric strings for item quantity, unitPrice, and totalPrice", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: {
        ...validSaleData,
        subtotal: "150.50",
        tax: "15.05",
        total: "165.55",
      },
      items: [
        {
          productId: "prod-1",
          quantity: "3",
          unitPrice: "50.17",
          totalPrice: "150.51",
        },
      ],
    });

    // Verify transformations
    expect(typeof dto.sale.subtotal).toBe("number");
    expect(dto.sale.subtotal).toBe(150.5);
    expect(typeof dto.sale.tax).toBe("number");
    expect(dto.sale.tax).toBe(15.05);
    expect(typeof dto.sale.total).toBe("number");
    expect(dto.sale.total).toBe(165.55);

    const item = dto.items[0];
    expect(typeof item.quantity).toBe("number");
    expect(item.quantity).toBe(3);
    expect(typeof item.unitPrice).toBe("number");
    expect(item.unitPrice).toBe(50.17);
    expect(typeof item.totalPrice).toBe("number");
    expect(item.totalPrice).toBe(150.51);

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  // Positive case: valid sale should pass
  it("accepts a valid complete sale", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: validSaleData,
      items: [validItem],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts a valid client-generated UUID for offline replay", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: {
        ...validSaleData,
        id: "123e4567-e89b-42d3-a456-426614174000",
      },
      items: [validItem],
    });

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a malformed client-generated sale ID", async () => {
    const dto = plainToInstance(CreateSaleDto, {
      sale: { ...validSaleData, id: "offline-sale-1" },
      items: [validItem],
    });

    const errors = await validate(dto);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: "sale",
          children: expect.arrayContaining([
            expect.objectContaining({ property: "id" }),
          ]),
        }),
      ])
    );
  });
});
