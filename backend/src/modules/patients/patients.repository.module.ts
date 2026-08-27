import { Module } from "@nestjs/common";
import { PatientsRepository } from "./patients.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { SequenceCounterModule } from "../../lib/sequence-counter.module";
import { S3Module } from "../../lib/s3.module";

@Module({
  imports: [CouchDBModule, SequenceCounterModule, S3Module],
  providers: [PatientsRepository],
  exports: [PatientsRepository],
})
export class PatientsRepositoryModule {}
