import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { TenantsService } from "./tenants.service";
import { CreateTenantDto } from "./dto/create-tenant.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { TenantsPolicy } from "./tenants.policy";

@Controller("api/tenants")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @CheckPolicy(TenantsPolicy, "view")
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Post()
  @CheckPolicy(TenantsPolicy, "create")
  async create(@Body() createTenantDto: CreateTenantDto) {
    return this.tenantsService.create(createTenantDto);
  }
}
