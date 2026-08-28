import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { InsertRoom, Room } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class RoomsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertRoom): Promise<Room> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const room: Room = {
      id,
      tenantId: data.tenantId,
      number: data.number,
      type: data.type,
      floor: data.floor ?? null,
      capacity: data.capacity,
      equipment: data.equipment ?? [],
      notes: data.notes ?? null,
      status: data.status ?? "disponible",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(room), _id: couchDocumentId("room", id) } as any);
      return room;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertRoom>): Promise<Room> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "room" || current.tenantId !== tenantId) {
      throw new NotFoundException("Room not found");
    }

    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "room" as const,
      tenantId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  async findById(id: string, tenantId: string): Promise<Room> {
    const db = await this.database(tenantId);
    const doc = await this.findExisting(db, id);
    if (!doc || doc.type !== "room" || doc.tenantId !== tenantId) {
      throw new NotFoundException("Room not found");
    }
    return this.hydrate(doc);
  }

  async findByTenant(tenantId: string): Promise<Room[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "rooms_by_tenant_number", ["tenantId", "type", "number"]);
    const result = await db.find({ selector: { type: "room", tenantId }, sort: [{ number: "asc" }], limit: 200 });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("room", id))) as unknown as Record<string, any>;
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

  private databaseName(tenantId: string): string {
    return tenantDatabaseName(tenantId);
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
  }

  private hydrate(doc: Record<string, any>): Room {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "room"),
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as Room;
  }

  private toDocument(room: Room) {
    return { ...room, type: "room" as const, createdAt: room.createdAt.toISOString(), updatedAt: room.updatedAt.toISOString() };
  }
}
