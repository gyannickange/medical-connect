import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Delete, Request, UseGuards } from "@nestjs/common";
import { RolesService } from "./roles.service";
import { CreateRoleDto } from "./dto/create-role.dto";
import { UpdateRoleDto } from "./dto/update-role.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { RolesPolicy } from "./roles.policy";

@Controller("api/roles")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get("mine")
  async findMine(@Request() req: any) {
    return this.rolesService.findMine(this.tenantId(req), req.user.role);
  }

  @Get(":tenantId")
  @CheckPolicy(RolesPolicy, "view")
  async findByTenant(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.rolesService.findByTenant(this.tenantId(req, tenantId));
  }

  @Get("detail/:id")
  @CheckPolicy(RolesPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.rolesService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(RolesPolicy, "create")
  async create(@Body() dto: CreateRoleDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.rolesService.create({ ...dto, tenantId });
  }

  @Put(":id")
  @CheckPolicy(RolesPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateRoleDto, @Request() req: any) {
    return this.rolesService.update(id, this.tenantId(req), dto);
  }

  @Delete(":id")
  @CheckPolicy(RolesPolicy, "delete")
  async delete(@Param("id") id: string, @Request() req: any) {
    return this.rolesService.delete(id, this.tenantId(req));
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
