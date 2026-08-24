import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Query,
  Request,
} from "@nestjs/common";
import { StaffService } from "./staff.service";
import { CreateStaffDto } from "./dto/create-staff.dto";
import { UpdateStaffDto } from "./dto/update-staff.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { StaffPolicy } from "./staff.policy";

@Controller("api/staff")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Get(":tenantId")
  @CheckPolicy(StaffPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number
  ) {
    return this.staffService.findByTenant(tenantId, {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Post()
  @CheckPolicy(StaffPolicy, "create")
  async create(@Body() createStaffDto: CreateStaffDto) {
    return this.staffService.create(createStaffDto);
  }

  @Put(":id")
  @CheckPolicy(StaffPolicy, "update")
  async update(
    @Param("id") id: string,
    @Body() updateStaffDto: UpdateStaffDto,
    @Request() req: any
  ) {
    return this.staffService.update(id, req.user.tenantId, updateStaffDto);
  }

  @Delete(":id")
  @CheckPolicy(StaffPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string, @Request() req: any) {
    await this.staffService.delete(id, req.user.tenantId);
  }
}
