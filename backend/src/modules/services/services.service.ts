import { Injectable } from "@nestjs/common";
import type { InsertService } from "@shared/schema";
import { ServicesRepository } from "./services.repository";

@Injectable()
export class ServicesService {
  constructor(private readonly servicesRepository: ServicesRepository) {}

  findByTenant(tenantId: string) {
    return this.servicesRepository.findByTenant(tenantId);
  }

  create(data: InsertService) {
    return this.servicesRepository.create(data);
  }

  update(id: string, tenantId: string, data: Partial<InsertService>) {
    return this.servicesRepository.update(id, tenantId, data);
  }
}
