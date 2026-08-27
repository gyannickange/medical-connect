import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { ConsultationsService } from "./consultations.service";
import { CreateConsultationDto } from "./dto/create-consultation.dto";
import { UpdateConsultationDto } from "./dto/update-consultation.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { ConsultationsPolicy } from "./consultations.policy";

@Controller("api/consultations")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get(":tenantId")
  @CheckPolicy(ConsultationsPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("specialty") specialty?: string,
    @Query("assignedDoctorId") assignedDoctorId?: string,
    @Query("scheduledOnOrAfter") scheduledOnOrAfter?: string,
    @Request() req?: any
  ) {
    return this.consultationsService.findByTenant(this.tenantId(req, tenantId), { specialty, assignedDoctorId, scheduledOnOrAfter });
  }

  @Get("detail/:id")
  @CheckPolicy(ConsultationsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.consultationsService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(ConsultationsPolicy, "create")
  async create(@Body() dto: CreateConsultationDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.consultationsService.create({ ...dto, tenantId } as any);
  }

  @Put(":id")
  @CheckPolicy(ConsultationsPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateConsultationDto, @Request() req: any) {
    return this.consultationsService.update(id, this.tenantId(req), dto as any);
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
