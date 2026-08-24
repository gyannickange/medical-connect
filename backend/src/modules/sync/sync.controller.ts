import { Controller, Get, Post, Body, Param, UseGuards } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { UpdateSyncStatusDto } from "./dto/update-sync-status.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("api/sync")
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Post("status")
  async updateStatus(@Body() updateSyncStatusDto: UpdateSyncStatusDto) {
    return this.syncService.updateStatus(updateSyncStatusDto);
  }

  @Get("status/:tenantId")
  async getAllStatuses(@Param("tenantId") tenantId: string) {
    return this.syncService.getAllStatuses(tenantId);
  }

  @Get("status/:tenantId/:deviceId")
  async getStatus(
    @Param("tenantId") tenantId: string,
    @Param("deviceId") deviceId: string
  ) {
    return this.syncService.getStatus(tenantId, deviceId);
  }
}
