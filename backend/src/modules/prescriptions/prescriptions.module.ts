import { Module } from "@nestjs/common";
import { PrescriptionsController } from "./prescriptions.controller";
import { PrescriptionsService } from "./prescriptions.service";
import { PrescriptionsPolicy } from "./prescriptions.policy";
import { AuthModule } from "../auth/auth.module";
import { PrescriptionsRepositoryModule } from "./prescriptions.repository.module";

@Module({
  imports: [AuthModule, PrescriptionsRepositoryModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionsPolicy],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
