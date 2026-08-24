import { ConflictException, Injectable } from "@nestjs/common";
import type { PaginationOptions } from "../../lib/pagination";
import type { Category, InsertCategory } from "@shared/schema";
import { ProductsRepository } from "../products/products.repository";
import { CategoriesRepository } from "./categories.repository";

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoriesRepository: CategoriesRepository,
    private readonly productsRepository?: ProductsRepository
  ) {}

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    return this.categoriesRepository.findByTenant(tenantId, options);
  }

  async create(data: InsertCategory): Promise<Category> {
    return this.categoriesRepository.create(data);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertCategory>
  ): Promise<Category> {
    const category = await this.categoriesRepository.update(id, tenantId, data);
    if (data.name !== undefined) {
      await this.productsRepository?.renameCategoryOnProducts(
        category.tenantId,
        category.id,
        category.name
      );
    }
    return category;
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const hasProducts = await this.productsRepository?.hasProductsReferencing(
      tenantId,
      "categoryId",
      id
    );
    if (hasProducts) {
      throw new ConflictException(
        "Cannot delete a category that still has products assigned to it"
      );
    }
    await this.categoriesRepository.delete(id, tenantId);
  }
}
