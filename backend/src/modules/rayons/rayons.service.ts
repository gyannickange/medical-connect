import { Injectable } from "@nestjs/common";
import type { PaginationOptions } from "../../lib/pagination";
import type { InsertRayon, Rayon } from "@shared/schema";
import { ProductsRepository } from "../products/products.repository";
import { RayonsRepository } from "./rayons.repository";

@Injectable()
export class RayonsService {
  constructor(
    private readonly rayonsRepository: RayonsRepository,
    private readonly productsRepository?: ProductsRepository
  ) {}

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    return this.rayonsRepository.findByTenant(tenantId, options);
  }

  async create(data: InsertRayon): Promise<Rayon> {
    return this.rayonsRepository.create(data);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertRayon>
  ): Promise<Rayon> {
    const rayon = await this.rayonsRepository.update(id, tenantId, data);
    if (data.name !== undefined) {
      await this.productsRepository?.renameRayonOnProducts(
        rayon.tenantId,
        rayon.id,
        rayon.name
      );
    }
    return rayon;
  }
}
