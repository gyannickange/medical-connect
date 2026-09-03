import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { ExamType, ExamTypeCategory, ExamTypeParameter, InsertExamType } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

function param(name: string, unit: string, referenceRange: string): ExamTypeParameter {
  return { name, unit, referenceRange };
}

export const DEFAULT_EXAM_TYPES: { name: string; category: ExamTypeCategory; parameters?: ExamTypeParameter[] }[] = [
  {
    name: "Numération Formule Sanguine (NFS)",
    category: "laboratoire",
    parameters: [
      param("Hémoglobine", "g/dL", "12-16"),
      param("Leucocytes", "/mm³", "4000-10000"),
      param("Plaquettes", "/mm³", "150000-450000"),
      param("Hématocrite", "%", "36-46"),
    ],
  },
  { name: "Glycémie à jeun", category: "laboratoire", parameters: [param("Glycémie", "g/L", "0.70-1.10")] },
  { name: "Créatininémie", category: "laboratoire", parameters: [param("Créatinine", "mg/L", "6-13")] },
  {
    name: "Bilan lipidique",
    category: "laboratoire",
    parameters: [
      param("Cholestérol total", "g/L", "< 2.00"),
      param("Triglycérides", "g/L", "< 1.50"),
      param("HDL-Cholestérol", "g/L", "> 0.40"),
      param("LDL-Cholestérol", "g/L", "< 1.60"),
    ],
  },
  {
    name: "Transaminases (ASAT/ALAT)",
    category: "laboratoire",
    parameters: [param("ASAT", "UI/L", "10-40"), param("ALAT", "UI/L", "10-40")],
  },
  { name: "Goutte épaisse (Paludisme)", category: "laboratoire" },
  { name: "Test de diagnostic rapide du paludisme", category: "laboratoire" },
  { name: "Groupage sanguin ABO/Rhésus", category: "laboratoire" },
  { name: "Sérologie VIH", category: "laboratoire" },
  { name: "Sérologie typhoïdique (Widal-Félix)", category: "laboratoire" },
  { name: "Examen Parasitologique des Selles (EPS)", category: "laboratoire" },
  { name: "Examen Cytobactériologique des Urines (ECBU)", category: "laboratoire" },
  {
    name: "Ionogramme sanguin",
    category: "laboratoire",
    parameters: [
      param("Sodium (Na+)", "mmol/L", "135-145"),
      param("Potassium (K+)", "mmol/L", "3.5-5.0"),
      param("Chlore (Cl-)", "mmol/L", "95-105"),
    ],
  },
  { name: "Protéine C-réactive (CRP)", category: "laboratoire", parameters: [param("CRP", "mg/L", "< 6")] },
  { name: "Test de grossesse (bHCG)", category: "laboratoire", parameters: [param("bHCG", "mUI/mL", "< 5 (négatif)")] },
  { name: "Radiographie thoracique", category: "imagerie" },
  { name: "Échographie abdominale", category: "imagerie" },
  { name: "Échographie obstétricale", category: "imagerie" },
  { name: "Scanner cérébral", category: "imagerie" },
  { name: "Électrocardiogramme (ECG)", category: "explorations_fonctionnelles" },
  { name: "Spirométrie", category: "explorations_fonctionnelles" },
];

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

  /** Idempotent: only inserts the default catalog if the tenant has no exam types yet. */
  async seedDefaults(tenantId: string): Promise<void> {
    const existing = await this.findByTenant(tenantId);
    if (existing.length > 0) return;
    for (const { name, category, parameters } of DEFAULT_EXAM_TYPES) {
      await this.create({ name, category, isActive: true, parameters, tenantId });
    }
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
