import { Controller, Get, Param, UseGuards } from "@nestjs/common";
import { PeersService } from "./peers.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@Controller("api/peers")
@UseGuards(JwtAuthGuard)
export class PeersController {
  constructor(private readonly peersService: PeersService) {}

  @Get(":tenantId")
  async getOnlinePeers(@Param("tenantId") tenantId: string) {
    return this.peersService.getOnlinePeers(tenantId);
  }
}
