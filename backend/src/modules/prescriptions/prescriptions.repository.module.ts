import { Module } from "@nestjs/common";
import { PrescriptionsRepository } from "./prescriptions.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";

@Module({
  imports: [CouchDBModule, ConsultationsRepositoryModule],
  providers: [PrescriptionsRepository],
  exports: [PrescriptionsRepository],
})
export class PrescriptionsRepositoryModule {}
