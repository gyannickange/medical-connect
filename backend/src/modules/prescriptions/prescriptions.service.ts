import { Injectable } from "@nestjs/common";
import type { InsertPrescription } from "@shared/schema";
import { PrescriptionsRepository, type PrescriptionFilters, type UpdatePrescriptionData } from "./prescriptions.repository";

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prescriptionsRepository: PrescriptionsRepository) {}

  findByTenant(tenantId: string, filters?: PrescriptionFilters) {
    return this.prescriptionsRepository.findByTenant(tenantId, filters);
  }

  findById(id: string, tenantId: string) {
    return this.prescriptionsRepository.findById(id, tenantId);
  }

  create(data: InsertPrescription) {
    return this.prescriptionsRepository.create(data);
  }

  update(id: string, tenantId: string, data: UpdatePrescriptionData, actorUserId: string) {
    return this.prescriptionsRepository.update(id, tenantId, data, actorUserId);
  }
}
