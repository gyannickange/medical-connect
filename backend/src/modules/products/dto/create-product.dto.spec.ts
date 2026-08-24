import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateProductDto } from "./create-product.dto";

describe("CreateProductDto offline identity", () => {
  it("accepts a client UUID and supplier so dependent offline operations keep stable URLs", async () => {
    const dto = plainToInstance(CreateProductDto, {
      id: "5d29070d-78da-41f8-8138-625a92221161",
      name: "Offline product",
      price: 10,
      cost: 5,
      tenantId: "tenant-1",
      supplierId: "supplier-1",
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it("rejects a malformed client product ID", async () => {
    const dto = plainToInstance(CreateProductDto, {
      id: "not-a-uuid",
      name: "Offline product",
      price: 10,
      cost: 5,
      tenantId: "tenant-1",
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === "id")).toBe(true);
  });
});
