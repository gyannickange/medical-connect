import { Module } from "@nestjs/common";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { SalesPolicy } from "./sales.policy";
import { SalesRepositoryModule } from "./sales.repository.module";
import { AuthModule } from "../auth/auth.module";
import { StockModule } from "../stock/stock.module";
import { ProductsRepositoryModule } from "../products/products.repository.module";
import { CustomersRepositoryModule } from "../customers/customers.repository.module";

@Module({
  imports: [
    AuthModule,
    StockModule,
    ProductsRepositoryModule,
    SalesRepositoryModule,
    CustomersRepositoryModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, SalesPolicy],
  exports: [SalesService, SalesRepositoryModule],
})
export class SalesModule {}
