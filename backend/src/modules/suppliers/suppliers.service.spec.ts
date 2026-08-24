import { ConflictException } from "@nestjs/common";
import { SuppliersService } from "./suppliers.service";

describe("SuppliersService.delete", () => {
  it("blocks deletion while products reference the supplier", async () => {
    const suppliersRepository = { delete: jest.fn() };
    const productsRepository = {
      hasProductsReferencing: jest.fn().mockResolvedValue(true),
    };
    const service = new SuppliersService(
      suppliersRepository as any,
      productsRepository as any
    );

    await expect(service.delete("supplier-1", "tenant-1")).rejects.toThrow(
      ConflictException
    );
    expect(suppliersRepository.delete).not.toHaveBeenCalled();
  });

  it("deletes an unreferenced supplier", async () => {
    const suppliersRepository = {
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const productsRepository = {
      hasProductsReferencing: jest.fn().mockResolvedValue(false),
    };
    const service = new SuppliersService(
      suppliersRepository as any,
      productsRepository as any
    );

    await service.delete("supplier-1", "tenant-1");

    expect(suppliersRepository.delete).toHaveBeenCalledWith(
      "supplier-1",
      "tenant-1"
    );
  });
});
