import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Request, UseGuards } from "@nestjs/common";
import { SpecialtiesService } from "./specialties.service";
import { CreateSpecialtyDto } from "./dto/create-specialty.dto";
import { UpdateSpecialtyDto } from "./dto/update-specialty.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { SpecialtiesPolicy } from "./specialties.policy";

@Controller("api/specialties")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class SpecialtiesController {
  constructor(private readonly specialtiesService: SpecialtiesService) {}

  @Get(":tenantId")
  @CheckPolicy(SpecialtiesPolicy, "view")
  async findByTenant(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.specialtiesService.findByTenant(this.tenantId(req, tenantId));
  }

  @Post()
  @CheckPolicy(SpecialtiesPolicy, "create")
  async create(@Body() dto: CreateSpecialtyDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.specialtiesService.create({ ...dto, tenantId });
  }

  @Put(":id")
  @CheckPolicy(SpecialtiesPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateSpecialtyDto, @Request() req: any) {
    return this.specialtiesService.update(id, this.tenantId(req), dto);
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
