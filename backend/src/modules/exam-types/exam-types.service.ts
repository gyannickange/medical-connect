import { Injectable } from "@nestjs/common";
import type { InsertExamType } from "@shared/schema";
import { ExamTypesRepository } from "./exam-types.repository";

@Injectable()
export class ExamTypesService {
  constructor(private readonly examTypesRepository: ExamTypesRepository) {}

  findByTenant(tenantId: string) {
    return this.examTypesRepository.findByTenant(tenantId);
  }

  create(data: InsertExamType) {
    return this.examTypesRepository.create(data);
  }

  update(id: string, tenantId: string, data: Partial<InsertExamType>) {
    return this.examTypesRepository.update(id, tenantId, data);
  }

  delete(id: string, tenantId: string) {
    return this.examTypesRepository.delete(id, tenantId);
  }
}
