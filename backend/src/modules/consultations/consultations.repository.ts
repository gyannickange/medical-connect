import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { SequenceCounterService } from "../../lib/sequence-counter.service";
import { PatientsRepository } from "../patients/patients.repository";
import type { InsertConsultation, Consultation } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

export interface ConsultationFilters {
  specialty?: string;
  assignedDoctorId?: string;
  scheduledOnOrAfter?: string;
}

@Injectable()
export class ConsultationsRepository {
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly sequenceCounterService: SequenceCounterService,
    private readonly patientsRepository: PatientsRepository
  ) {}

  async create(data: InsertConsultation): Promise<Consultation> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const patient = await this.patientsRepository.findExistingForCascade(db, data.patientId);
    if (!patient || patient.type !== "patient" || patient.tenantId !== data.tenantId) {
      throw new NotFoundException("Patient not found");
    }

    const year = now.getUTCFullYear();
    const sequence = await this.sequenceCounterService.next(data.tenantId, `consultation:${year}`);
    const number = `C-${year}-${String(sequence).padStart(4, "0")}`;

    const consultation: Consultation = {
      id,
      tenantId: data.tenantId,
      number,
      patientId: data.patientId,
      scheduledAt: new Date(data.scheduledAt),
      specialty: data.specialty,
      assignedDoctorId: data.assignedDoctorId,
      roomId: data.roomId ?? null,
      priority: data.priority ?? "normal",
      reason: data.reason,
      nurseNotes: data.nurseNotes ?? null,
      symptoms: null,
      vitals: null,
      vitalsRecordedAt: null,
      relevantHistory: [],
      presentIllnessHistory: null,
      physicalExam: null,
      diagnosisPrincipal: null,
      diagnosisSecondary: [],
      diagnosisHypothesis: null,
      medicalConsultationSavedAt: null,
      status: "planifiee",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(consultation), _id: couchDocumentId("consultation", id) } as any);
      return consultation;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertConsultation> & Record<string, unknown>): Promise<Consultation> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "consultation" || current.tenantId !== tenantId) {
      throw new NotFoundException("Consultation not found");
    }

    const now = new Date().toISOString();
    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "consultation" as const,
      tenantId,
      number: current.number,
      createdAt: current.createdAt,
      updatedAt: now,
      vitalsRecordedAt: "vitals" in data ? now : (current.vitalsRecordedAt ?? null),
      medicalConsultationSavedAt:
        "physicalExam" in data || "diagnosisPrincipal" in data ? now : (current.medicalConsultationSavedAt ?? null),
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  async findById(id: string, tenantId: string): Promise<Consultation> {
    const db = await this.database(tenantId);
    const doc = await this.findExisting(db, id);
    if (!doc || doc.type !== "consultation" || doc.tenantId !== tenantId) {
      throw new NotFoundException("Consultation not found");
    }
    return this.hydrate(doc);
  }

  async findExistingForCascade(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    return this.findExisting(db, id);
  }

  async findByTenant(tenantId: string, filters?: ConsultationFilters, options?: PaginationOptions): Promise<any[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "consultations_by_tenant_scheduled", ["tenantId", "type", "scheduledAt"]);
    const { limit, skip } = this.pagination(options);
    const selector: Record<string, any> = { type: "consultation", tenantId };
    if (filters?.specialty) selector.specialty = filters.specialty;
    if (filters?.assignedDoctorId) selector.assignedDoctorId = filters.assignedDoctorId;
    if (filters?.scheduledOnOrAfter) selector.scheduledAt = { $gte: filters.scheduledOnOrAfter };

    const result = await db.find({ selector, sort: [{ scheduledAt: "asc" }], limit, skip });
    return (result.docs as any[]).map((doc) => ({ ...doc, id: doc.id ?? publicDocumentId(doc._id, "consultation") }));
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("consultation", id))) as unknown as Record<string, any>;
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

  private pagination(options?: PaginationOptions): { limit: number; skip: number } {
    const limit = options?.limit ?? 100;
    const skip = options?.offset ?? (options?.page ?? 0) * limit;
    return { limit, skip };
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
  }

  private hydrate(doc: Record<string, any>): Consultation {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "consultation"),
      scheduledAt: new Date(doc.scheduledAt),
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
      vitalsRecordedAt: doc.vitalsRecordedAt ? new Date(doc.vitalsRecordedAt) : null,
      medicalConsultationSavedAt: doc.medicalConsultationSavedAt ? new Date(doc.medicalConsultationSavedAt) : null,
    } as Consultation;
  }

  private toDocument(consultation: Consultation) {
    return {
      ...consultation,
      type: "consultation" as const,
      scheduledAt: consultation.scheduledAt.toISOString(),
      createdAt: consultation.createdAt.toISOString(),
      updatedAt: consultation.updatedAt.toISOString(),
    };
  }
}
