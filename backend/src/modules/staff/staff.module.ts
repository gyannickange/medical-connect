import { Module } from "@nestjs/common";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";
import { StaffPolicy } from "./staff.policy";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [AuthModule, IdentityModule],
  controllers: [StaffController],
  providers: [StaffService, StaffPolicy],
  exports: [StaffService],
})
export class StaffModule {}
