import { Module } from "@nestjs/common";
import { CustomersRepository } from "./customers.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [CustomersRepository],
  exports: [CustomersRepository],
})
export class CustomersRepositoryModule {}
