import { Module } from "@nestjs/common";
import { ExamTypesController } from "./exam-types.controller";
import { ExamTypesService } from "./exam-types.service";
import { ExamTypesPolicy } from "./exam-types.policy";
import { AuthModule } from "../auth/auth.module";
import { ExamTypesRepositoryModule } from "./exam-types.repository.module";

@Module({
  imports: [AuthModule, ExamTypesRepositoryModule],
  controllers: [ExamTypesController],
  providers: [ExamTypesService, ExamTypesPolicy],
  exports: [ExamTypesService],
})
export class ExamTypesModule {}
