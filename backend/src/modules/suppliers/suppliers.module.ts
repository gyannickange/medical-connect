import { Module } from "@nestjs/common";
import { SuppliersController } from "./suppliers.controller";
import { SuppliersService } from "./suppliers.service";
import { SuppliersPolicy } from "./suppliers.policy";
import { AuthModule } from "../auth/auth.module";
import { CouchDBModule } from "../../database/couchdb.module";
import { SuppliersRepository } from "./suppliers.repository";
import { ProductsRepositoryModule } from "../products/products.repository.module";

@Module({
  imports: [AuthModule, CouchDBModule, ProductsRepositoryModule],
  controllers: [SuppliersController],
  providers: [SuppliersService, SuppliersPolicy, SuppliersRepository],
  exports: [SuppliersService],
})
export class SuppliersModule {}
