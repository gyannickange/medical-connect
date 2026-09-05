import { Module } from "@nestjs/common";
import { NotificationsRepository } from "./notifications.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [NotificationsRepository],
  exports: [NotificationsRepository],
})
export class NotificationsRepositoryModule {}
