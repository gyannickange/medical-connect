import { Module } from "@nestjs/common";
import { StockController } from "./stock.controller";
import { StockService } from "./stock.service";
import { StockPolicy } from "./stock.policy";
import { StockRepository } from "./stock.repository";
import { AuthModule } from "../auth/auth.module";
import { CouchDBModule } from "../../database/couchdb.module";
import { ProductsRepositoryModule } from "../products/products.repository.module";

@Module({
  imports: [AuthModule, CouchDBModule, ProductsRepositoryModule],
  controllers: [StockController],
  providers: [StockService, StockPolicy, StockRepository],
  exports: [StockService, StockRepository],
})
export class StockModule {}
