import { ConflictException } from "@nestjs/common";
import { CategoriesService } from "./categories.service";

function stubCategoriesRepository() {
  return {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findByTenant: jest.fn(),
  };
}

describe("CategoriesService", () => {
  it("delegates reads and writes to CategoriesRepository", async () => {
    const category = {
      id: "category-1",
      tenantId: "tenant-1",
      name: "Electronics",
    };
    const repository = {
      ...stubCategoriesRepository(),
      findByTenant: jest.fn().mockResolvedValue([category]),
      create: jest.fn().mockResolvedValue(category),
      update: jest.fn().mockResolvedValue({ ...category, name: "Devices" }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CategoriesService(repository as any);

    await expect(service.findByTenant("tenant-1", { limit: 20 })).resolves.toEqual([
      category,
    ]);
    await expect(
      service.create({ tenantId: "tenant-1", name: "Electronics" } as any)
    ).resolves.toEqual(category);
    await expect(
      service.update("category-1", "tenant-1", { name: "Devices" })
    ).resolves.toEqual({ ...category, name: "Devices" });
    await expect(service.delete("category-1", "tenant-1")).resolves.toBeUndefined();

    expect(repository.findByTenant).toHaveBeenCalledWith("tenant-1", { limit: 20 });
    expect(repository.create).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      name: "Electronics",
    });
    expect(repository.update).toHaveBeenCalledWith("category-1", "tenant-1", {
      name: "Devices",
    });
    expect(repository.delete).toHaveBeenCalledWith("category-1", "tenant-1");
  });

  it("awaits propagation of a renamed category to embedded product snapshots", async () => {
    const updated = {
      id: "category-1",
      tenantId: "tenant-1",
      name: "Devices",
    };
    const repository = {
      ...stubCategoriesRepository(),
      update: jest.fn().mockResolvedValue(updated),
    };
    const productsRepository = {
      renameCategoryOnProducts: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CategoriesService(repository as any, productsRepository as any);

    await service.update("category-1", "tenant-1", { name: "Devices" });

    expect(productsRepository.renameCategoryOnProducts).toHaveBeenCalledWith(
      "tenant-1",
      "category-1",
      "Devices"
    );
  });

  describe("delete", () => {
    it("blocks deletion while products reference the category", async () => {
      const categoriesRepository = { delete: jest.fn() };
      const productsRepository = {
        hasProductsReferencing: jest.fn().mockResolvedValue(true),
      };
      const service = new CategoriesService(
        categoriesRepository as any,
        productsRepository as any
      );

      await expect(service.delete("cat-1", "tenant-1")).rejects.toThrow(
        ConflictException
      );
      expect(categoriesRepository.delete).not.toHaveBeenCalled();
    });

    it("deletes an unreferenced category", async () => {
      const categoriesRepository = {
        delete: jest.fn().mockResolvedValue(undefined),
      };
      const productsRepository = {
        hasProductsReferencing: jest.fn().mockResolvedValue(false),
      };
      const service = new CategoriesService(
        categoriesRepository as any,
        productsRepository as any
      );

      await service.delete("cat-1", "tenant-1");

      expect(categoriesRepository.delete).toHaveBeenCalledWith("cat-1", "tenant-1");
    });
  });
});
