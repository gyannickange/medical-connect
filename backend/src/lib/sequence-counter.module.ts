import { Module } from "@nestjs/common";
import { SequenceCounterService } from "./sequence-counter.service";
import { CouchDBModule } from "../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [SequenceCounterService],
  exports: [SequenceCounterService],
})
export class SequenceCounterModule {}
