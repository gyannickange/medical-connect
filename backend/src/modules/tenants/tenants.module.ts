import { Module } from "@nestjs/common";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { TenantsPolicy } from "./tenants.policy";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsPolicy],
  exports: [TenantsService],
})
export class TenantsModule {}
