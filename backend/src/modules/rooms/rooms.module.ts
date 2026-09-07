import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { RoomsPolicy } from "./rooms.policy";
import { AuthModule } from "../auth/auth.module";
import { RoomsRepositoryModule } from "./rooms.repository.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";
import { PatientsRepositoryModule } from "../patients/patients.repository.module";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [AuthModule, RoomsRepositoryModule, ConsultationsRepositoryModule, PatientsRepositoryModule, IdentityModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsPolicy],
  exports: [RoomsService],
})
export class RoomsModule {}
