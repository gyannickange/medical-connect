import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import type { InsertSetting, Setting } from "@shared/schema";
import { CouchDBService } from "../../database/couchdb.service";
import { tenantDatabaseName } from "../../database/couchdb-naming";

type SettingDocument = {
  _id: string;
  _rev?: string;
  id: string;
  type: "setting";
  tenantId: string;
  key: string;
  value: string;
  category: string;
  dataType: string;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class SettingsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async findByTenant(tenantId: string): Promise<Setting[]> {
    const dbName = tenantDatabaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "settings_by_category_key", [
      "type",
      "tenantId",
      "category",
      "key",
    ]);
    const result = await db.find({
      selector: { type: "setting", tenantId },
      sort: [{ category: "asc" }, { key: "asc" }],
      limit: 1000,
    });
    return (result.docs as unknown as SettingDocument[]).map((doc) =>
      this.hydrate(doc)
    );
  }

  async findByKey(key: string, tenantId: string): Promise<Setting | null> {
    const doc = await this.getByKey(key, tenantId);
    return doc ? this.hydrate(doc) : null;
  }

  async create(data: InsertSetting, tenantId: string): Promise<Setting> {
    const now = new Date().toISOString();
    const input = data as InsertSetting & { id?: string };
    const id = input.id ?? randomUUID();
    const existingWithId = await this.getByPublicId(id, tenantId);
    if (existingWithId) {
      throw new ConflictException("Setting id already exists");
    }
    const doc: SettingDocument = {
      _id: this.documentId(input.key),
      id,
      type: "setting",
      tenantId,
      key: input.key,
      value: input.value,
      category: input.category ?? "general",
      dataType: input.dataType ?? "string",
      isEncrypted: input.isEncrypted === true,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await (await this.database(tenantId)).insert(doc as any);
      return this.hydrate(doc);
    } catch (error) {
      if (this.statusCode(error) === 409) {
        throw new ConflictException("Setting key already exists");
      }
      throw this.unavailable(error);
    }
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertSetting>
  ): Promise<Setting> {
    return this.patchWithRetry(
      tenantId,
      () => this.getByPublicId(id, tenantId),
      data
    );
  }

  async updateByKey(
    key: string,
    tenantId: string,
    data: Partial<InsertSetting>
  ): Promise<Setting> {
    return this.patchWithRetry(tenantId, () => this.getByKey(key, tenantId), data);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const db = await this.database(tenantId);
    const doc = await this.getByPublicId(id, tenantId);
    if (!doc) throw new NotFoundException("Setting not found");
    try {
      await db.destroy(doc._id, doc._rev as string);
    } catch (error) {
      if (this.statusCode(error) === 404) {
        throw new NotFoundException("Setting not found");
      }
      if (this.statusCode(error) === 409) {
        throw new ConflictException("Setting was modified concurrently");
      }
      throw this.unavailable(error);
    }
  }

  private async patchWithRetry(
    tenantId: string,
    load: () => Promise<SettingDocument | null>,
    data: Partial<InsertSetting>
  ): Promise<Setting> {
    const db = await this.database(tenantId);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await load();
      if (!current) throw new NotFoundException("Setting not found");
      const updated: SettingDocument = {
        ...current,
        ...data,
        id: current.id,
        type: "setting",
        tenantId,
        key: current.key,
        isEncrypted:
          data.isEncrypted === undefined
            ? current.isEncrypted
            : data.isEncrypted === true,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      try {
        await db.insert(updated as any);
        return this.hydrate(updated);
      } catch (error) {
        if (this.statusCode(error) === 409 && attempt < 2) continue;
        if (this.statusCode(error) === 409) {
          throw new ConflictException("Setting was modified concurrently");
        }
        throw this.unavailable(error);
      }
    }
    throw new ConflictException("Setting was modified concurrently");
  }

  private async getByKey(
    key: string,
    tenantId: string
  ): Promise<SettingDocument | null> {
    try {
      return (await (await this.database(tenantId)).get(
        this.documentId(key)
      )) as unknown as SettingDocument;
    } catch (error) {
      if (this.statusCode(error) === 404) return null;
      throw this.unavailable(error);
    }
  }

  private async getByPublicId(
    id: string,
    tenantId: string
  ): Promise<SettingDocument | null> {
    const dbName = tenantDatabaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "settings_by_public_id", [
      "type",
      "tenantId",
      "id",
    ]);
    const result = await db.find({
      selector: { type: "setting", tenantId, id },
      limit: 1,
    });
    return (result.docs[0] as unknown as SettingDocument | undefined) ?? null;
  }

  private async database(tenantId: string): Promise<DocumentScope<unknown>> {
    try {
      return await this.couchDBService.getDatabase(tenantDatabaseName(tenantId));
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private documentId(key: string): string {
    const digest = createHash("sha256").update(key).digest("hex");
    return `setting:${digest}`;
  }

  private hydrate(doc: SettingDocument): Setting {
    return {
      id: doc.id,
      tenantId: doc.tenantId,
      key: doc.key,
      value: doc.value,
      category: doc.category,
      dataType: doc.dataType,
      isEncrypted: doc.isEncrypted,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    };
  }

  private statusCode(error: unknown): number | undefined {
    return typeof error === "object" && error !== null && "statusCode" in error
      ? Number(error.statusCode)
      : undefined;
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", {
      cause: error,
    });
  }
}
