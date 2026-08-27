import { Module } from "@nestjs/common";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";
import { PatientsPolicy } from "./patients.policy";
import { AuthModule } from "../auth/auth.module";
import { PatientsRepositoryModule } from "./patients.repository.module";

@Module({
  imports: [AuthModule, PatientsRepositoryModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsPolicy],
  exports: [PatientsService],
})
export class PatientsModule {}
