import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Request, UseGuards } from "@nestjs/common";
import { ServicesService } from "./services.service";
import { CreateServiceDto } from "./dto/create-service.dto";
import { UpdateServiceDto } from "./dto/update-service.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { ServicesPolicy } from "./services.policy";

@Controller("api/services")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get(":tenantId")
  @CheckPolicy(ServicesPolicy, "view")
  async findByTenant(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.servicesService.findByTenant(this.tenantId(req, tenantId));
  }

  @Post()
  @CheckPolicy(ServicesPolicy, "create")
  async create(@Body() dto: CreateServiceDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.servicesService.create({ ...dto, tenantId });
  }

  @Put(":id")
  @CheckPolicy(ServicesPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateServiceDto, @Request() req: any) {
    return this.servicesService.update(id, this.tenantId(req), dto);
  }

  private tenantId(req: any, legacyTenantId?: string): string {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("Authenticated tenant is required");
    if (legacyTenantId && legacyTenantId !== tenantId) {
      throw new ForbiddenException("Tenant does not match authenticated user");
    }
    return tenantId;
  }
}
