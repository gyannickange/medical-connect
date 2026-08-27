import { Module } from "@nestjs/common";
import { PatientsRepository } from "./patients.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { SequenceCounterModule } from "../../lib/sequence-counter.module";

@Module({
  imports: [CouchDBModule, SequenceCounterModule],
  providers: [PatientsRepository],
  exports: [PatientsRepository],
})
export class PatientsRepositoryModule {}
