import { Module } from "@nestjs/common";
import { ConsultationsController } from "./consultations.controller";
import { ConsultationsService } from "./consultations.service";
import { ConsultationsPolicy } from "./consultations.policy";
import { AuthModule } from "../auth/auth.module";
import { ConsultationsRepositoryModule } from "./consultations.repository.module";

@Module({
  imports: [AuthModule, ConsultationsRepositoryModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, ConsultationsPolicy],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
