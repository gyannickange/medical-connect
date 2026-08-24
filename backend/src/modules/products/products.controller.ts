import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  Request,
  ForbiddenException,
} from "@nestjs/common";
import { ProductsService } from "./products.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { CreateVariantDto } from "./dto/create-variant.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import {
  CalculateProductPriceQueryDto,
  CreateProductPricingDto,
  UpdateProductPricingDto,
} from "./dto/product-pricing.dto";
import { CreateSellingPriceDto } from "./dto/product-selling-price.dto";
import { CreatePurchaseDto } from "./dto/product-purchase.dto";
import { ProductPurchasesService } from "./product-purchases.service";
import { AcquireProductLockDto, ReleaseProductLockDto } from "./dto/product-lock.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { ProductsPolicy } from "./products.policy";
import { RoleDataFilterInterceptor } from "../auth/interceptors/role-data-filter.interceptor";
import { ProductsLockService } from "./products-lock.service";

@Controller("api/products")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsLockService: ProductsLockService,
    private readonly productPurchasesService: ProductPurchasesService
  ) {}

  @Put(":id/lock")
  @CheckPolicy(ProductsPolicy, "update")
  async acquireLock(
    @Param("id") id: string,
    @Body() dto: AcquireProductLockDto,
    @Request() req: any
  ) {
    await this.productsLockService.acquireOrRenew(
      id,
      req.user.tenantId,
      dto.deviceId,
      dto.deviceName
    );
  }

  @Delete(":id/lock")
  @CheckPolicy(ProductsPolicy, "update")
  @HttpCode(HttpStatus.NO_CONTENT)
  async releaseLock(
    @Param("id") id: string,
    @Body() dto: ReleaseProductLockDto,
    @Request() req: any
  ) {
    await this.productsLockService.release(id, req.user.tenantId, dto.deviceId);
  }

  // Product Variants Endpoints - MUST be before generic :id routes
  @Get("variants/:id")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getVariant(@Param("id") id: string, @Request() req: any) {
    return this.productsService.getVariant(id, this.tenantId(req));
  }

  @Put("variants/:id")
  @CheckPolicy(ProductsPolicy, "update")
  async updateVariant(
    @Param("id") id: string,
    @Body() updateVariantDto: UpdateVariantDto,
    @Request() req: any
  ) {
    return this.productsService.updateVariant(
      id,
      this.tenantId(req),
      updateVariantDto as any
    );
  }

  @Delete("variants/:id")
  @CheckPolicy(ProductsPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteVariant(@Param("id") id: string, @Request() req: any) {
    await this.productsService.deleteVariant(id, this.tenantId(req));
  }

  @Get(":productId/variants")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getVariants(@Param("productId") productId: string, @Request() req: any) {
    return this.productsService.getVariants(productId, this.tenantId(req));
  }

  @Post(":productId/variants")
  @CheckPolicy(ProductsPolicy, "create")
  async createVariant(
    @Param("productId") productId: string,
    @Body() createVariantDto: CreateVariantDto,
    @Request() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.productsService.createVariant(
      {
        ...createVariantDto,
        productId,
      },
      userId,
      this.tenantId(req, createVariantDto.tenantId)
    );
  }

  // Product Selling Price History - MUST be before generic :id routes
  @Get("selling-prices/:productId")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getSellingPrices(
    @Param("productId") productId: string,
    @Query("variantId") variantId: string | undefined,
    @Request() req: any
  ) {
    return this.productsService.getSellingPrices(
      productId,
      req.user.tenantId,
      variantId ?? null
    );
  }

  @Post(":productId/selling-prices")
  @CheckPolicy(ProductsPolicy, "create")
  async addSellingPrice(
    @Param("productId") productId: string,
    @Body() createSellingPriceDto: CreateSellingPriceDto,
    @Request() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.productsService.addSellingPrice(
      productId,
      req.user.tenantId,
      createSellingPriceDto,
      userId
    );
  }

  // Purchases (approvisionnements) - MUST be before generic :id routes
  @Get("purchases/:productId")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getPurchases(
    @Param("productId") productId: string,
    @Query("variantId") variantId: string | undefined,
    @Request() req: any
  ) {
    return this.productPurchasesService.getPurchases(productId, this.tenantId(req), variantId ?? null);
  }

  @Post(":productId/purchases")
  @CheckPolicy(ProductsPolicy, "create")
  async addPurchase(
    @Param("productId") productId: string,
    @Body() dto: CreatePurchaseDto,
    @Request() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.productPurchasesService.addPurchase(productId, this.tenantId(req), dto, userId);
  }

  // Product Pricing - MUST be before generic :id routes
  @Get("pricing/:productId")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getPricing(@Param("productId") productId: string, @Request() req: any) {
    return this.productsService.getProductPricing(productId, req.user.tenantId);
  }

  @Post(":productId/pricing")
  @CheckPolicy(ProductsPolicy, "create")
  async createPricing(
    @Param("productId") productId: string,
    @Body() createPricingDto: CreateProductPricingDto,
    @Request() req: any
  ) {
    return this.productsService.createProductPricing({
      ...createPricingDto,
      productId,
    }, req.user.tenantId);
  }

  @Put("pricing/:id")
  @CheckPolicy(ProductsPolicy, "update")
  async updatePricing(
    @Param("id") id: string,
    @Body() updatePricingDto: UpdateProductPricingDto,
    @Request() req: any
  ) {
    return this.productsService.updateProductPricing(id, updatePricingDto, req.user.tenantId);
  }

  @Delete("pricing/:id")
  @CheckPolicy(ProductsPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePricing(@Param("id") id: string, @Request() req: any) {
    await this.productsService.deleteProductPricing(id, req.user.tenantId);
  }

  // Product Analytics - MUST be before generic :id routes
  @Get("analytics/:productId")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getAnalytics(
    @Param("productId") productId: string,
    @Query("dateRange") dateRange: string,
    @Query("tenantId") tenantId: string,
    @Request() req: any
  ) {
    return this.productsService.getProductAnalytics(
      productId,
      dateRange,
      this.tenantId(req, tenantId)
    );
  }

  // Price Calculation - MUST be before generic :id routes
  @Get(":productId/calculate-price")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async calculatePrice(
    @Param("productId") productId: string,
    @Query() query: CalculateProductPriceQueryDto,
    @Request() req: any
  ) {
    return this.productsService.calculateProductPrice(
      productId,
      query.quantity,
      req.user.tenantId,
      query.variantId,
      query.priceType
    );
  }

  // Specific routes before generic ones
  @Get("barcode/:tenantId/:barcode")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async findByBarcode(
    @Param("tenantId") tenantId: string,
    @Param("barcode") barcode: string,
    @Request() req: any
  ) {
    return this.productsService.findByBarcode(barcode, this.tenantId(req, tenantId));
  }

  @Get(":tenantId/search")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
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
    return this.productsService.search(query, this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  // Generic routes last
  @Get(":tenantId")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.productsService.findByTenant(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Post()
  @CheckPolicy(ProductsPolicy, "create")
  async create(
    @Body() createProductDto: CreateProductDto,
    @Request() req: any
  ) {
    const tenantId = this.tenantId(req, createProductDto.tenantId);
    return this.productsService.create({ ...createProductDto, tenantId });
  }

  @Put(":id")
  @CheckPolicy(ProductsPolicy, "update")
  async update(
    @Param("id") id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Request() req: any
  ) {
    const { deviceId, ...data } = updateProductDto;
    return this.productsService.update(id, this.tenantId(req), data, deviceId);
  }

  @Patch(":id")
  @CheckPolicy(ProductsPolicy, "update")
  async partialUpdate(
    @Param("id") id: string,
    @Body() updateProductDto: Partial<UpdateProductDto>,
    @Request() req: any
  ) {
    const { deviceId, ...data } = updateProductDto;
    return this.productsService.update(
      id,
      this.tenantId(req),
      data as UpdateProductDto,
      deviceId
    );
  }

  @Delete(":id")
  @CheckPolicy(ProductsPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string, @Request() req: any) {
    await this.productsService.delete(id, this.tenantId(req));
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
