import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Request, UseGuards } from "@nestjs/common";
import { RoomsService } from "./rooms.service";
import { CreateRoomDto } from "./dto/create-room.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { RoomsPolicy } from "./rooms.policy";

@Controller("api/rooms")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get(":tenantId")
  @CheckPolicy(RoomsPolicy, "view")
  async findByTenant(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.roomsService.findByTenant(this.tenantId(req, tenantId));
  }

  @Get("detail/:id")
  @CheckPolicy(RoomsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.roomsService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(RoomsPolicy, "create")
  async create(@Body() dto: CreateRoomDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.roomsService.create({ ...dto, tenantId } as any);
  }

  @Put(":id")
  @CheckPolicy(RoomsPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateRoomDto, @Request() req: any) {
    return this.roomsService.update(id, this.tenantId(req), dto);
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
