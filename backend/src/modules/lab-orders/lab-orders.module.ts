import { Module } from "@nestjs/common";
import { LabOrdersController } from "./lab-orders.controller";
import { LabOrdersService } from "./lab-orders.service";
import { LabOrdersPolicy } from "./lab-orders.policy";
import { AuthModule } from "../auth/auth.module";
import { LabOrdersRepositoryModule } from "./lab-orders.repository.module";

@Module({
  imports: [AuthModule, LabOrdersRepositoryModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService, LabOrdersPolicy],
  exports: [LabOrdersService],
})
export class LabOrdersModule {}
