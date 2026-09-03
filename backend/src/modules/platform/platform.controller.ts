import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { PlatformService } from "./platform.service";
import { CreatePlatformTenantDto } from "./dto/create-platform-tenant.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { PlatformPolicy } from "./platform.policy";

@Controller("api/platform")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Post("tenants")
  @CheckPolicy(PlatformPolicy, "createTenant")
  async createTenant(@Body() dto: CreatePlatformTenantDto) {
    return this.platformService.createTenantWithAdmin(dto);
  }
}
