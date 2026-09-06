import { Module } from "@nestjs/common";
import { RolesRepository } from "./roles.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [RolesRepository],
  exports: [RolesRepository],
})
export class RolesRepositoryModule {}
