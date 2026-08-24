import { Module } from "@nestjs/common";
import { CouchDBService } from "./couchdb.service";

@Module({
  providers: [CouchDBService],
  exports: [CouchDBService],
})
export class CouchDBModule {}
