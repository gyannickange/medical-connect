import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  HttpCode,
  HttpStatus,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { CustomersPolicy } from "./customers.policy";

@Controller("api/customers")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get(":tenantId")
  @CheckPolicy(CustomersPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.customersService.findByTenant(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(":tenantId/search")
  @CheckPolicy(CustomersPolicy, "view")
  async search(
    @Param("tenantId") tenantId: string,
    @Query("q") query: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    if (!query) {
      return [];
    }
    return this.customersService.search(query, this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(":id/purchases")
  @CheckPolicy(CustomersPolicy, "view")
  async getPurchases(@Param("id") id: string, @Request() req: any) {
    return this.customersService.getPurchases(id, req.user.tenantId);
  }

  @Post()
  @CheckPolicy(CustomersPolicy, "create")
  async create(
    @Body() createCustomerDto: CreateCustomerDto,
    @Request() req: any
  ) {
    const tenantId = this.tenantId(req, createCustomerDto.tenantId);
    return this.customersService.create({ ...createCustomerDto, tenantId });
  }

  @Put(":id")
  @CheckPolicy(CustomersPolicy, "update")
  async update(
    @Param("id") id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @Request() req: any
  ) {
    return this.customersService.update(id, this.tenantId(req), updateCustomerDto);
  }

  @Delete(":id")
  @CheckPolicy(CustomersPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string, @Request() req: any) {
    await this.customersService.delete(id, this.tenantId(req));
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
