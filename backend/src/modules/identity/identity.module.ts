import { Module } from "@nestjs/common";
import { CouchDBModule } from "../../database/couchdb.module";
import { S3Module } from "../../lib/s3.module";
import { TenantsRepository } from "./tenants.repository";
import { UsersRepository } from "./users.repository";

@Module({
  imports: [CouchDBModule, S3Module],
  providers: [TenantsRepository, UsersRepository],
  exports: [TenantsRepository, UsersRepository],
})
export class IdentityModule {}
