import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import type { InsertLabOrder, LabOrder, LabOrderExamLine, LabOrderStatus } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

export interface LabOrderFilters {
  consultationId?: string;
  status?: string;
  priority?: string;
}

export interface UpdateLabOrderData {
  status?: LabOrderStatus;
  examLines?: LabOrderExamLine[];
  problemReport?: string;
}

@Injectable()
export class LabOrdersRepository {
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  async create(data: InsertLabOrder): Promise<LabOrder> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const consultation = await this.consultationsRepository.findExistingForCascade(db, data.consultationId);
    if (!consultation || consultation.type !== "consultation" || consultation.tenantId !== data.tenantId) {
      throw new NotFoundException("Consultation not found");
    }

    const labOrder: LabOrder = {
      id,
      tenantId: data.tenantId,
      consultationId: data.consultationId,
      patientId: consultation.patientId,
      examLines: data.examLines.map((line) => ({ examName: line.examName, resultText: null })),
      requestedByUserId: data.requestedByUserId,
      requestedAt: now,
      priority: data.priority ?? "normal",
      clinicalContext: data.clinicalContext ?? null,
      specialInstructions: data.specialInstructions ?? null,
      status: "demande",
      takenInChargeByUserId: null,
      takenInChargeAt: null,
      validatedByUserId: null,
      validatedAt: null,
      problemReport: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(labOrder), _id: couchDocumentId("lab_order", id) } as any);
      return labOrder;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: UpdateLabOrderData, actorUserId: string): Promise<LabOrder> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "lab_order" || current.tenantId !== tenantId) {
      throw new NotFoundException("Lab order not found");
    }

    const now = new Date().toISOString();
    const nextStatus = data.status ?? current.status;
    const enteringEnCours = nextStatus === "en_cours" && current.status !== "en_cours";
    const enteringTermine = nextStatus === "termine" && current.status !== "termine";

    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "lab_order" as const,
      tenantId,
      consultationId: current.consultationId,
      patientId: current.patientId,
      requestedByUserId: current.requestedByUserId,
      requestedAt: current.requestedAt,
      createdAt: current.createdAt,
      updatedAt: now,
      status: nextStatus,
      takenInChargeByUserId: enteringEnCours ? actorUserId : (current.takenInChargeByUserId ?? null),
      takenInChargeAt: enteringEnCours ? now : (current.takenInChargeAt ?? null),
      validatedByUserId: enteringTermine ? actorUserId : (current.validatedByUserId ?? null),
      validatedAt: enteringTermine ? now : (current.validatedAt ?? null),
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  async findById(id: string, tenantId: string): Promise<LabOrder> {
    const db = await this.database(tenantId);
    const doc = await this.findExisting(db, id);
    if (!doc || doc.type !== "lab_order" || doc.tenantId !== tenantId) {
      throw new NotFoundException("Lab order not found");
    }
    return this.hydrate(doc);
  }

  async findByTenant(tenantId: string, filters?: LabOrderFilters): Promise<LabOrder[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "lab_orders_by_tenant_requested", ["tenantId", "type", "requestedAt"]);
    const selector: Record<string, any> = { type: "lab_order", tenantId };
    if (filters?.consultationId) selector.consultationId = filters.consultationId;
    if (filters?.status) selector.status = filters.status;
    if (filters?.priority) selector.priority = filters.priority;

    const result = await db.find({ selector, sort: [{ requestedAt: "asc" }], limit: 200 });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("lab_order", id))) as unknown as Record<string, any>;
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

  private hydrate(doc: Record<string, any>): LabOrder {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "lab_order"),
      requestedAt: new Date(doc.requestedAt),
      takenInChargeAt: doc.takenInChargeAt ? new Date(doc.takenInChargeAt) : null,
      validatedAt: doc.validatedAt ? new Date(doc.validatedAt) : null,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as LabOrder;
  }

  private toDocument(labOrder: LabOrder) {
    return {
      ...labOrder,
      type: "lab_order" as const,
      requestedAt: labOrder.requestedAt.toISOString(),
      createdAt: labOrder.createdAt.toISOString(),
      updatedAt: labOrder.updatedAt.toISOString(),
    };
  }
}
