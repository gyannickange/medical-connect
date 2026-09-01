import { Module } from "@nestjs/common";
import { ServicesRepository } from "./services.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [ServicesRepository],
  exports: [ServicesRepository],
})
export class ServicesRepositoryModule {}
