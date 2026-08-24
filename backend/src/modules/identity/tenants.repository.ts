import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomInt, randomUUID, createHash } from "crypto";
import type { InsertTenant, Tenant } from "@shared/schema";
import { CouchDBService } from "../../database/couchdb.service";
import { identityDatabaseName } from "../../database/couchdb-naming";

const PROVISIONING_SECRET_TTL_MS = 48 * 60 * 60 * 1000;
const PROVISIONING_SECRET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

interface TenantDocument {
  _id: string;
  _rev?: string;
  type: "tenant";
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  settings: unknown;
  isActive: boolean;
  createdAt: string;
  initialized: boolean;
  provisioningSecretHash: string | null;
  provisioningSecretExpiresAt: string | null;
  provisioningSecretUsedAt: string | null;
}

@Injectable()
export class TenantsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async findById(id: string): Promise<Tenant | undefined> {
    const doc = await this.findDocumentById(id);
    return doc ? this.hydrate(doc) : undefined;
  }

  async findAll(): Promise<Tenant[]> {
    const result = await (await this.db()).find({ selector: { type: "tenant" }, limit: 1000 });
    return (result.docs as unknown as TenantDocument[]).map((doc) => this.hydrate(doc));
  }

  async create(
    data: InsertTenant
  ): Promise<{ tenant: Tenant; provisioningSecret: string }> {
    const input = data as InsertTenant & { id?: string };
    const id = input.id ?? randomUUID();
    const provisioningSecret = this.generateProvisioningSecret();
    const doc: TenantDocument = {
      _id: `tenant:${id}`,
      id,
      type: "tenant",
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      settings: input.settings ?? null,
      isActive: input.isActive !== false,
      createdAt: new Date().toISOString(),
      initialized: false,
      provisioningSecretHash: this.hashSecret(provisioningSecret),
      provisioningSecretExpiresAt: new Date(
        Date.now() + PROVISIONING_SECRET_TTL_MS
      ).toISOString(),
      provisioningSecretUsedAt: null,
    };
    await (await this.db()).insert(doc as any);
    return { tenant: this.hydrate(doc), provisioningSecret };
  }

  async update(id: string, data: Partial<InsertTenant>): Promise<Tenant> {
    const db = await this.db();
    const current = await this.getDocumentOrThrow(id);
    const updated: TenantDocument = { ...current, ...data, id, type: "tenant" };
    await db.insert(updated as any);
    return this.hydrate(updated);
  }

  async isInitialized(id: string): Promise<boolean> {
    const doc = await this.findDocumentById(id);
    return doc?.initialized === true;
  }

  async markInitialized(id: string): Promise<void> {
    const db = await this.db();
    const current = await this.getDocumentOrThrow(id);
    await db.insert({ ...current, initialized: true } as any);
  }

  async verifyAndConsumeProvisioningSecret(
    id: string,
    secret: string
  ): Promise<boolean> {
    const doc = await this.findDocumentById(id);
    if (!doc || !doc.provisioningSecretHash || doc.provisioningSecretUsedAt) {
      return false;
    }
    if (
      doc.provisioningSecretExpiresAt &&
      new Date(doc.provisioningSecretExpiresAt).getTime() < Date.now()
    ) {
      return false;
    }
    if (doc.provisioningSecretHash !== this.hashSecret(secret)) {
      return false;
    }
    const db = await this.db();
    await db.insert({
      ...doc,
      provisioningSecretUsedAt: new Date().toISOString(),
    } as any);
    return true;
  }

  private generateProvisioningSecret(): string {
    const groups: string[] = [];
    for (let g = 0; g < 3; g += 1) {
      let group = "";
      for (let i = 0; i < 4; i += 1) {
        group += PROVISIONING_SECRET_ALPHABET[randomInt(PROVISIONING_SECRET_ALPHABET.length)];
      }
      groups.push(group);
    }
    return groups.join("-");
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  private async findDocumentById(id: string): Promise<TenantDocument | undefined> {
    try {
      return (await (await this.db()).get(`tenant:${id}`)) as unknown as TenantDocument;
    } catch (error) {
      if ((error as any)?.statusCode === 404) return undefined;
      throw new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
    }
  }

  private async getDocumentOrThrow(id: string): Promise<TenantDocument> {
    const doc = await this.findDocumentById(id);
    if (!doc) throw new NotFoundException("Tenant not found");
    return doc;
  }

  private db() {
    return this.couchDBService.getDatabase(identityDatabaseName());
  }

  private hydrate(doc: TenantDocument): Tenant {
    return {
      id: doc.id,
      name: doc.name,
      address: doc.address,
      phone: doc.phone,
      email: doc.email,
      settings: doc.settings,
      isActive: doc.isActive,
      createdAt: new Date(doc.createdAt),
    };
  }
}
