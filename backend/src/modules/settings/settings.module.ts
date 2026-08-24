import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { SettingsPolicy } from "./settings.policy";
import { SettingsRepository } from "./settings.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [CouchDBModule, AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService, SettingsPolicy, SettingsRepository],
  exports: [SettingsService],
})
export class SettingsModule {}
