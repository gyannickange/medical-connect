import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import type { InsertPrescription, Prescription, PrescriptionLine, PrescriptionStatus } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

export interface PrescriptionFilters {
  consultationId?: string;
  status?: string;
}

export interface UpdatePrescriptionData {
  lines?: PrescriptionLine[];
  status?: PrescriptionStatus;
}

@Injectable()
export class PrescriptionsRepository {
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  async create(data: InsertPrescription): Promise<Prescription> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const consultation = await this.consultationsRepository.findExistingForCascade(db, data.consultationId);
    if (!consultation || consultation.type !== "consultation" || consultation.tenantId !== data.tenantId) {
      throw new NotFoundException("Consultation not found");
    }

    const prescription: Prescription = {
      id,
      tenantId: data.tenantId,
      consultationId: data.consultationId,
      patientId: consultation.patientId,
      lines: data.lines.map((line) => ({
        drugName: line.drugName,
        dosage: line.dosage,
        frequency: line.frequency,
        durationDays: line.durationDays ?? null,
        quantity: line.quantity ?? null,
        dispenseStatus: "en_attente",
      })),
      prescribedByUserId: data.prescribedByUserId,
      prescribedAt: now,
      status: "en_attente",
      dispensedByUserId: null,
      dispensedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(prescription), _id: couchDocumentId("prescription", id) } as any);
      return prescription;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: UpdatePrescriptionData, actorUserId: string): Promise<Prescription> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "prescription" || current.tenantId !== tenantId) {
      throw new NotFoundException("Prescription not found");
    }

    const now = new Date().toISOString();
    const lines = data.lines ?? current.lines;
    const nextStatus = data.status ?? this.deriveStatus(lines, current.status);
    const dispensing = nextStatus === "delivre" || nextStatus === "delivre_partiel";

    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "prescription" as const,
      tenantId,
      consultationId: current.consultationId,
      patientId: current.patientId,
      prescribedByUserId: current.prescribedByUserId,
      prescribedAt: current.prescribedAt,
      createdAt: current.createdAt,
      updatedAt: now,
      lines,
      status: nextStatus,
      dispensedByUserId: dispensing ? actorUserId : (current.dispensedByUserId ?? null),
      dispensedAt: dispensing ? now : (current.dispensedAt ?? null),
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  async findById(id: string, tenantId: string): Promise<Prescription> {
    const db = await this.database(tenantId);
    const doc = await this.findExisting(db, id);
    if (!doc || doc.type !== "prescription" || doc.tenantId !== tenantId) {
      throw new NotFoundException("Prescription not found");
    }
    return this.hydrate(doc);
  }

  async findByTenant(tenantId: string, filters?: PrescriptionFilters): Promise<Prescription[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "prescriptions_by_tenant_prescribed", ["tenantId", "type", "prescribedAt"]);
    const selector: Record<string, any> = { type: "prescription", tenantId };
    if (filters?.consultationId) selector.consultationId = filters.consultationId;
    if (filters?.status) selector.status = filters.status;

    const result = await db.find({ selector, sort: [{ prescribedAt: "asc" }], limit: 200 });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  private deriveStatus(lines: PrescriptionLine[], currentStatus: string): PrescriptionStatus {
    if (!lines || lines.length === 0) return currentStatus as PrescriptionStatus;
    const allDelivered = lines.every((line) => line.dispenseStatus === "delivre");
    if (allDelivered) return "delivre";
    const someDelivered = lines.some((line) => line.dispenseStatus === "delivre");
    if (someDelivered) return "delivre_partiel";
    return currentStatus as PrescriptionStatus;
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("prescription", id))) as unknown as Record<string, any>;
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

  private hydrate(doc: Record<string, any>): Prescription {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "prescription"),
      prescribedAt: new Date(doc.prescribedAt),
      dispensedAt: doc.dispensedAt ? new Date(doc.dispensedAt) : null,
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as Prescription;
  }

  private toDocument(prescription: Prescription) {
    return {
      ...prescription,
      type: "prescription" as const,
      prescribedAt: prescription.prescribedAt.toISOString(),
      createdAt: prescription.createdAt.toISOString(),
      updatedAt: prescription.updatedAt.toISOString(),
    };
  }
}
