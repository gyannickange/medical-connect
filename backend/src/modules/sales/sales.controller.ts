import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from "@nestjs/common";
import { SalesService } from "./sales.service";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { SalesPolicy } from "./sales.policy";

@Controller("api/sales")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get("analytics/:tenantId")
  @CheckPolicy(SalesPolicy, "view")
  async getSalesAnalytics(
    @Param("tenantId") tenantId: string,
    @Query("dateRange") dateRange: string,
    @Request() req: any
  ) {
    return this.salesService.getSalesAnalytics(
      dateRange || "7d",
      this.tenantId(req, tenantId)
    );
  }

  @Get("product/:productId")
  @CheckPolicy(SalesPolicy, "view")
  async getSalesByProduct(
    @Param("productId") productId: string,
    @Query("tenantId") tenantId: string,
    @Request() req: any
  ) {
    return this.salesService.getSalesByProduct(productId, this.tenantId(req, tenantId));
  }

  @Get(":tenantId")
  @CheckPolicy(SalesPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.salesService.findByTenant(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(":tenantId/today")
  @CheckPolicy(SalesPolicy, "view")
  async getTodaysSales(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.salesService.getTodaysSales(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(":tenantId/report/:startDate/:endDate")
  @CheckPolicy(SalesPolicy, "view")
  async getSalesReport(
    @Param("tenantId") tenantId: string,
    @Param("startDate") startDate: string,
    @Param("endDate") endDate: string,
    @Request() req: any
  ) {
    return this.salesService.getSalesReport(
      this.tenantId(req, tenantId),
      new Date(startDate),
      new Date(endDate)
    );
  }

  @Post()
  @CheckPolicy(SalesPolicy, "create")
  async create(@Body() createSaleDto: CreateSaleDto, @Request() req: any) {
    const { sale, items } = createSaleDto;
    const tenantId = this.tenantId(req, sale.tenantId);
    const userId = req?.user?.userId ?? req?.user?.id;
    if (!userId) throw new ForbiddenException("Authenticated user is required");
    return this.salesService.create({ ...sale, tenantId, userId }, items);
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
