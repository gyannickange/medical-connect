import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { LabOrdersService } from "./lab-orders.service";
import { CreateLabOrderDto } from "./dto/create-lab-order.dto";
import { UpdateLabOrderDto } from "./dto/update-lab-order.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { LabOrdersPolicy } from "./lab-orders.policy";

@Controller("api/lab-orders")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Get(":tenantId")
  @CheckPolicy(LabOrdersPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("consultationId") consultationId?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Request() req?: any
  ) {
    return this.labOrdersService.findByTenant(this.tenantId(req, tenantId), { consultationId, status, priority });
  }

  @Get("detail/:id")
  @CheckPolicy(LabOrdersPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.labOrdersService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(LabOrdersPolicy, "create")
  async create(@Body() dto: CreateLabOrderDto, @Request() req: any) {
    return this.labOrdersService.create({ ...dto, tenantId: this.tenantId(req), requestedByUserId: req.user.id } as any);
  }

  @Put(":id")
  @CheckPolicy(LabOrdersPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateLabOrderDto, @Request() req: any) {
    return this.labOrdersService.update(id, this.tenantId(req), dto as any, req.user.id);
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
