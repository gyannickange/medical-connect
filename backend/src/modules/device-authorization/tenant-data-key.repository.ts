import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHash, webcrypto } from "crypto";
import { CouchDBService } from "../../database/couchdb.service";
import { identityDatabaseName } from "../../database/couchdb-naming";

const { subtle } = webcrypto;

interface TenantDataKeyDocument {
  _id: string;
  _rev?: string;
  type: "tenant_data_key";
  tenantId: string;
  wrappedKey: string;
  iv: string;
  createdAt: string;
}

@Injectable()
export class TenantDataKeyRepository {
  private readonly logger = new Logger(TenantDataKeyRepository.name);
  private wrapKeyPromise: Promise<CryptoKey> | null = null;

  constructor(private readonly couchDBService: CouchDBService) {}

  async getOrCreate(tenantId: string): Promise<Buffer> {
    const db = await this.database();
    const id = this.documentId(tenantId);

    try {
      const existing = (await db.get(id)) as unknown as TenantDataKeyDocument;
      return this.unwrap(existing);
    } catch (error) {
      if (this.statusCode(error) !== 404) throw this.unavailable(error);
    }

    const raw = new Uint8Array(32);
    webcrypto.getRandomValues(raw);
    const { wrappedKey, iv } = await this.wrap(Buffer.from(raw));

    const doc: TenantDataKeyDocument = {
      _id: id,
      type: "tenant_data_key",
      tenantId,
      wrappedKey,
      iv,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.insert(doc as any);
      return Buffer.from(raw);
    } catch (error) {
      if (this.statusCode(error) !== 409) throw this.unavailable(error);
      // Another concurrent request already created the tenant's key between
      // this request's get() and insert() - re-read what it wrote instead
      // of erroring or silently minting a second, divergent key.
      const winner = (await db.get(id)) as unknown as TenantDataKeyDocument;
      return this.unwrap(winner);
    }
  }

  private async wrap(raw: Buffer): Promise<{ wrappedKey: string; iv: string }> {
    const key = await this.wrapKey();
    const iv = new Uint8Array(12);
    webcrypto.getRandomValues(iv);
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, raw);
    return {
      wrappedKey: Buffer.from(ciphertext).toString("base64"),
      iv: Buffer.from(iv).toString("base64"),
    };
  }

  private async unwrap(doc: TenantDataKeyDocument): Promise<Buffer> {
    const key = await this.wrapKey();
    const iv = Buffer.from(doc.iv, "base64");
    const ciphertext = Buffer.from(doc.wrappedKey, "base64");
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return Buffer.from(plaintext);
  }

  private wrapKey(): Promise<CryptoKey> {
    if (!this.wrapKeyPromise) {
      const secret = process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET;
      let keyMaterial: Buffer;
      if (secret) {
        keyMaterial = createHash("sha256").update(secret).digest();
      } else {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "TENANT_DATA_KEY_ENCRYPTION_SECRET is required in production"
          );
        }
        keyMaterial = createHash("sha256")
          .update(Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))))
          .digest();
        this.logger.warn(
          "Using an ephemeral TENANT_DATA_KEY_ENCRYPTION_SECRET; configure it for persistent tenant data keys"
        );
      }
      this.wrapKeyPromise = subtle.importKey(
        "raw",
        keyMaterial,
        "AES-GCM",
        false,
        ["encrypt", "decrypt"]
      );
    }
    return this.wrapKeyPromise;
  }

  private documentId(tenantId: string): string {
    return `tenant-data-key:${tenantId}`;
  }

  private async database() {
    try {
      return await this.couchDBService.getDatabase(identityDatabaseName());
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private statusCode(error: unknown): number | undefined {
    return typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as any).statusCode)
      : undefined;
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", {
      cause: error,
    });
  }
}
