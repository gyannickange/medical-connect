import { Controller, Get, Patch, Param, Request, UseGuards, ForbiddenException } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { NotificationsPolicy } from "./notifications.policy";

@Controller("api/notifications")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @CheckPolicy(NotificationsPolicy, "view")
  async list(@Request() req: any) {
    return this.notificationsService.findForRecipient(this.tenantId(req), req.user.id);
  }

  @Patch(":id/read")
  @CheckPolicy(NotificationsPolicy, "markRead")
  async markRead(@Param("id") id: string, @Request() req: any) {
    return this.notificationsService.markRead(id, this.tenantId(req), req.user.id);
  }

  private tenantId(req: any): string {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("Authenticated tenant is required");
    return tenantId;
  }
}
