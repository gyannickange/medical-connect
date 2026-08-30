import { Controller, Get, Post, Body, Param, UseGuards, Request, ForbiddenException } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { AppendQueueEventDto } from "./dto/append-queue-event.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { QueuePolicy } from "./queue.policy";

@Controller("api/queue")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get(":tenantId")
  @CheckPolicy(QueuePolicy, "view")
  async getActiveQueue(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.queueService.getActiveQueue(this.tenantId(req, tenantId));
  }

  @Get(":tenantId/history/:date")
  @CheckPolicy(QueuePolicy, "view")
  async getQueueHistory(@Param("tenantId") tenantId: string, @Param("date") date: string, @Request() req: any) {
    return this.queueService.getQueueHistory(this.tenantId(req, tenantId), date);
  }

  @Post("events")
  @CheckPolicy(QueuePolicy, "appendEvent")
  async appendEvent(@Body() dto: AppendQueueEventDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.queueService.appendEvent({ ...dto, tenantId, actorUserId: req.user.id, actorDeviceId: req.headers["x-device-id"] } as any);
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
