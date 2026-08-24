import { Injectable } from "@nestjs/common";
import type { Setting, InsertSetting } from "@shared/schema";
import { SettingsRepository } from "./settings.repository";

@Injectable()
export class SettingsService {
  constructor(private readonly settingsRepository: SettingsRepository) {}

  async findByTenant(tenantId: string): Promise<Setting[]> {
    return this.settingsRepository.findByTenant(tenantId);
  }

  async findByKey(key: string, tenantId: string): Promise<Setting | null> {
    return this.settingsRepository.findByKey(key, tenantId);
  }

  async getReferenceCurrency(tenantId: string): Promise<string> {
    const setting = await this.settingsRepository.findByKey("currency.reference", tenantId);
    return setting?.value ?? "XOF";
  }

  async create(data: InsertSetting, tenantId: string): Promise<Setting> {
    return this.settingsRepository.create(data, tenantId);
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertSetting>
  ): Promise<Setting> {
    return this.settingsRepository.update(id, tenantId, data);
  }

  async updateByKey(
    key: string,
    tenantId: string,
    data: Partial<InsertSetting>
  ): Promise<Setting> {
    return this.settingsRepository.updateByKey(key, tenantId, data);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    return this.settingsRepository.delete(id, tenantId);
  }
}
