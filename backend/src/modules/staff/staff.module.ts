import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { StaffPolicy } from "./staff.policy";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [AuthModule, IdentityModule, RolesModule],
  controllers: [StaffController],
  providers: [StaffService, StaffPolicy],
  exports: [StaffService],
})
export class StaffModule {}
