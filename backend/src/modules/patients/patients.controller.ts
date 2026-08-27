import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { AttachPatientPhotoDto } from "./dto/attach-patient-photo.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { PatientsPolicy } from "./patients.policy";

@Controller("api/patients")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get(":tenantId")
  @CheckPolicy(PatientsPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("q") q?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    const scopedTenantId = this.tenantId(req, tenantId);
    const pagination = {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    };
    return q
      ? this.patientsService.search(q, scopedTenantId, pagination)
      : this.patientsService.findByTenant(scopedTenantId, pagination);
  }

  @Get("detail/:id")
  @CheckPolicy(PatientsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.patientsService.findById(id, this.tenantId(req));
  }

  @Get(":id/photo-url")
  @CheckPolicy(PatientsPolicy, "view")
  async getPhotoUrl(@Param("id") id: string, @Request() req: any) {
    return { url: await this.patientsService.getPhotoUrl(id, this.tenantId(req)) };
  }

  @Post()
  @CheckPolicy(PatientsPolicy, "create")
  async create(@Body() createPatientDto: CreatePatientDto, @Request() req: any) {
    const tenantId = this.tenantId(req, createPatientDto.tenantId);
    return this.patientsService.create({ ...createPatientDto, tenantId } as any);
  }

  @Put(":id")
  @CheckPolicy(PatientsPolicy, "update")
  async update(@Param("id") id: string, @Body() updatePatientDto: UpdatePatientDto, @Request() req: any) {
    return this.patientsService.update(id, this.tenantId(req), updatePatientDto as any);
  }

  @Put(":id/photo")
  @CheckPolicy(PatientsPolicy, "update")
  async attachPhoto(@Param("id") id: string, @Body() dto: AttachPatientPhotoDto, @Request() req: any) {
    return this.patientsService.attachPhoto(id, this.tenantId(req), dto.photoBase64, dto.contentType);
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
