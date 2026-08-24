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
import { SettingsService } from "./settings.service";
import { CreateSettingDto } from "./dto/create-setting.dto";
import { UpdateSettingDto } from "./dto/update-setting.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { SettingsPolicy } from "./settings.policy";

@Controller("api/settings")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @CheckPolicy(SettingsPolicy, "view")
  async findByTenant(
    @Query("tenantId") tenantId: string | undefined,
    @Request() req: any
  ) {
    const authenticatedTenantId = this.tenantId(req, tenantId);
    return this.settingsService.findByTenant(authenticatedTenantId);
  }

  @Get("key/:key")
  @CheckPolicy(SettingsPolicy, "view")
  async findByKey(
    @Param("key") key: string,
    @Query("tenantId") tenantId: string | undefined,
    @Request() req: any
  ) {
    return this.settingsService.findByKey(key, this.tenantId(req, tenantId));
  }

  @Post()
  @CheckPolicy(SettingsPolicy, "create")
  async create(
    @Body() createSettingDto: CreateSettingDto,
    @Request() req: any
  ) {
    const tenantId = this.tenantId(req, createSettingDto.tenantId);
    return this.settingsService.create(createSettingDto, tenantId);
  }

  @Put(":id")
  @CheckPolicy(SettingsPolicy, "update")
  async update(
    @Param("id") id: string,
    @Body() updateSettingDto: UpdateSettingDto,
    @Request() req: any
  ) {
    return this.settingsService.update(id, this.tenantId(req), updateSettingDto);
  }

  @Put("key/:key")
  @CheckPolicy(SettingsPolicy, "update")
  async updateByKey(
    @Param("key") key: string,
    @Query("tenantId") tenantId: string | undefined,
    @Body() updateSettingDto: UpdateSettingDto,
    @Request() req: any
  ) {
    return this.settingsService.updateByKey(
      key,
      this.tenantId(req, tenantId),
      updateSettingDto
    );
  }

  @Delete(":id")
  @CheckPolicy(SettingsPolicy, "delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param("id") id: string, @Request() req: any) {
    await this.settingsService.delete(id, this.tenantId(req));
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
