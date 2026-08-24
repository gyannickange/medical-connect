import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { DeviceAuthorizationPolicy } from "./device-authorization.policy";
import { RequestDeviceAuthorizationDto } from "./dto/request-device-authorization.dto";
import { DecideDeviceAuthorizationDto } from "./dto/decide-device-authorization.dto";
import { ReconcileLanGrantDto } from "./dto/reconcile-lan-grant.dto";
import { DeviceAuthorizationService } from "./device-authorization.service";

@Controller("api/device-authorization")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class DeviceAuthorizationController {
  constructor(private readonly deviceAuthorizationService: DeviceAuthorizationService) {}

  @Post("request")
  async request(@Body() dto: RequestDeviceAuthorizationDto, @Req() req: any) {
    return this.deviceAuthorizationService.request(
      req.user.tenantId,
      dto.deviceId,
      dto.devicePublicKey,
      dto.provisioningSecret
    );
  }

  @Post(":deviceId/approve")
  @CheckPolicy(DeviceAuthorizationPolicy, "approve")
  async approve(
    @Param("deviceId") deviceId: string,
    @Req() req: any,
    @Body() _dto?: DecideDeviceAuthorizationDto
  ) {
    return this.deviceAuthorizationService.approve(req.user.tenantId, deviceId, req.user.id);
  }

  @Post(":deviceId/revoke")
  @CheckPolicy(DeviceAuthorizationPolicy, "revoke")
  async revoke(
    @Param("deviceId") deviceId: string,
    @Req() req: any,
    @Body() _dto?: DecideDeviceAuthorizationDto
  ) {
    return this.deviceAuthorizationService.revoke(req.user.tenantId, deviceId, req.user.id);
  }

  @Get()
  @CheckPolicy(DeviceAuthorizationPolicy, "list")
  async list(@Req() req: any) {
    return this.deviceAuthorizationService.list(req.user.tenantId);
  }

  @Post(":deviceId/deliver-key")
  async deliverKey(@Param("deviceId") deviceId: string, @Req() req: any) {
    return this.deviceAuthorizationService.deliverKey(req.user.tenantId, deviceId);
  }

  @Post("approval-capability")
  async issueApprovalCapability(@Req() req: any) {
    const deviceId = req.headers["x-device-id"];
    return this.deviceAuthorizationService.issueApprovalCapability(
      req.user.tenantId,
      deviceId
    );
  }

  @Post("reconcile-lan-grant")
  async reconcileLanGrant(@Body() dto: ReconcileLanGrantDto, @Req() req: any) {
    return this.deviceAuthorizationService.reconcileLanGrant(req.user.tenantId, dto);
  }
}
