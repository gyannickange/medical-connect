import { Injectable } from "@nestjs/common";
import type { InsertLabOrder } from "@shared/schema";
import { LabOrdersRepository, type LabOrderFilters, type UpdateLabOrderData } from "./lab-orders.repository";

@Injectable()
export class LabOrdersService {
  constructor(private readonly labOrdersRepository: LabOrdersRepository) {}

  findByTenant(tenantId: string, filters?: LabOrderFilters) {
    return this.labOrdersRepository.findByTenant(tenantId, filters);
  }

  findById(id: string, tenantId: string) {
    return this.labOrdersRepository.findById(id, tenantId);
  }

  create(data: InsertLabOrder) {
    return this.labOrdersRepository.create(data);
  }

  update(id: string, tenantId: string, data: UpdateLabOrderData, actorUserId: string) {
    return this.labOrdersRepository.update(id, tenantId, data, actorUserId);
  }

  recordFollowUp(id: string, tenantId: string, data: { followUpAction: string; followUpNote?: string }) {
    return this.labOrdersRepository.recordFollowUp(id, tenantId, data as any);
  }
}
