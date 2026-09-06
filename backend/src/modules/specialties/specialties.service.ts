import { Injectable } from "@nestjs/common";
import type { InsertSpecialty } from "@shared/schema";
import { SpecialtiesRepository } from "./specialties.repository";

@Injectable()
export class SpecialtiesService {
  constructor(private readonly specialtiesRepository: SpecialtiesRepository) {}

  findByTenant(tenantId: string) {
    return this.specialtiesRepository.findByTenant(tenantId);
  }

  create(data: InsertSpecialty) {
    return this.specialtiesRepository.create(data);
  }

  update(id: string, tenantId: string, data: Partial<InsertSpecialty>) {
    return this.specialtiesRepository.update(id, tenantId, data);
  }
}
