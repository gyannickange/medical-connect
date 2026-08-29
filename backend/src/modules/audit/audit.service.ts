import { Injectable } from "@nestjs/common";
import type { InsertAuditLog, AuditLog } from "../../shared/schema";
import { AuditRepository } from "./audit.repository";

@Injectable()
export class AuditService {
  constructor(private readonly auditRepository: AuditRepository) {}

  async logAction(auditLogData: InsertAuditLog): Promise<AuditLog> {
    return this.auditRepository.create(auditLogData);
  }

  async getAuditLogs(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      page?: number;
      startDate?: Date;
      endDate?: Date;
      action?: string;
      status?: string;
      entityType?: string;
      userId?: string;
    }
  ): Promise<Array<AuditLog & { patientName: string | null }>> {
    const logs = await this.auditRepository.find(tenantId, options);
    return Promise.all(
      logs.map(async (log) => ({
        ...log,
        patientName: await this.auditRepository.resolvePatientName(tenantId, log.entityType, log.entityId, log.changes),
      }))
    );
  }

  async getAuditLogsByEntity(
    tenantId: string,
    entityType: string,
    entityId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLog[]> {
    return this.auditRepository.find(tenantId, { ...options, entityType, entityId });
  }

  async getAuditLogsByUser(
    tenantId: string,
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<AuditLog[]> {
    return this.auditRepository.find(tenantId, { ...options, userId });
  }
}
