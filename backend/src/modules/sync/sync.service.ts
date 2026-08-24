import { Injectable, NotFoundException } from "@nestjs/common";
import type { SyncStatus, InsertSyncStatus } from "@shared/schema";
import { SyncRepository } from "./sync.repository";

@Injectable()
export class SyncService {
  constructor(private readonly syncRepository: SyncRepository) {}

  async updateStatus(data: InsertSyncStatus): Promise<SyncStatus> {
    return this.syncRepository.upsert({
      ...data,
      lastSync: new Date(),
    });
  }

  async getAllStatuses(tenantId: string): Promise<SyncStatus[]> {
    return this.syncRepository.findAll(tenantId);
  }

  async getStatus(tenantId: string, deviceId: string): Promise<SyncStatus> {
    const status = await this.syncRepository.findOne(tenantId, deviceId);
    if (!status) {
      throw new NotFoundException("Sync status not found");
    }
    return status;
  }
}
