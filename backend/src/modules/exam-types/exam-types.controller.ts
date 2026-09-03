import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Put, Request, UseGuards } from "@nestjs/common";
import { ExamTypesService } from "./exam-types.service";
import { CreateExamTypeDto, ExamTypeParameterDto } from "./dto/create-exam-type.dto";
import { UpdateExamTypeDto } from "./dto/update-exam-type.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { ExamTypesPolicy } from "./exam-types.policy";
import type { ExamTypeParameter } from "@shared/schema";

function normalizeParameters(parameters?: ExamTypeParameterDto[]): ExamTypeParameter[] | undefined {
  return parameters?.map((parameter) => ({ name: parameter.name, unit: parameter.unit ?? null, referenceRange: parameter.referenceRange ?? null }));
}

@Controller("api/exam-types")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class ExamTypesController {
  constructor(private readonly examTypesService: ExamTypesService) {}

  @Get(":tenantId")
  @CheckPolicy(ExamTypesPolicy, "view")
  async findByTenant(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.examTypesService.findByTenant(this.tenantId(req, tenantId));
  }

  @Post()
  @CheckPolicy(ExamTypesPolicy, "create")
  async create(@Body() dto: CreateExamTypeDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.examTypesService.create({ ...dto, tenantId, parameters: normalizeParameters(dto.parameters) });
  }

  @Put(":id")
  @CheckPolicy(ExamTypesPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateExamTypeDto, @Request() req: any) {
    return this.examTypesService.update(id, this.tenantId(req), { ...dto, parameters: normalizeParameters(dto.parameters) });
  }

  @Delete(":id")
  @CheckPolicy(ExamTypesPolicy, "delete")
  async delete(@Param("id") id: string, @Request() req: any) {
    await this.examTypesService.delete(id, this.tenantId(req));
    return { ok: true };
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
