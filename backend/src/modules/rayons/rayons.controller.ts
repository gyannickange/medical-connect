import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Query,
  Request,
  ForbiddenException,
} from "@nestjs/common";
import { RayonsService } from "./rayons.service";
import { CreateRayonDto } from "./dto/create-rayon.dto";
import { UpdateRayonDto } from "./dto/update-rayon.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { RayonsPolicy } from "./rayons.policy";

@Controller("api/rayons")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class RayonsController {
  constructor(private readonly rayonsService: RayonsService) {}

  @Get(":tenantId")
  @CheckPolicy(RayonsPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.rayonsService.findByTenant(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Post()
  @CheckPolicy(RayonsPolicy, "create")
  async create(@Body() createRayonDto: CreateRayonDto, @Request() req: any) {
    const tenantId = this.tenantId(req, createRayonDto.tenantId);
    return this.rayonsService.create({ ...createRayonDto, tenantId });
  }

  @Put(":id")
  @CheckPolicy(RayonsPolicy, "update")
  async update(
    @Param("id") id: string,
    @Body() updateRayonDto: UpdateRayonDto,
    @Request() req: any
  ) {
    return this.rayonsService.update(id, this.tenantId(req), updateRayonDto);
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
