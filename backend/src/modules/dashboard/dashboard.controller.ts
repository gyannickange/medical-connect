import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { DashboardService } from "./dashboard.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { DashboardPolicy } from "./dashboard.policy";

@Controller("api/dashboard")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get(":tenantId")
  @CheckPolicy(DashboardPolicy, "view")
  async getMetrics(@Param("tenantId") tenantId: string) {
    return this.dashboardService.getMetrics(tenantId);
  }
}
