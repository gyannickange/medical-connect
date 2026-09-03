import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { PlatformPolicy } from "./platform.policy";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [AuthModule, IdentityModule, TenantsModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformPolicy],
})
export class PlatformModule {}
