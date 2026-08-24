import { Module } from "@nestjs/common";
import { CategoriesController } from "./categories.controller";
import { CategoriesService } from "./categories.service";
import { CategoriesPolicy } from "./categories.policy";
import { CategoriesRepository } from "./categories.repository";
import { AuthModule } from "../auth/auth.module";
import { CouchDBModule } from "../../database/couchdb.module";
import { ProductsRepositoryModule } from "../products/products.repository.module";

@Module({
  imports: [AuthModule, CouchDBModule, ProductsRepositoryModule],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoriesPolicy, CategoriesRepository],
  exports: [CategoriesService],
})
export class CategoriesModule {}
