import { Module, NestModule, MiddlewareConsumer } from "@nestjs/common";
import { PouchDBController } from "./pouchdb.controller";
import { PouchDBService } from "./pouchdb.service";
import { TenantValidationMiddleware } from "./middleware/tenant-validation.middleware";
import { PouchDBAuthMiddleware } from "./middleware/auth.middleware";
import { WebSocketModule } from "../../websocket/websocket.module";
import { IdentityModule } from "../identity/identity.module";

@Module({
  imports: [WebSocketModule, IdentityModule],
  controllers: [PouchDBController],
  providers: [PouchDBService],
  exports: [PouchDBService],
})
export class PouchDBModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply authentication middleware first, then tenant validation
    consumer
      .apply(PouchDBAuthMiddleware, TenantValidationMiddleware)
      .forRoutes("api/pouchdb/*");
  }
}
