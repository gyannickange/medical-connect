import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsPolicy } from "./notifications.policy";
import { AuthModule } from "../auth/auth.module";
import { NotificationsRepositoryModule } from "./notifications.repository.module";

@Module({
  imports: [AuthModule, NotificationsRepositoryModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsPolicy],
  exports: [NotificationsService],
})
export class NotificationsModule {}
