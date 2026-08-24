import { ConflictException } from "@nestjs/common";
import { ProductsService } from "./products.service";

const product = (overrides: Record<string, unknown> = {}) => ({
  id: "product-1",
  name: "Tea",
  price: "10.00",
  cost: "5.00",
  barcode: "ABC-1",
  qrCode: null,
  categoryId: null,
  supplierId: null,
  tenantId: "tenant-1",
  minStockAlert: 10,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

function stubProductsRepository(overrides: Record<string, unknown> = {}) {
  return {
    upsert: jest.fn().mockResolvedValue(true),
    create: jest.fn().mockResolvedValue(product()),
    findById: jest.fn().mockResolvedValue(product({ id: "product-2" })),
    update: jest.fn().mockResolvedValue(product({ id: "product-2" })),
    ...overrides,
  };
}

describe("ProductsService barcode uniqueness", () => {
  it("normalizes a nonblank barcode on create", async () => {
    const repository = stubProductsRepository();
    const service = new ProductsService({} as any, repository as any);

    await service.create({
      name: "Tea",
      price: "10.00",
      cost: "5.00",
      barcode: "  ABC-1  ",
      tenantId: "tenant-1",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: "ABC-1" }),
    );
  });

  it("allows an omitted or blank optional barcode by storing null", async () => {
    const repository = stubProductsRepository({
      create: jest.fn().mockResolvedValue(product({ barcode: null })),
    });
    const service = new ProductsService({} as any, repository as any);

    await service.create({
      name: "Tea",
      price: "10.00",
      cost: "5.00",
      barcode: "   ",
      tenantId: "tenant-1",
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ barcode: null }),
    );
  });

  it("returns the stable barcode conflict for duplicate create and update", async () => {
    const duplicate = new ConflictException({
      statusCode: 409,
      message: "Barcode already exists",
      code: "DUPLICATE_VALUE",
      field: "barcode",
    });
    const repository = stubProductsRepository({
      create: jest.fn().mockRejectedValue(duplicate),
      update: jest.fn().mockRejectedValue(duplicate),
    });
    const service = new ProductsService({} as any, repository as any);

    await expect(
      service.create({
        name: "Tea",
        price: "10.00",
        cost: "5.00",
        barcode: "ABC-1",
        tenantId: "tenant-1",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.update("product-2", "tenant-1", { barcode: "ABC-1" }),
    ).rejects.toMatchObject({
      status: 409,
    });
  });
});
