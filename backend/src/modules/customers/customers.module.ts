import { Module } from "@nestjs/common";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { CustomersPolicy } from "./customers.policy";
import { CustomersRepositoryModule } from "./customers.repository.module";
import { AuthModule } from "../auth/auth.module";
import { SalesRepositoryModule } from "../sales/sales.repository.module";

@Module({
  imports: [AuthModule, CustomersRepositoryModule, SalesRepositoryModule],
  controllers: [CustomersController],
  providers: [CustomersService, CustomersPolicy],
  exports: [CustomersService, CustomersRepositoryModule],
})
export class CustomersModule {}
