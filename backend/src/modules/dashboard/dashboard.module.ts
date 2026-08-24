import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";
import { DashboardPolicy } from "./dashboard.policy";
import { ProductsModule } from "../products/products.module";
import { StockModule } from "../stock/stock.module";
import { SalesModule } from "../sales/sales.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [ProductsModule, StockModule, SalesModule, AuthModule],
  controllers: [DashboardController],
  providers: [DashboardService, DashboardPolicy],
})
export class DashboardModule {}
