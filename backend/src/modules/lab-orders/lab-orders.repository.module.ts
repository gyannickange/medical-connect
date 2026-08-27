import { Module } from "@nestjs/common";
import { LabOrdersRepository } from "./lab-orders.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";

@Module({
  imports: [CouchDBModule, ConsultationsRepositoryModule],
  providers: [LabOrdersRepository],
  exports: [LabOrdersRepository],
})
export class LabOrdersRepositoryModule {}
