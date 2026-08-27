import { Module } from "@nestjs/common";
import { ConsultationsRepository } from "./consultations.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { SequenceCounterModule } from "../../lib/sequence-counter.module";
import { PatientsRepositoryModule } from "../patients/patients.repository.module";

@Module({
  imports: [CouchDBModule, SequenceCounterModule, PatientsRepositoryModule],
  providers: [ConsultationsRepository],
  exports: [ConsultationsRepository],
})
export class ConsultationsRepositoryModule {}
