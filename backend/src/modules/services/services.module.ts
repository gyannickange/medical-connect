import { Module } from "@nestjs/common";
import { ServicesController } from "./services.controller";
import { ServicesService } from "./services.service";
import { ServicesPolicy } from "./services.policy";
import { AuthModule } from "../auth/auth.module";
import { ServicesRepositoryModule } from "./services.repository.module";

@Module({
  imports: [AuthModule, ServicesRepositoryModule],
  controllers: [ServicesController],
  providers: [ServicesService, ServicesPolicy],
  exports: [ServicesService],
})
export class ServicesModule {}
