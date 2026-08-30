import { Module } from "@nestjs/common";
import { ExamTypesRepository } from "./exam-types.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [ExamTypesRepository],
  exports: [ExamTypesRepository],
})
export class ExamTypesRepositoryModule {}
