import { ConflictException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { Tenant, User } from "@shared/schema";
import { TenantsService } from "../tenants/tenants.service";
import { UsersRepository } from "../identity/users.repository";
import { normalizeUsername } from "../../lib/exceptions";
import { CreatePlatformTenantDto } from "./dto/create-platform-tenant.dto";

export interface CreateTenantWithAdminResult {
  tenant: Tenant;
  provisioningSecret: string;
  adminUser: Omit<User, "password">;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersRepository: UsersRepository
  ) {}

  async createTenantWithAdmin(
    dto: CreatePlatformTenantDto
  ): Promise<CreateTenantWithAdminResult> {
    const username = normalizeUsername(dto.adminUsername);
    const existing = await this.usersRepository.findByUsername(username);
    if (existing) {
      throw new ConflictException("Username already exists");
    }

    // Via TenantsService (not TenantsRepository directly) so the tenant's
    // default services get seeded, matching POST /api/tenants.
    const { tenant, provisioningSecret } = await this.tenantsService.create({
      name: dto.name,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      settings: dto.settings ?? null,
      isActive: dto.isActive,
    });

    const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);
    const adminUser = await this.usersRepository.create({
      username,
      password: hashedPassword,
      firstName: dto.adminFirstName,
      lastName: dto.adminLastName,
      email: dto.adminEmail ?? null,
      role: "admin",
      tenantId: tenant.id,
      isActive: true,
    });

    const { password, ...sanitizedAdmin } = adminUser;
    return { tenant, provisioningSecret, adminUser: sanitizedAdmin };
  }
}
