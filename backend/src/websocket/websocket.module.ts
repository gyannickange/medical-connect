import { Module } from "@nestjs/common";
import { SignalingGateway } from "./signaling.gateway";
import { TokenController } from "./token.controller";
import { TokenService } from "./services/token.service";
import { SecurityService } from "./services/security.service";
import { SignalingService } from "./services/signaling.service";
import { AuthModule } from "../modules/auth/auth.module";
import { IdentityModule } from "../modules/identity/identity.module";
import { SyncModule } from "../modules/sync/sync.module";

@Module({
  imports: [AuthModule, IdentityModule, SyncModule],
  controllers: [TokenController],
  providers: [
    SignalingGateway,
    TokenService,
    SecurityService,
    SignalingService,
  ],
  exports: [SignalingService, TokenService, SecurityService],
})
export class WebSocketModule {}
