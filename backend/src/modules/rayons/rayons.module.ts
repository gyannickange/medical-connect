import { Module } from "@nestjs/common";
import { RayonsController } from "./rayons.controller";
import { RayonsService } from "./rayons.service";
import { RayonsPolicy } from "./rayons.policy";
import { RayonsRepository } from "./rayons.repository";
import { AuthModule } from "../auth/auth.module";
import { CouchDBModule } from "../../database/couchdb.module";
import { ProductsRepositoryModule } from "../products/products.repository.module";

@Module({
  imports: [AuthModule, CouchDBModule, ProductsRepositoryModule],
  controllers: [RayonsController],
  providers: [RayonsService, RayonsPolicy, RayonsRepository],
  exports: [RayonsService],
})
export class RayonsModule {}
