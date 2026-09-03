import { Module } from "@nestjs/common";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";
import { TenantsPolicy } from "./tenants.policy";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { ServicesRepositoryModule } from "../services/services.repository.module";

@Module({
  imports: [AuthModule, IdentityModule, ServicesRepositoryModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsPolicy],
  exports: [TenantsService],
})
export class TenantsModule {}
