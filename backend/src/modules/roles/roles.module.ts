import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { RolesPolicy } from "./roles.policy";
import { AuthModule } from "../auth/auth.module";
import { RolesRepositoryModule } from "./roles.repository.module";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [AuthModule, RolesRepositoryModule, IdentityModule],
  controllers: [RolesController],
  providers: [RolesService, RolesPolicy],
  exports: [RolesService],
})
export class RolesModule {}
