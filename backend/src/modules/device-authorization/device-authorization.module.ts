import { Module } from "@nestjs/common";
import { DeviceAuthorizationController } from "./device-authorization.controller";
import { DeviceAuthorizationService } from "./device-authorization.service";
import { DeviceAuthorizationPolicy } from "./device-authorization.policy";
import { DeviceAuthorizationRepository } from "./device-authorization.repository";
import { TenantDataKeyRepository } from "./tenant-data-key.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { WebSocketModule } from "../../websocket/websocket.module";
import { LanIdentityModule } from "../lan-identity/lan-identity.module";

@Module({
  imports: [CouchDBModule, AuthModule, IdentityModule, WebSocketModule, LanIdentityModule],
  controllers: [DeviceAuthorizationController],
  providers: [
    DeviceAuthorizationService,
    DeviceAuthorizationPolicy,
    DeviceAuthorizationRepository,
    TenantDataKeyRepository,
  ],
  exports: [DeviceAuthorizationService],
})
export class DeviceAuthorizationModule {}
