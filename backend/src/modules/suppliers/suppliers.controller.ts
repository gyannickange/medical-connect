import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  ForbiddenException,
} from "@nestjs/common";
import { SuppliersService } from "./suppliers.service";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { SuppliersPolicy } from "./suppliers.policy";

@Controller("api/suppliers")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get(":tenantId")
  @CheckPolicy(SuppliersPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.suppliersService.findByTenant(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Post()
  @CheckPolicy(SuppliersPolicy, "create")
  async create(@Body() createSupplierDto: CreateSupplierDto, @Request() req: any) {
    this.tenantId(req, createSupplierDto.tenantId);
    return this.suppliersService.create(createSupplierDto);
  }

  @Put(":id")
  @CheckPolicy(SuppliersPolicy, "update")
  async update(
    @Param("id") id: string,
    @Body() updateSupplierDto: UpdateSupplierDto,
    @Request() req: any
  ) {
    return this.suppliersService.update(id, this.tenantId(req), updateSupplierDto);
  }

  @Delete(":id")
  @CheckPolicy(SuppliersPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string, @Request() req: any) {
    await this.suppliersService.delete(id, this.tenantId(req));
  }

  private tenantId(req: any, legacyTenantId?: string): string {
    const tenantId = req?.user?.tenantId;
    if (!tenantId || (legacyTenantId && legacyTenantId !== tenantId)) {
      throw new ForbiddenException("Tenant does not match authenticated user");
    }
    return tenantId;
  }
}
