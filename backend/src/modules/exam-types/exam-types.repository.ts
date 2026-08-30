import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { ExamType, InsertExamType } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class ExamTypesRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertExamType): Promise<ExamType> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const examType: ExamType = {
      id,
      tenantId: data.tenantId,
      name: data.name,
      category: data.category,
      isActive: data.isActive ?? true,
      parameters: data.parameters ?? [],
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(examType), _id: couchDocumentId("exam_type", id) } as any);
      return examType;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertExamType>): Promise<ExamType> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "exam_type" || current.tenantId !== tenantId) {
      throw new NotFoundException("Exam type not found");
    }

    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "exam_type" as const,
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

  async delete(id: string, tenantId: string): Promise<void> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "exam_type" || current.tenantId !== tenantId) {
      throw new NotFoundException("Exam type not found");
    }
    try {
      await db.destroy(current._id, current._rev);
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async findByTenant(tenantId: string): Promise<ExamType[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "exam_types_by_tenant_name", ["tenantId", "type", "name"]);
    const result = await db.find({ selector: { type: "exam_type", tenantId }, sort: [{ name: "asc" }], limit: 500 });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("exam_type", id))) as unknown as Record<string, any>;
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

  private hydrate(doc: Record<string, any>): ExamType {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "exam_type"),
      parameters: doc.parameters ?? [],
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as ExamType;
  }

  private toDocument(examType: ExamType) {
    return { ...examType, type: "exam_type" as const, createdAt: examType.createdAt.toISOString(), updatedAt: examType.updatedAt.toISOString() };
  }
}
