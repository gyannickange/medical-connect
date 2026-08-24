import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ProductsPolicy } from "./products.policy";
import { ProductsLockService } from "./products-lock.service";
import { ProductPurchasesService } from "./product-purchases.service";
import { AuthModule } from "../auth/auth.module";
import { StockModule } from "../stock/stock.module";
import { SettingsModule } from "../settings/settings.module";
import { ProductsRepositoryModule } from "./products.repository.module";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [AuthModule, StockModule, SettingsModule, ProductsRepositoryModule, CouchDBModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsPolicy, ProductsLockService, ProductPurchasesService],
  exports: [ProductsService],
})
export class ProductsModule {}
