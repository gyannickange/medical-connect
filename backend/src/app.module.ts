import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR, APP_FILTER } from "@nestjs/core";
import { AuthModule } from "./modules/auth/auth.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { PatientsModule } from "./modules/patients/patients.module";
import { ConsultationsModule } from "./modules/consultations/consultations.module";
import { LabOrdersModule } from "./modules/lab-orders/lab-orders.module";
import { PrescriptionsModule } from "./modules/prescriptions/prescriptions.module";
import { QueueModule } from "./modules/queue/queue.module";
import { StaffModule } from "./modules/staff/staff.module";
import { RoomsModule } from "./modules/rooms/rooms.module";
import { SettingsModule } from "./modules/settings/settings.module";
import { SyncModule } from "./modules/sync/sync.module";
import { PeersModule } from "./modules/peers/peers.module";
import { PouchDBModule } from "./modules/pouchdb/pouchdb.module";
import { WebSocketModule } from "./websocket/websocket.module";
import { ViteModule } from "./vite/vite.module";
import { AuditModule } from "./modules/audit/audit.module";
import { LanIdentityModule } from "./modules/lan-identity/lan-identity.module";
import { DeviceAuthorizationModule } from "./modules/device-authorization/device-authorization.module";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";
import { AllExceptionsFilter } from "./common/filters/http-exception.filter";
import { AuditInterceptor } from "./common/interceptors/audit.interceptor";

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    PatientsModule,
    ConsultationsModule,
    LabOrdersModule,
    PrescriptionsModule,
    QueueModule,
    StaffModule,
    RoomsModule,
    SettingsModule,
    SyncModule,
    PeersModule,
    PouchDBModule,
    WebSocketModule,
    ViteModule,
    AuditModule,
    LanIdentityModule,
    DeviceAuthorizationModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
