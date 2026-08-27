import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { SequenceCounterService } from "../../lib/sequence-counter.service";
import type { InsertPatient, Patient } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class PatientsRepository {
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly sequenceCounterService: SequenceCounterService
  ) {}

  async create(data: InsertPatient): Promise<Patient> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);
    const year = now.getUTCFullYear();
    const sequence = await this.sequenceCounterService.next(data.tenantId, `patient:${year}`);
    const dossierNumber = `MC-${year}-${String(sequence).padStart(4, "0")}`;

    const patient: Patient = {
      id,
      tenantId: data.tenantId,
      dossierNumber,
      lastName: data.lastName,
      firstName: data.firstName,
      searchName: this.searchName(data.firstName, data.lastName),
      dateOfBirth: data.dateOfBirth,
      sex: data.sex,
      primaryPhone: data.primaryPhone,
      residenceAddress: data.residenceAddress,
      usualName: data.usualName ?? null,
      birthPlace: data.birthPlace ?? null,
      nationality: data.nationality ?? null,
      profession: data.profession ?? null,
      maritalStatus: data.maritalStatus ?? null,
      idDocumentType: data.idDocumentType ?? null,
      idDocumentNumber: data.idDocumentNumber ?? null,
      idDocumentExpiry: data.idDocumentExpiry ?? null,
      email: data.email ?? null,
      secondaryPhone: data.secondaryPhone ?? null,
      residenceZone: data.residenceZone ?? null,
      fullAddress: data.fullAddress ?? null,
      emergencyContact: data.emergencyContact ?? null,
      bloodGroup: data.bloodGroup ?? null,
      allergyKnowledge: data.allergyKnowledge ?? "non_renseigne",
      allergyDetails: data.allergyDetails ?? null,
      medicalHistory: data.medicalHistory ?? null,
      surgicalHistory: data.surgicalHistory ?? null,
      chronicDiseases: data.chronicDiseases ?? null,
      currentTreatments: data.currentTreatments ?? null,
      disabilities: data.disabilities ?? null,
      facilityService: data.facilityService ?? null,
      referringDoctorId: data.referringDoctorId ?? null,
      patientType: data.patientType ?? "externe",
      paymentMode: data.paymentMode ?? null,
      insuranceName: data.insuranceName ?? null,
      insuranceNumber: data.insuranceNumber ?? null,
      financiallyResponsible: data.financiallyResponsible ?? null,
      pediatricInfo: data.pediatricInfo ?? null,
      photoS3Key: null,
      status: "actif",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(patient), _id: couchDocumentId("patient", id) } as any);
      return patient;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertPatient>): Promise<Patient> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "patient" || current.tenantId !== tenantId) {
      throw new NotFoundException("Patient not found");
    }

    const nextFirstName = (data as any).firstName ?? current.firstName;
    const nextLastName = (data as any).lastName ?? current.lastName;

    const updated = {
      ...current,
      ...data,
      searchName: this.searchName(nextFirstName, nextLastName),
      _id: current._id,
      _rev: current._rev,
      id,
      type: "patient" as const,
      tenantId,
      dossierNumber: current.dossierNumber,
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

  async findById(id: string, tenantId: string): Promise<Patient> {
    const db = await this.database(tenantId);
    const doc = await this.findExisting(db, id);
    if (!doc || doc.type !== "patient" || doc.tenantId !== tenantId) {
      throw new NotFoundException("Patient not found");
    }
    return this.hydrate(doc);
  }

  async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "patients_by_tenant_name", ["tenantId", "type", "searchName"]);
    const { limit, skip } = this.pagination(options);
    const result = await db.find({
      selector: { type: "patient", tenantId },
      sort: [{ searchName: "asc" }],
      limit,
      skip,
    });
    return this.mapDocs(result.docs as any[]);
  }

  async search(query: string, tenantId: string, options?: PaginationOptions): Promise<any[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "patients_by_tenant_name", ["tenantId", "type", "searchName"]);
    const { limit, skip } = this.pagination(options);
    const normalized = query.trim().toLowerCase();
    const result = await db.find({
      selector: {
        type: "patient",
        tenantId,
        $or: [
          { searchName: { $regex: this.escapeRegex(normalized) } },
          { dossierNumber: { $regex: this.escapeRegex(query) } },
          { primaryPhone: { $regex: this.escapeRegex(query) } },
        ],
      },
      limit,
      skip,
    });
    return this.mapDocs(result.docs as any[]);
  }

  async findExistingForCascade(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    return this.findExisting(db, id);
  }

  private mapDocs(docs: any[]): any[] {
    return docs.map((doc) => ({ ...doc, id: doc.id ?? publicDocumentId(doc._id, "patient") }));
  }

  private searchName(firstName: string, lastName: string): string {
    return `${firstName} ${lastName}`.trim().toLowerCase();
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("patient", id))) as unknown as Record<string, any>;
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

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
  }

  private hydrate(doc: Record<string, any>): Patient {
    return { ...doc, id: doc.id ?? publicDocumentId(doc._id, "patient"), createdAt: new Date(doc.createdAt), updatedAt: new Date(doc.updatedAt) } as Patient;
  }

  private toDocument(patient: Patient) {
    return { ...patient, type: "patient" as const, createdAt: patient.createdAt.toISOString(), updatedAt: patient.updatedAt.toISOString() };
  }
}
