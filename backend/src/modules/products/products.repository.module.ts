import { Module } from "@nestjs/common";
import { ProductsRepository } from "./products.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [ProductsRepository],
  exports: [ProductsRepository],
})
export class ProductsRepositoryModule {}
