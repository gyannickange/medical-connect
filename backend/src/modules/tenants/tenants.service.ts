import { Injectable } from "@nestjs/common";
import type { Tenant, InsertTenant } from "@shared/schema";
import { TenantsRepository } from "../identity/tenants.repository";
import { ServicesRepository } from "../services/services.repository";

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly servicesRepository: ServicesRepository
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantsRepository.findAll();
  }

  async create(
    data: InsertTenant
  ): Promise<{ tenant: Tenant; provisioningSecret: string }> {
    const result = await this.tenantsRepository.create(data);
    await this.servicesRepository.seedDefaults(result.tenant.id);
    return result;
  }
}
