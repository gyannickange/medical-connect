import { Module } from "@nestjs/common";
import { LabOrdersRepository } from "./lab-orders.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";
import { S3Module } from "../../lib/s3.module";

@Module({
  imports: [CouchDBModule, ConsultationsRepositoryModule, S3Module],
  providers: [LabOrdersRepository],
  exports: [LabOrdersRepository],
})
export class LabOrdersRepositoryModule {}
