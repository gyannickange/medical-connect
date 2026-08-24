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
  ): Promise<AuditLog[]> {
    return this.auditRepository.find(tenantId, options);
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
