import { Injectable } from "@nestjs/common";
import type { Tenant, InsertTenant } from "@shared/schema";
import { TenantsRepository } from "../identity/tenants.repository";
import { ServicesRepository } from "../services/services.repository";
import type { RequestWithUser } from "../auth/policies/policy.types";

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly servicesRepository: ServicesRepository
  ) {}

  async findAll(user: RequestWithUser["user"]): Promise<Tenant[]> {
    if (user.role === "platform_admin") {
      return this.tenantsRepository.findAll();
    }
    const own = user.tenantId ? await this.tenantsRepository.findById(user.tenantId) : undefined;
    return own ? [own] : [];
  }

  async create(
    data: InsertTenant
  ): Promise<{ tenant: Tenant; provisioningSecret: string }> {
    const result = await this.tenantsRepository.create(data);
    await this.servicesRepository.seedDefaults(result.tenant.id);
    return result;
  }
}
