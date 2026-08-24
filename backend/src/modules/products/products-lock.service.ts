import { ConflictException, Injectable } from "@nestjs/common";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { tenantDatabaseName } from "../../database/couchdb-naming";

const LOCK_DURATION_MS = 10 * 60 * 1000;

interface LockDocument {
  _id: string;
  _rev?: string;
  type: "lock";
  productId: string;
  deviceId: string;
  deviceName: string;
  acquiredAt: string;
  expiresAt: string;
}

@Injectable()
export class ProductsLockService {
  constructor(private readonly couchDBService: CouchDBService) {}

  async acquireOrRenew(
    productId: string,
    tenantId: string,
    deviceId: string,
    deviceName: string
  ): Promise<void> {
    const db = await this.couchDBService.getDatabase(
      this.databaseName(tenantId)
    );
    const existing = await this.findExisting(db, this.lockId(productId));
    const now = new Date();

    if (
      existing &&
      existing.deviceId !== deviceId &&
      !this.isExpired(existing, now)
    ) {
      throw new ConflictException(
        `Product is locked by ${existing.deviceName}`
      );
    }

    const ownsCurrentLock =
      existing && existing.deviceId === deviceId && !this.isExpired(existing, now);
    const acquiredAt = ownsCurrentLock ? existing!.acquiredAt : now.toISOString();

    try {
      await db.insert({
        _id: this.lockId(productId),
        ...(existing ? { _rev: existing._rev } : {}),
        type: "lock",
        productId,
        deviceId,
        deviceName,
        acquiredAt,
        expiresAt: new Date(now.getTime() + LOCK_DURATION_MS).toISOString(),
      } as any);
    } catch (error: any) {
      if (error?.statusCode === 409) {
        throw new ConflictException("Product is locked by another device");
      }
      throw error;
    }
  }

  async release(
    productId: string,
    tenantId: string,
    deviceId: string
  ): Promise<void> {
    const db = await this.couchDBService.getDatabase(
      this.databaseName(tenantId)
    );
    const existing = await this.findExisting(db, this.lockId(productId));
    if (!existing) return;
    if (existing.deviceId !== deviceId) {
      throw new ConflictException(
        "Only the device holding the lock can release it"
      );
    }
    await db.destroy(this.lockId(productId), existing._rev as string);
  }

  /**
   * Throws if a *different* device currently holds a valid (non-expired)
   * lock on this product. A missing/expired lock, or a lock already held
   * by `deviceId`, is not an error.
   */
  async assertHeldByDevice(
    productId: string,
    tenantId: string,
    deviceId?: string
  ): Promise<void> {
    const db = await this.couchDBService.getDatabase(
      this.databaseName(tenantId)
    );
    const existing = await this.findExisting(db, this.lockId(productId));
    if (!existing) return;
    if (this.isExpired(existing, new Date())) return;
    if (existing.deviceId === deviceId) return;
    throw new ConflictException(
      `Product is locked by ${existing.deviceName}`
    );
  }

  private isExpired(lock: LockDocument, now: Date): boolean {
    return new Date(lock.expiresAt).getTime() <= now.getTime();
  }

  private async findExisting(
    db: DocumentScope<unknown>,
    id: string
  ): Promise<LockDocument | null> {
    try {
      const doc = await db.get(id);
      return doc as unknown as LockDocument;
    } catch (error: any) {
      if (error?.statusCode === 404) return null;
      throw error;
    }
  }

  private lockId(productId: string): string {
    return `lock_${productId}`;
  }

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }
}
