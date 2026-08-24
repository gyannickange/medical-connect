import { Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { AuditPolicy } from "./audit.policy";
import { AuthModule } from "../auth/auth.module";
import { CouchDBModule } from "../../database/couchdb.module";
import { AuditRepository } from "./audit.repository";

@Module({
  imports: [CouchDBModule, AuthModule],
  controllers: [AuditController],
  providers: [AuditService, AuditPolicy, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
