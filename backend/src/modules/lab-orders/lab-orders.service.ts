import { Injectable } from "@nestjs/common";
import type { InsertLabOrder } from "@shared/schema";
import { LabOrdersRepository, type LabOrderFilters, type UpdateLabOrderData } from "./lab-orders.repository";
import { ExamTypesRepository } from "../exam-types/exam-types.repository";

@Injectable()
export class LabOrdersService {
  constructor(
    private readonly labOrdersRepository: LabOrdersRepository,
    private readonly examTypesRepository: ExamTypesRepository
  ) {}

  findByTenant(tenantId: string, filters?: LabOrderFilters) {
    return this.labOrdersRepository.findByTenant(tenantId, filters);
  }

  findById(id: string, tenantId: string) {
    return this.labOrdersRepository.findById(id, tenantId);
  }

  async create(data: InsertLabOrder) {
    const examTypes = await this.examTypesRepository.findByTenant(data.tenantId);
    const parametersByName = new Map(examTypes.map((examType) => [examType.name, examType.parameters]));
    const examLines = data.examLines.map((line) => ({
      examName: line.examName,
      parameters: parametersByName.get(line.examName) ?? [],
    }));
    return this.labOrdersRepository.create({ ...data, examLines });
  }

  update(id: string, tenantId: string, data: UpdateLabOrderData, actorUserId: string) {
    return this.labOrdersRepository.update(id, tenantId, data, actorUserId);
  }

  recordFollowUp(id: string, tenantId: string, data: { followUpAction: string; followUpNote?: string }) {
    return this.labOrdersRepository.recordFollowUp(id, tenantId, data as any);
  }

  addAttachment(id: string, tenantId: string, fileName: string, contentType: string, fileBase64: string) {
    return this.labOrdersRepository.addAttachment(id, tenantId, fileName, contentType, fileBase64);
  }

  getAttachmentUrl(id: string, tenantId: string, attachmentId: string) {
    return this.labOrdersRepository.getAttachmentUrl(id, tenantId, attachmentId);
  }
}
