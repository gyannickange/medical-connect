import { Injectable } from "@nestjs/common";
import type { Tenant, InsertTenant } from "@shared/schema";
import { TenantsRepository } from "../identity/tenants.repository";

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantsRepository.findAll();
  }

  async create(
    data: InsertTenant
  ): Promise<{ tenant: Tenant; provisioningSecret: string }> {
    return this.tenantsRepository.create(data);
  }
}
