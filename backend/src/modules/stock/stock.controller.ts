import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  ForbiddenException,
} from "@nestjs/common";
import { StockService } from "./stock.service";
import { StockEntryDto } from "./dto/stock-entry.dto";
import { StockExitDto } from "./dto/stock-exit.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { StockPolicy } from "./stock.policy";

@Controller("api/stock")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get(":tenantId")
  @CheckPolicy(StockPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.stockService.findByTenant(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get(":tenantId/low")
  @CheckPolicy(StockPolicy, "view")
  async findLowStock(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.stockService.findLowStock(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Post(":productId/entry")
  @CheckPolicy(StockPolicy, "entry")
  async entry(
    @Param("productId") productId: string,
    @Body() stockEntryDto: StockEntryDto,
    @Request() req: any
  ) {
    const tenantId = this.tenantId(req, stockEntryDto.tenantId);
    return this.stockService.stockEntry(
      productId,
      stockEntryDto.quantity,
      stockEntryDto.reason ?? undefined,
      this.userId(req),
      tenantId
    );
  }

  @Post(":productId/exit")
  @CheckPolicy(StockPolicy, "exit")
  async exit(
    @Param("productId") productId: string,
    @Body() stockExitDto: StockExitDto,
    @Request() req: any
  ) {
    const tenantId = this.tenantId(req, stockExitDto.tenantId);
    return this.stockService.stockExit(
      productId,
      stockExitDto.quantity,
      stockExitDto.reason ?? undefined,
      this.userId(req),
      tenantId
    );
  }

  @Get(":productId/movements")
  @CheckPolicy(StockPolicy, "view")
  async getMovements(
    @Param("productId") productId: string,
    @Request() req: any
  ) {
    return this.stockService.getMovementsByProduct(productId, req.user.tenantId);
  }

  @Post("variant/:variantId/entry")
  @CheckPolicy(StockPolicy, "entry")
  async variantEntry(
    @Param("variantId") variantId: string,
    @Body() dto: any,
    @Request() req: any
  ) {
    return this.stockService.variantStockEntry(
      variantId,
      dto.quantity,
      dto.reason,
      this.userId(req),
      this.tenantId(req, dto.tenantId),
      dto.productId
    );
  }

  @Post("variant/:variantId/exit")
  @CheckPolicy(StockPolicy, "exit")
  async variantExit(
    @Param("variantId") variantId: string,
    @Body() dto: any,
    @Request() req: any
  ) {
    return this.stockService.variantStockExit(
      variantId,
      dto.quantity,
      dto.reason,
      this.userId(req),
      this.tenantId(req, dto.tenantId),
      dto.productId
    );
  }

  @Get("variant/:variantId/movements")
  @CheckPolicy(StockPolicy, "view")
  async getVariantMovements(
    @Param("variantId") variantId: string,
    @Request() req: any
  ) {
    return this.stockService.getMovementsByVariant(variantId, req.user.tenantId);
  }

  private tenantId(req: any, legacyTenantId?: string): string {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("Authenticated tenant is required");
    if (legacyTenantId && legacyTenantId !== tenantId) {
      throw new ForbiddenException("Tenant does not match authenticated user");
    }
    return tenantId;
  }

  private userId(req: any): string {
    const userId = req?.user?.userId ?? req?.user?.id;
    if (!userId) throw new ForbiddenException("Authenticated user is required");
    return userId;
  }
}
