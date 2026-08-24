import { Injectable } from "@nestjs/common";
import { SyncService } from "../sync/sync.service";

@Injectable()
export class PeersService {
  constructor(private readonly syncService: SyncService) {}

  async getOnlinePeers(tenantId: string) {
    const syncStatuses = await this.syncService.getAllStatuses(tenantId);

    return syncStatuses
      .filter((status) => status.status === "online")
      .map((status) => ({
        deviceId: status.deviceId,
        tenantId: status.tenantId,
        lastSync: status.lastSync,
        pendingChanges: status.pendingChanges,
      }));
  }
}
