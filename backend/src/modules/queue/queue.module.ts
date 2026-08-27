import { Module } from "@nestjs/common";
import { QueueController } from "./queue.controller";
import { QueueService } from "./queue.service";
import { QueuePolicy } from "./queue.policy";
import { QueueRepository } from "./queue.repository";
import { AuthModule } from "../auth/auth.module";
import { CouchDBModule } from "../../database/couchdb.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";

@Module({
  imports: [AuthModule, CouchDBModule, ConsultationsRepositoryModule],
  controllers: [QueueController],
  providers: [QueueService, QueuePolicy, QueueRepository],
  exports: [QueueService],
})
export class QueueModule {}
