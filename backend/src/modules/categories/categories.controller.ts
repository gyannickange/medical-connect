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
  ForbiddenException,
} from "@nestjs/common";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { CategoriesPolicy } from "./categories.policy";

@Controller("api/categories")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get(":tenantId")
  @CheckPolicy(CategoriesPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    return this.categoriesService.findByTenant(this.tenantId(req, tenantId), {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Post()
  @CheckPolicy(CategoriesPolicy, "create")
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
    @Request() req: any
  ) {
    const tenantId = this.tenantId(req, createCategoryDto.tenantId);
    return this.categoriesService.create({ ...createCategoryDto, tenantId });
  }

  @Put(":id")
  @CheckPolicy(CategoriesPolicy, "update")
  async update(
    @Param("id") id: string,
    @Body() updateCategoryDto: UpdateCategoryDto,
    @Request() req: any
  ) {
    return this.categoriesService.update(id, this.tenantId(req), updateCategoryDto);
  }

  @Delete(":id")
  @CheckPolicy(CategoriesPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string, @Request() req: any) {
    await this.categoriesService.delete(id, this.tenantId(req));
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
