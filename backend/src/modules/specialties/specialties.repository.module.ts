import { Module } from "@nestjs/common";
import { SpecialtiesRepository } from "./specialties.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [SpecialtiesRepository],
  exports: [SpecialtiesRepository],
})
export class SpecialtiesRepositoryModule {}
