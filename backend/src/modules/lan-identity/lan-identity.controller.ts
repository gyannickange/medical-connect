import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { LanIdentityService } from "./lan-identity.service";

interface CertificateRequest {
  deviceId: string;
  devicePublicKey: string;
}

@Controller("api/lan-identity")
@UseGuards(JwtAuthGuard)
export class LanIdentityController {
  constructor(private readonly identities: LanIdentityService) {}

  @Post("certificate")
  issueCertificate(@Body() body: CertificateRequest, @Req() request: any) {
    if (request.user.tenantId === null) {
      throw new ForbiddenException("Not available for platform administrators");
    }
    return this.identities.issueCertificate(
      request.user.tenantId,
      body.deviceId,
      body.devicePublicKey
    );
  }
}

