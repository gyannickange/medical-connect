import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { Service, InsertService } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

export const DEFAULT_SERVICE_NAMES: string[] = [
  "Médecine générale",
  "Cardiologie",
  "Pédiatrie",
  "Gynécologie-Obstétrique",
  "Chirurgie générale",
  "Urgences",
  "Radiologie",
  "Laboratoire",
  "Pharmacie",
  "Ophtalmologie",
  "ORL",
  "Dermatologie",
  "Psychiatrie",
  "Kinésithérapie",
  "Dentaire",
  "Bloc opératoire",
  "Maternité",
  "Réanimation",
  "Urologie",
  "Endocrinologie",
];

@Injectable()
export class ServicesRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertService): Promise<Service> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const service: Service = {
      id,
      tenantId: data.tenantId,
      name: data.name,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(service), _id: couchDocumentId("service", id) } as any);
      return service;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertService>): Promise<Service> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "service" || current.tenantId !== tenantId) {
      throw new NotFoundException("Service not found");
    }

    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "service" as const,
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

  async findByTenant(tenantId: string): Promise<Service[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "services_by_tenant_name", ["tenantId", "type", "name"]);
    const result = await db.find({ selector: { type: "service", tenantId }, sort: [{ name: "asc" }], limit: 500 });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  /** Idempotent: only inserts the default catalog if the tenant has no services yet. */
  async seedDefaults(tenantId: string): Promise<void> {
    const existing = await this.findByTenant(tenantId);
    if (existing.length > 0) return;
    for (const name of DEFAULT_SERVICE_NAMES) {
      await this.create({ name, isActive: true, tenantId });
    }
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("service", id))) as unknown as Record<string, any>;
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

  private hydrate(doc: Record<string, any>): Service {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "service"),
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as Service;
  }

  private toDocument(service: Service) {
    return { ...service, type: "service" as const, createdAt: service.createdAt.toISOString(), updatedAt: service.updatedAt.toISOString() };
  }
}
