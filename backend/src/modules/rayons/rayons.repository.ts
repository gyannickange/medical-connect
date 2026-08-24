import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { createHash, randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { InsertRayon, Rayon } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import {
  couchDocumentId,
  publicDocumentId,
  tenantDatabaseName,
} from "../../database/couchdb-naming";

@Injectable()
export class RayonsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertRayon): Promise<Rayon> {
    const input = data as InsertRayon & { id?: string };
    const id = input.id ?? randomUUID();
    const now = new Date();
    const trimmedName = input.name.trim();
    const db = await this.database(input.tenantId);

    const reservationId = this.nameReservationId(input.tenantId, trimmedName);
    let reservationRev: string | undefined;
    try {
      const result: any = await db.insert({
        _id: reservationId,
        type: "rayon_name_reservation",
        tenantId: input.tenantId,
        name: trimmedName,
        rayonId: id,
      } as any);
      reservationRev = result?.rev;
    } catch (error) {
      if (this.statusCode(error) === 409) {
        throw new ConflictException("Rayon name already exists");
      }
      throw this.unavailable(error);
    }

    const rayon: Rayon = {
      id,
      name: trimmedName,
      description: input.description ?? null,
      tenantId: input.tenantId,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({
        ...this.toDocument(rayon),
        _id: couchDocumentId("rayon", id),
        id,
      } as any);
      return rayon;
    } catch (error) {
      if (reservationRev) {
        await db.destroy(reservationId, reservationRev).catch(() => undefined);
      }
      throw this.unavailable(error);
    }
  }

  async update(
    id: string,
    tenantId: string,
    data: Partial<InsertRayon>
  ): Promise<Rayon> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "rayon" || current.tenantId !== tenantId) {
      throw new NotFoundException("Rayon not found");
    }

    const trimmedName = data.name !== undefined ? data.name.trim() : undefined;
    const normalizedCurrent = this.normalize(current.name);
    const normalizedNew = trimmedName !== undefined ? this.normalize(trimmedName) : normalizedCurrent;
    const nameChanged = trimmedName !== undefined && normalizedNew !== normalizedCurrent;

    let newReservation: { _id: string; _rev?: string } | null = null;
    if (nameChanged) {
      const reservationId = this.nameReservationId(tenantId, trimmedName as string);
      try {
        const result: any = await db.insert({
          _id: reservationId,
          type: "rayon_name_reservation",
          tenantId,
          name: trimmedName,
          rayonId: id,
        } as any);
        newReservation = { _id: reservationId, _rev: result?.rev };
      } catch (error) {
        if (this.statusCode(error) === 409) {
          throw new ConflictException("Rayon name already exists");
        }
        throw this.unavailable(error);
      }
    }

    const updated = {
      ...current,
      ...data,
      ...(trimmedName !== undefined ? { name: trimmedName } : {}),
      _id: current._id,
      _rev: current._rev,
      id,
      type: "rayon" as const,
      tenantId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      if (newReservation) {
        await db.destroy(newReservation._id, newReservation._rev as string).catch(() => undefined);
      }
      throw this.unavailable(error);
    }

    if (nameChanged) {
      await this.removeNameReservation(db, tenantId, current.name, id);
    }

    return this.hydrate(updated);
  }

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "rayons_by_tenant_name", [
      "tenantId",
      "type",
      "name",
    ]);
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: { type: "rayon", tenantId },
      sort: [{ name: "asc" }],
      limit,
      skip,
    });
    return (result.docs as any[]).map((doc) => ({
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "rayon"),
    }));
  }

  private async removeNameReservation(
    db: DocumentScope<unknown>,
    tenantId: string,
    name: string,
    rayonId: string
  ): Promise<void> {
    const reservationId = this.nameReservationId(tenantId, name);
    try {
      const reservation: any = await db.get(reservationId);
      if (reservation.rayonId === rayonId) {
        await db.destroy(reservation._id, reservation._rev);
      }
    } catch (error) {
      if (this.statusCode(error) !== 404) throw error;
    }
  }

  private async findExisting(
    db: DocumentScope<unknown>,
    id: string
  ): Promise<Record<string, any> | null> {
    try {
      const doc = await db.get(couchDocumentId("rayon", id));
      return doc as unknown as Record<string, any>;
    } catch (error: any) {
      if (error?.statusCode === 404) return null;
      throw error;
    }
  }

  private async database(tenantId: string): Promise<DocumentScope<unknown>> {
    try {
      return await this.couchDBService.getDatabase(this.databaseName(tenantId));
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private normalize(name: string): string {
    return name.trim().toLowerCase();
  }

  private nameReservationId(tenantId: string, name: string): string {
    return `rayon-name:${createHash("sha256").update(`${tenantId}:${this.normalize(name)}`).digest("hex")}`;
  }

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }

  private pagination(options?: PaginationOptions): { limit: number; skip: number } {
    const limit = options?.limit ?? 100;
    const skip = options?.offset ?? (options?.page ?? 0) * limit;
    return { limit, skip };
  }

  private statusCode(error: unknown): number | undefined {
    return typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as any).statusCode)
      : undefined;
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
  }

  private hydrate(doc: Record<string, any>): Rayon {
    return {
      id: doc.id ?? publicDocumentId(doc._id, "rayon"),
      name: doc.name,
      description: doc.description ?? null,
      tenantId: doc.tenantId,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    };
  }

  private toDocument(rayon: Rayon) {
    return {
      type: "rayon" as const,
      id: rayon.id,
      name: rayon.name,
      description: rayon.description ?? null,
      tenantId: rayon.tenantId,
      createdAt: rayon.createdAt.toISOString(),
      updatedAt: rayon.updatedAt.toISOString(),
    };
  }
}
