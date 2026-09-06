import { Module } from "@nestjs/common";
import { SpecialtiesController } from "./specialties.controller";
import { SpecialtiesService } from "./specialties.service";
import { SpecialtiesPolicy } from "./specialties.policy";
import { AuthModule } from "../auth/auth.module";
import { SpecialtiesRepositoryModule } from "./specialties.repository.module";

@Module({
  imports: [AuthModule, SpecialtiesRepositoryModule],
  controllers: [SpecialtiesController],
  providers: [SpecialtiesService, SpecialtiesPolicy],
  exports: [SpecialtiesService],
})
export class SpecialtiesModule {}
