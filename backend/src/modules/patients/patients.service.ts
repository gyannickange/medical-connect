import { Injectable } from "@nestjs/common";
import type { InsertPatient } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import { PatientsRepository } from "./patients.repository";

@Injectable()
export class PatientsService {
  constructor(private readonly patientsRepository: PatientsRepository) {}

  findByTenant(tenantId: string, options?: PaginationOptions) {
    return this.patientsRepository.findByTenant(tenantId, options);
  }

  search(query: string, tenantId: string, options?: PaginationOptions) {
    return this.patientsRepository.search(query, tenantId, options);
  }

  findById(id: string, tenantId: string) {
    return this.patientsRepository.findById(id, tenantId);
  }

  create(data: InsertPatient) {
    return this.patientsRepository.create(data);
  }

  update(id: string, tenantId: string, data: Partial<InsertPatient>) {
    return this.patientsRepository.update(id, tenantId, data);
  }

  attachPhoto(id: string, tenantId: string, base64Body: string, contentType: string) {
    return this.patientsRepository.attachPhoto(id, tenantId, base64Body, contentType);
  }

  getPhotoUrl(id: string, tenantId: string) {
    return this.patientsRepository.getPhotoUrl(id, tenantId);
  }
}
