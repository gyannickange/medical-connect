import { Module } from "@nestjs/common";
import { RoomsRepository } from "./rooms.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [RoomsRepository],
  exports: [RoomsRepository],
})
export class RoomsRepositoryModule {}
