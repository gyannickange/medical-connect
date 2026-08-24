import { Module } from "@nestjs/common";
import { SalesRepository } from "./sales.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [SalesRepository],
  exports: [SalesRepository],
})
export class SalesRepositoryModule {}
