import { ConflictException, Injectable } from "@nestjs/common";
import type { PaginationOptions } from "../../lib/pagination";
import type { Supplier, InsertSupplier } from "@shared/schema";
import { SuppliersRepository } from "./suppliers.repository";
import { ProductsRepository } from "../products/products.repository";

@Injectable()
export class SuppliersService {
  constructor(
    private readonly suppliersRepository: SuppliersRepository,
    private readonly productsRepository?: ProductsRepository
  ) {}

  async findByTenant(
    tenantId: string,
    options?: PaginationOptions
  ): Promise<any[]> {
    return this.suppliersRepository.findByTenant(tenantId, options);
  }

  async create(data: InsertSupplier): Promise<Supplier> {
    return this.suppliersRepository.create(data);
  }

  async update(id: string, tenantId: string, data: Partial<InsertSupplier>): Promise<Supplier> {
    return this.suppliersRepository.update(id, tenantId, data);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const hasProducts = await this.productsRepository?.hasProductsReferencing(
      tenantId,
      "supplierId",
      id
    );
    if (hasProducts) {
      throw new ConflictException(
        "Cannot delete a supplier that still has products assigned to it"
      );
    }
    return this.suppliersRepository.delete(id, tenantId);
  }
}
