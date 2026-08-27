import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { PrescriptionsService } from "./prescriptions.service";
import { CreatePrescriptionDto } from "./dto/create-prescription.dto";
import { UpdatePrescriptionDto } from "./dto/update-prescription.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { PrescriptionsPolicy } from "./prescriptions.policy";

@Controller("api/prescriptions")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get(":tenantId")
  @CheckPolicy(PrescriptionsPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("consultationId") consultationId?: string,
    @Query("status") status?: string,
    @Request() req?: any
  ) {
    return this.prescriptionsService.findByTenant(this.tenantId(req, tenantId), { consultationId, status });
  }

  @Get("detail/:id")
  @CheckPolicy(PrescriptionsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.prescriptionsService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(PrescriptionsPolicy, "create")
  async create(@Body() dto: CreatePrescriptionDto, @Request() req: any) {
    return this.prescriptionsService.create({ ...dto, tenantId: this.tenantId(req), prescribedByUserId: req.user.id } as any);
  }

  @Put(":id")
  @CheckPolicy(PrescriptionsPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdatePrescriptionDto, @Request() req: any) {
    return this.prescriptionsService.update(id, this.tenantId(req), dto as any, req.user.id);
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
