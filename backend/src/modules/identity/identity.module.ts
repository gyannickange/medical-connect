import { Module } from "@nestjs/common";
import { CouchDBModule } from "../../database/couchdb.module";
import { TenantsRepository } from "./tenants.repository";
import { UsersRepository } from "./users.repository";

@Module({
  imports: [CouchDBModule],
  providers: [TenantsRepository, UsersRepository],
  exports: [TenantsRepository, UsersRepository],
})
export class IdentityModule {}
