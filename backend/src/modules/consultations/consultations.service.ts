import { Injectable } from "@nestjs/common";
import type { InsertConsultation } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import { ConsultationsRepository, type ConsultationFilters } from "./consultations.repository";

@Injectable()
export class ConsultationsService {
  constructor(private readonly consultationsRepository: ConsultationsRepository) {}

  findByTenant(tenantId: string, filters?: ConsultationFilters, options?: PaginationOptions) {
    return this.consultationsRepository.findByTenant(tenantId, filters, options);
  }

  findById(id: string, tenantId: string) {
    return this.consultationsRepository.findById(id, tenantId);
  }

  create(data: InsertConsultation) {
    return this.consultationsRepository.create(data);
  }

  update(id: string, tenantId: string, data: Record<string, unknown>) {
    return this.consultationsRepository.update(id, tenantId, data as any);
  }
}
