import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { InsertUser, User } from "@shared/schema";
import { CouchDBService } from "../../database/couchdb.service";
import { identityDatabaseName } from "../../database/couchdb-naming";
import { normalizeUsername } from "../../lib/exceptions";
import type { PaginationOptions } from "../../lib/pagination";
import { S3Service } from "../../lib/s3.service";

@Injectable()
export class UsersRepository {
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly s3Service: S3Service
  ) {}

  async findById(id: string): Promise<User | undefined> {
    try {
      return this.hydrate(await (await this.db()).get(`user:${id}`));
    } catch (error) {
      if ((error as any)?.statusCode === 404) return undefined;
      throw error;
    }
  }

  async findByUsername(username: string): Promise<User | undefined> {
    try {
      const reservation: any = await (await this.db()).get(
        this.usernameId(normalizeUsername(username))
      );
      return this.findById(reservation.userId);
    } catch (error) {
      if ((error as any)?.statusCode === 404) return undefined;
      throw error;
    }
  }

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<User[]> {
    const limit = options?.limit ?? 100;
    const skip = options?.offset ?? (options?.page ?? 0) * limit;
    const result = await (await this.db()).find({
      selector: { type: "user", tenantId },
      limit,
      skip,
    });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  async create(data: InsertUser): Promise<User> {
    const input = data as InsertUser & { id?: string };
    const db = await this.db();
    const id = input.id ?? randomUUID();
    const username = normalizeUsername(input.username);
    const reservation = {
      _id: this.usernameId(username),
      type: "username_reservation",
      username,
      userId: id,
    };
    try {
      await db.insert(reservation as any);
    } catch (error) {
      if ((error as any)?.statusCode === 409) {
        throw new ConflictException("Username already exists");
      }
      throw error;
    }
    const doc = {
      _id: `user:${id}`,
      id,
      type: "user",
      username,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email ?? null,
      role: input.role ?? "cashier",
      tenantId: input.tenantId,
      isActive: input.isActive !== false,
      createdAt: new Date().toISOString(),
    };
    try {
      await db.insert(doc as any);
      return this.hydrate(doc);
    } catch (error) {
      const stored: any = await db.get(reservation._id).catch(() => null);
      if (stored) await db.destroy(stored._id, stored._rev).catch(() => undefined);
      throw error;
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertUser>): Promise<User> {
    const db = await this.db();
    const current: any = await db.get(`user:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Staff member not found");
      throw error;
    });
    if (current.tenantId !== tenantId) {
      throw new NotFoundException("Staff member not found");
    }
    const requestedUsername =
      data.username === undefined ? current.username : normalizeUsername(data.username);
    const usernameChanged = requestedUsername !== current.username;
    if (usernameChanged) {
      await db.insert({
        _id: this.usernameId(requestedUsername),
        type: "username_reservation",
        username: requestedUsername,
        userId: id,
      } as any).catch((error: any) => {
        if (error?.statusCode === 409) throw new ConflictException("Username already exists");
        throw error;
      });
    }
    const updated = { ...current, ...data, username: requestedUsername, id, type: "user" };
    try {
      await db.insert(updated);
    } catch (error) {
      if (usernameChanged) {
        const newReservation: any = await db
          .get(this.usernameId(requestedUsername))
          .catch(() => null);
        if (newReservation) {
          await db
            .destroy(newReservation._id, newReservation._rev)
            .catch(() => undefined);
        }
      }
      throw error;
    }
    if (usernameChanged) {
      const old: any = await db.get(this.usernameId(current.username)).catch(() => null);
      if (old) await db.destroy(old._id, old._rev);
    }
    return this.hydrate(updated);
  }

  async delete(id: string, tenantId: string): Promise<void> {
    const db = await this.db();
    const current: any = await db.get(`user:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Staff member not found");
      throw error;
    });
    if (current.tenantId !== tenantId) {
      throw new NotFoundException("Staff member not found");
    }
    await db.destroy(current._id, current._rev);
    const reservation: any = await db.get(this.usernameId(current.username)).catch(() => null);
    if (reservation) await db.destroy(reservation._id, reservation._rev);
  }

  async attachPhoto(id: string, tenantId: string, base64Body: string, contentType: string): Promise<User> {
    const db = await this.db();
    const current: any = await db.get(`user:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Staff member not found");
      throw error;
    });
    if (current.tenantId !== tenantId) {
      throw new NotFoundException("Staff member not found");
    }

    const extension = contentType === "image/png" ? "png" : "jpg";
    const key = `tenants/${tenantId}/staff/${id}/photo-${Date.now()}.${extension}`;
    await this.s3Service.uploadObject(key, Buffer.from(base64Body, "base64"), contentType);

    const updated = { ...current, photoS3Key: key };
    await db.insert(updated);
    return this.hydrate(updated);
  }

  async getPhotoUrl(id: string, tenantId: string): Promise<string> {
    const db = await this.db();
    const current: any = await db.get(`user:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Staff member not found");
      throw error;
    });
    if (current.tenantId !== tenantId) {
      throw new NotFoundException("Staff member not found");
    }
    if (!current.photoS3Key) {
      throw new NotFoundException("Staff member has no photo");
    }
    return this.s3Service.getPresignedUrl(current.photoS3Key, 300);
  }

  private usernameId(username: string): string {
    return `username:${encodeURIComponent(username)}`;
  }

  private db() {
    return this.couchDBService.getDatabase(identityDatabaseName());
  }

  private hydrate(doc: any): User {
    const { _id, _rev, type, ...value } = doc;
    return { ...value, createdAt: new Date(doc.createdAt) } as User;
  }
}
