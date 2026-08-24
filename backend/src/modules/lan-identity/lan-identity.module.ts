import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { LanIdentityController } from "./lan-identity.controller";
import { LanIdentityService } from "./lan-identity.service";

@Module({
  imports: [AuthModule],
  controllers: [LanIdentityController],
  providers: [LanIdentityService],
  exports: [LanIdentityService],
})
export class LanIdentityModule {}

