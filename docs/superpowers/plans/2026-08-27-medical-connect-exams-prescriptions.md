# Medical Connect — Phase 3: Lab Orders (Laboratoire) & Prescriptions (Pharmacie) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give real behavior to the "Examens complémentaires" and "Prescription" sections of `consultation-medicale` (currently disabled placeholders), via two new entities (`LabOrder`, `Prescription`), two new backend modules, and two new frontend sections (`/laboratoire`, `/pharmacie`) for the existing `laboratoire`/`pharmacien` roles.

**Architecture:** Two new CouchDB document types (`lab_order`, `prescription`), each its own NestJS module mirroring `consultations`' shape exactly (controller/policy/service/repository/dto). Each document carries a `consultationId` reference validated via the existing `ConsultationsRepository.findExistingForCascade` cascade-check (same pattern `QueueRepository.appendEvent` already uses). Frontend gets five new pages under `frontend/src/pages/laboratoire/` and `frontend/src/pages/pharmacie/`, and the existing `consultation-medicale.tsx`/`show.tsx` (hub) pages get their placeholder sections wired to the new data.

**Tech Stack:** NestJS, CouchDB (`nano`), class-validator, React 18, Wouter, `@tanstack/react-query`, Tailwind + shadcn `ui/` components (`Table`, `Dialog`, `Select`, `Badge`, `RadioGroup`, `Card`).

**Spec:** `docs/superpowers/specs/2026-08-27-medical-connect-exams-prescriptions-design.md`

## Global Constraints

- **Prerequisite:** Phase 1 and Phase 2 are both implemented and merged (`d8f85e4`) — this plan builds directly on the real `Consultation` schema (`vitals`, `physicalExam`, `diagnosisPrincipal`, etc.) and the real `computeConsultationJourney`/`ConsultationHub`/`ConsultationMedicaleForm` code, not a hypothetical.
- CouchDB documents only, no Drizzle/Postgres — same convention as Phase 1/2. No stock/inventory concept anywhere (deliberately dropped per the design spec §7 — this codebase already removed its old products/stock modules).
- Tenant ID always derived from `req.user.tenantId` (never a client-supplied value) via the same private `tenantId(req, legacyTenantId?)` helper already used in `ConsultationsController`/`QueueController`. Actor ids (`requestedByUserId`, `prescribedByUserId`, etc.) always derived from `req.user.id`, never from the request body — same pattern as `QueueController.appendEvent`'s `actorUserId: req.user.id`.
- Every user-facing string goes through `t("key")`, added to **both** `en`/`fr`, checked by `frontend/src/lib/i18nCompleteness.test.ts`.
- No `@testing-library/react`/jsdom. Backend logic is unit-tested (repository/policy specs, plain `new X(mockedDep as any)` construction — policies use `new X(); x.setUser(...)` per the backend `BasePolicy` shape). Frontend pages stay thin and untested, matching Phase 1/2.
- Never hand-roll a raw `<button>`/`<input>`/`<select>`/`<table>`/`<dialog>` when `frontend/src/components/ui/` has the component. Confirmed present and used in this plan: `Table`, `Dialog`, `Select`, `Badge`, `RadioGroup`, `Card`, `Button`, `Input`, `Textarea`, `Label`.
- **Deviations from the design spec, discovered while planning:**
  1. The design spec's §6 lists filter chips "Statut / Date / Médecin prescripteur" on `/laboratoire`. Only a **Statut** filter is implemented (it maps directly to the backend's `?status=` query param already specified in §5). "Date" and "Médecin prescripteur" filters would need new backend query params never specified in the design's API section (§5 only lists `consultationId`, `status`, `priority`) — adding them here would be scope creep beyond what was asked. Cut, consistent with YAGNI.
  2. `LabOrder`/`Prescription` list pages use the `Table` component (not the div/`glass-card` list style `Consultations.tsx`/`FileAttente.tsx` use) — the design spec explicitly calls for a "Demandes récentes" **table**, matching the Figma layout more closely than the card-list pattern.

---

### Task 1: `LabOrder`/`Prescription` schema types (backend + frontend)

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `frontend/shared/schema.ts`

**Interfaces:**
- Consumes: nothing (foundational).
- Produces: `LabOrderStatus`, `LabOrderExamLine`, `LabOrder`, `InsertLabOrder`, `PrescriptionStatus`, `DispenseStatus`, `PrescriptionLine`, `Prescription`, `InsertPrescription` — consumed by every later task.

- [ ] **Step 1: Add the types to `backend/src/shared/schema.ts`**

Append after the `Consultation`/`InsertConsultation` block:

```ts
export type LabOrderStatus = "demande" | "en_cours" | "a_valider" | "termine" | "probleme_signale" | "annule";

export interface LabOrderExamLine { examName: string; resultText: string | null }

export interface LabOrder {
  id: string;
  tenantId: string;
  consultationId: string;
  patientId: string;
  examLines: LabOrderExamLine[];
  requestedByUserId: string;
  requestedAt: Date;
  priority: "normal" | "urgent";
  clinicalContext: string | null;
  specialInstructions: string | null;
  status: LabOrderStatus;
  takenInChargeByUserId: string | null;
  takenInChargeAt: Date | null;
  validatedByUserId: string | null;
  validatedAt: Date | null;
  problemReport: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertLabOrder {
  id?: string;
  tenantId: string;
  consultationId: string;
  examLines: { examName: string }[];
  priority?: "normal" | "urgent";
  clinicalContext?: string | null;
  specialInstructions?: string | null;
  requestedByUserId: string;
}

export type PrescriptionStatus = "en_attente" | "prepare" | "delivre" | "delivre_partiel" | "annule";
export type DispenseStatus = "en_attente" | "delivre" | "indisponible";

export interface PrescriptionLine {
  drugName: string;
  dosage: string;
  frequency: string;
  durationDays: number | null;
  quantity: string | null;
  dispenseStatus: DispenseStatus;
}

export interface Prescription {
  id: string;
  tenantId: string;
  consultationId: string;
  patientId: string;
  lines: PrescriptionLine[];
  prescribedByUserId: string;
  prescribedAt: Date;
  status: PrescriptionStatus;
  dispensedByUserId: string | null;
  dispensedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertPrescription {
  id?: string;
  tenantId: string;
  consultationId: string;
  lines: { drugName: string; dosage: string; frequency: string; durationDays?: number | null; quantity?: string | null }[];
  prescribedByUserId: string;
}
```

- [ ] **Step 2: Mirror into `frontend/shared/schema.ts`**

Identical block, except `LabOrder`'s `requestedAt`/`takenInChargeAt`/`validatedAt`/`createdAt`/`updatedAt` and `Prescription`'s `prescribedAt`/`dispensedAt`/`createdAt`/`updatedAt` are `string | null`/`string` (frontend date-as-string convention, matching `Consultation.vitalsRecordedAt` etc. on the frontend mirror). `InsertLabOrder`/`InsertPrescription` are backend-only (used by repository `create()` signatures) — do not add them to the frontend mirror; frontend pages build plain POST-body objects directly, matching how `PreConsultationForm`/`ConsultationMedicaleForm` never import `InsertConsultation`.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: PASS (these are pure additions, nothing references them yet).

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add LabOrder and Prescription schema types"
```

---

### Task 2: Backend `lab-orders` module

**Files:**
- Create: `backend/src/modules/lab-orders/dto/create-lab-order.dto.ts`
- Create: `backend/src/modules/lab-orders/dto/update-lab-order.dto.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.repository.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.repository.spec.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.repository.module.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.policy.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.policy.spec.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.service.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.controller.ts`
- Create: `backend/src/modules/lab-orders/lab-orders.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `LabOrder`/`InsertLabOrder` (Task 1), `ConsultationsRepository.findExistingForCascade` (existing, Phase 1), `CouchDBService`, `couchDocumentId`/`publicDocumentId`/`tenantDatabaseName` (existing).
- Produces: `GET /api/lab-orders/:tenantId?consultationId=&status=&priority=`, `GET /api/lab-orders/detail/:id`, `POST /api/lab-orders`, `PUT /api/lab-orders/:id` — consumed by Task 7, 8, 9 (frontend pages) and Task 13 (consultation-medicale wiring).

- [ ] **Step 1: Write the failing repository tests**

```ts
// backend/src/modules/lab-orders/lab-orders.repository.spec.ts
import { NotFoundException } from "@nestjs/common";
import { LabOrdersRepository } from "./lab-orders.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1", patientId: "patient-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

describe("LabOrdersRepository", () => {
  describe("create", () => {
    it("validates the consultation exists in the tenant and creates the lab order", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepository as any);

      const result = await repository.create({
        tenantId: "tenant-1",
        consultationId: "c1",
        examLines: [{ examName: "NFS" }, { examName: "Créatinine" }],
        priority: "urgent",
        clinicalContext: "Suspicion d'anémie",
        requestedByUserId: "doctor-1",
      });

      expect(consultationsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "c1");
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "lab_order",
          status: "demande",
          patientId: "patient-1",
          priority: "urgent",
          examLines: [{ examName: "NFS", resultText: null }, { examName: "Créatinine", resultText: null }],
        })
      );
      expect(result.status).toBe("demande");
      expect(result.patientId).toBe("patient-1");
    });

    it("throws NotFoundException when the consultation does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const consultationsRepository = consultationsRepoStub(null);
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepository as any);

      await expect(
        repository.create({ tenantId: "tenant-1", consultationId: "missing", examLines: [{ examName: "NFS" }], requestedByUserId: "doctor-1" })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    function existingLabOrder(overrides: Record<string, unknown> = {}) {
      return {
        _id: "lab_order:lo1",
        _rev: "2-a",
        id: "lo1",
        type: "lab_order",
        tenantId: "tenant-1",
        consultationId: "c1",
        patientId: "patient-1",
        examLines: [{ examName: "NFS", resultText: null }],
        requestedByUserId: "doctor-1",
        requestedAt: "2026-08-27T09:00:00.000Z",
        priority: "normal",
        status: "demande",
        takenInChargeByUserId: null,
        takenInChargeAt: null,
        validatedByUserId: null,
        validatedAt: null,
        problemReport: null,
        createdAt: "2026-08-27T09:00:00.000Z",
        ...overrides,
      };
    }

    it("sets takenInChargeByUserId/At when status transitions to en_cours", async () => {
      const existing = existingLabOrder();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const result = await repository.update("lo1", "tenant-1", { status: "en_cours" }, "labtech-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: expect.any(String) })
      );
      expect(result.takenInChargeAt).toBeInstanceOf(Date);
    });

    it("sets validatedByUserId/At and stores results when status transitions to termine", async () => {
      const existing = existingLabOrder({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" });
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const examLines = [{ examName: "NFS", resultText: "Hémoglobine 13.2 g/dL, normale" }];
      const result = await repository.update("lo1", "tenant-1", { status: "termine", examLines }, "labtech-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "termine", examLines, validatedByUserId: "labtech-1", validatedAt: expect.any(String) })
      );
      expect(result.validatedAt).toBeInstanceOf(Date);
    });

    it("does not re-stamp takenInChargeAt when already en_cours", async () => {
      const existing = existingLabOrder({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" });
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await repository.update("lo1", "tenant-1", { status: "en_cours" }, "labtech-2");

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" }));
    });

    it("throws NotFoundException when the lab order does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await expect(repository.update("missing", "tenant-1", { status: "en_cours" }, "labtech-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("filters by consultationId, status, and priority when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { consultationId: "c1", status: "demande", priority: "urgent" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({ type: "lab_order", tenantId: "tenant-1", consultationId: "c1", status: "demande", priority: "urgent" }),
        })
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/lab-orders/lab-orders.repository.spec.ts`
Expected: FAIL — `./lab-orders.repository` does not exist.

- [ ] **Step 3: Implement `LabOrdersRepository`**

```ts
// backend/src/modules/lab-orders/lab-orders.repository.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/lab-orders/lab-orders.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: `LabOrdersRepositoryModule`**

```ts
// backend/src/modules/lab-orders/lab-orders.repository.module.ts
import { Module } from "@nestjs/common";
import { LabOrdersRepository } from "./lab-orders.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";

@Module({
  imports: [CouchDBModule, ConsultationsRepositoryModule],
  providers: [LabOrdersRepository],
  exports: [LabOrdersRepository],
})
export class LabOrdersRepositoryModule {}
```

- [ ] **Step 6: Write the failing policy tests**

```ts
// backend/src/modules/lab-orders/lab-orders.policy.spec.ts
import { LabOrdersPolicy } from "./lab-orders.policy";

function policyFor(role: string): LabOrdersPolicy {
  const policy = new LabOrdersPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("LabOrdersPolicy", () => {
  it.each(["admin", "manager", "medecin", "infirmier", "laboratoire"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["accueil", "cashier", "pharmacien"])("%s cannot view", (role) => {
    expect(policyFor(role).view()).toBe(false);
  });

  it.each(["admin", "manager", "medecin"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["infirmier", "laboratoire", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager", "laboratoire"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "cashier"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail, then implement `LabOrdersPolicy`**

Run: `cd backend && npx jest src/modules/lab-orders/lab-orders.policy.spec.ts` → FAIL (module missing).

```ts
// backend/src/modules/lab-orders/lab-orders.policy.ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class LabOrdersPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isLaboratoire();
  }

  create(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }

  update(): boolean {
    return this.isAdmin() || this.isManager() || this.isLaboratoire();
  }
}
```

Run again: PASS.

- [ ] **Step 8: DTOs**

```ts
// backend/src/modules/lab-orders/dto/create-lab-order.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn, IsArray, ArrayMinSize, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ExamLineDto {
  @IsString() @IsNotEmpty() examName: string;
}

export class CreateLabOrderDto {
  @IsUUID() @IsNotEmpty() consultationId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => ExamLineDto) examLines: ExamLineDto[];
  @IsIn(["normal", "urgent"]) @IsOptional() priority?: string;
  @IsString() @IsOptional() clinicalContext?: string;
  @IsString() @IsOptional() specialInstructions?: string;
}
```

```ts
// backend/src/modules/lab-orders/dto/update-lab-order.dto.ts
import { IsString, IsOptional, IsIn, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class ExamLineUpdateDto {
  @IsString() @IsOptional() examName?: string;
  @IsString() @IsOptional() resultText?: string | null;
}

export class UpdateLabOrderDto {
  @IsIn(["demande", "en_cours", "a_valider", "termine", "probleme_signale", "annule"]) @IsOptional() status?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ExamLineUpdateDto) @IsOptional() examLines?: ExamLineUpdateDto[];
  @IsString() @IsOptional() problemReport?: string;
}
```

- [ ] **Step 9: `LabOrdersService`**

```ts
// backend/src/modules/lab-orders/lab-orders.service.ts
import { Injectable } from "@nestjs/common";
import type { InsertLabOrder } from "@shared/schema";
import { LabOrdersRepository, type LabOrderFilters, type UpdateLabOrderData } from "./lab-orders.repository";

@Injectable()
export class LabOrdersService {
  constructor(private readonly labOrdersRepository: LabOrdersRepository) {}

  findByTenant(tenantId: string, filters?: LabOrderFilters) {
    return this.labOrdersRepository.findByTenant(tenantId, filters);
  }

  findById(id: string, tenantId: string) {
    return this.labOrdersRepository.findById(id, tenantId);
  }

  create(data: InsertLabOrder) {
    return this.labOrdersRepository.create(data);
  }

  update(id: string, tenantId: string, data: UpdateLabOrderData, actorUserId: string) {
    return this.labOrdersRepository.update(id, tenantId, data, actorUserId);
  }
}
```

- [ ] **Step 10: `LabOrdersController`**

```ts
// backend/src/modules/lab-orders/lab-orders.controller.ts
import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { LabOrdersService } from "./lab-orders.service";
import { CreateLabOrderDto } from "./dto/create-lab-order.dto";
import { UpdateLabOrderDto } from "./dto/update-lab-order.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { LabOrdersPolicy } from "./lab-orders.policy";

@Controller("api/lab-orders")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class LabOrdersController {
  constructor(private readonly labOrdersService: LabOrdersService) {}

  @Get(":tenantId")
  @CheckPolicy(LabOrdersPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("consultationId") consultationId?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Request() req?: any
  ) {
    return this.labOrdersService.findByTenant(this.tenantId(req, tenantId), { consultationId, status, priority });
  }

  @Get("detail/:id")
  @CheckPolicy(LabOrdersPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.labOrdersService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(LabOrdersPolicy, "create")
  async create(@Body() dto: CreateLabOrderDto, @Request() req: any) {
    return this.labOrdersService.create({ ...dto, tenantId: this.tenantId(req), requestedByUserId: req.user.id } as any);
  }

  @Put(":id")
  @CheckPolicy(LabOrdersPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateLabOrderDto, @Request() req: any) {
    return this.labOrdersService.update(id, this.tenantId(req), dto as any, req.user.id);
  }

  private tenantId(req: any, legacyTenantId?: string): string {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("Authenticated tenant is required");
    if (legacyTenantId && legacyTenantId !== tenantId) {
      throw new ForbiddenException("Tenant does not match authenticated user");
    }
    return tenantId;
  }
}
```

- [ ] **Step 11: `LabOrdersModule`**

```ts
// backend/src/modules/lab-orders/lab-orders.module.ts
import { Module } from "@nestjs/common";
import { LabOrdersController } from "./lab-orders.controller";
import { LabOrdersService } from "./lab-orders.service";
import { LabOrdersPolicy } from "./lab-orders.policy";
import { AuthModule } from "../auth/auth.module";
import { LabOrdersRepositoryModule } from "./lab-orders.repository.module";

@Module({
  imports: [AuthModule, LabOrdersRepositoryModule],
  controllers: [LabOrdersController],
  providers: [LabOrdersService, LabOrdersPolicy],
  exports: [LabOrdersService],
})
export class LabOrdersModule {}
```

- [ ] **Step 12: Register in `app.module.ts`**

```ts
import { LabOrdersModule } from "./modules/lab-orders/lab-orders.module";
```

Add `LabOrdersModule` to the `imports` array, right after `ConsultationsModule`.

- [ ] **Step 13: Typecheck and boot-check**

Run: `cd backend && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add backend/src/modules/lab-orders backend/src/app.module.ts
git commit -m "feat: add lab-orders backend module (create, update, list, detail)"
```

---

### Task 3: Backend `prescriptions` module

**Files:**
- Create: `backend/src/modules/prescriptions/dto/create-prescription.dto.ts`
- Create: `backend/src/modules/prescriptions/dto/update-prescription.dto.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.repository.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.repository.spec.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.repository.module.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.policy.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.policy.spec.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.service.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.controller.ts`
- Create: `backend/src/modules/prescriptions/prescriptions.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `Prescription`/`InsertPrescription` (Task 1), `ConsultationsRepository.findExistingForCascade` (existing).
- Produces: `GET /api/prescriptions/:tenantId?consultationId=&status=`, `GET /api/prescriptions/detail/:id`, `POST /api/prescriptions`, `PUT /api/prescriptions/:id` — consumed by Task 10, 11 (frontend pages) and Task 13.

- [ ] **Step 1: Write the failing repository tests**

```ts
// backend/src/modules/prescriptions/prescriptions.repository.spec.ts
import { NotFoundException } from "@nestjs/common";
import { PrescriptionsRepository } from "./prescriptions.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1", patientId: "patient-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

describe("PrescriptionsRepository", () => {
  describe("create", () => {
    it("validates the consultation exists in the tenant and creates the prescription", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepository as any);

      const result = await repository.create({
        tenantId: "tenant-1",
        consultationId: "c1",
        lines: [{ drugName: "Kardegic", dosage: "75 mg", frequency: "1 sachet par jour (midi)", durationDays: 30, quantity: "1 boîte" }],
        prescribedByUserId: "doctor-1",
      });

      expect(consultationsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "c1");
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "prescription",
          status: "en_attente",
          patientId: "patient-1",
          lines: [{ drugName: "Kardegic", dosage: "75 mg", frequency: "1 sachet par jour (midi)", durationDays: 30, quantity: "1 boîte", dispenseStatus: "en_attente" }],
        })
      );
      expect(result.status).toBe("en_attente");
    });

    it("throws NotFoundException when the consultation does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const consultationsRepository = consultationsRepoStub(null);
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepository as any);

      await expect(
        repository.create({ tenantId: "tenant-1", consultationId: "missing", lines: [{ drugName: "x", dosage: "x", frequency: "x" }], prescribedByUserId: "doctor-1" })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    function existingPrescription(overrides: Record<string, unknown> = {}) {
      return {
        _id: "prescription:p1",
        _rev: "2-a",
        id: "p1",
        type: "prescription",
        tenantId: "tenant-1",
        consultationId: "c1",
        patientId: "patient-1",
        lines: [
          { drugName: "Kardegic", dosage: "75 mg", frequency: "1/j", durationDays: 30, quantity: "1 boîte", dispenseStatus: "en_attente" },
          { drugName: "Tahor", dosage: "10 mg", frequency: "1/soir", durationDays: 30, quantity: "1 boîte", dispenseStatus: "en_attente" },
        ],
        prescribedByUserId: "doctor-1",
        prescribedAt: "2026-08-27T09:00:00.000Z",
        status: "en_attente",
        dispensedByUserId: null,
        dispensedAt: null,
        createdAt: "2026-08-27T09:00:00.000Z",
        ...overrides,
      };
    }

    it("sets status to delivre and stamps dispensedAt when every line is delivered", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const lines = existing.lines.map((line: any) => ({ ...line, dispenseStatus: "delivre" }));
      const result = await repository.update("p1", "tenant-1", { lines }, "pharmacist-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "delivre", dispensedByUserId: "pharmacist-1", dispensedAt: expect.any(String) })
      );
      expect(result.status).toBe("delivre");
    });

    it("sets status to delivre_partiel when only some lines are delivered", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const lines = [
        { ...existing.lines[0], dispenseStatus: "delivre" },
        { ...existing.lines[1], dispenseStatus: "indisponible" },
      ];
      const result = await repository.update("p1", "tenant-1", { lines }, "pharmacist-1");

      expect(result.status).toBe("delivre_partiel");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "delivre_partiel", dispensedByUserId: "pharmacist-1" }));
    });

    it("leaves status untouched and dispensedAt null when no line is delivered yet", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const lines = [
        { ...existing.lines[0], dispenseStatus: "indisponible" },
        { ...existing.lines[1] },
      ];
      const result = await repository.update("p1", "tenant-1", { lines }, "pharmacist-1");

      expect(result.status).toBe("en_attente");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ dispensedByUserId: null, dispensedAt: null }));
    });

    it("respects an explicit status override regardless of line state", async () => {
      const existing = existingPrescription();
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const result = await repository.update("p1", "tenant-1", { status: "annule" }, "pharmacist-1");

      expect(result.status).toBe("annule");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "annule", dispensedByUserId: null }));
    });

    it("throws NotFoundException when the prescription does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new PrescriptionsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await expect(repository.update("missing", "tenant-1", { status: "delivre" }, "pharmacist-1")).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("filters by consultationId and status when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { consultationId: "c1", status: "en_attente" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "prescription", tenantId: "tenant-1", consultationId: "c1", status: "en_attente" }) })
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/prescriptions/prescriptions.repository.spec.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `PrescriptionsRepository`**

```ts
// backend/src/modules/prescriptions/prescriptions.repository.ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/prescriptions/prescriptions.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: `PrescriptionsRepositoryModule`**

```ts
// backend/src/modules/prescriptions/prescriptions.repository.module.ts
import { Module } from "@nestjs/common";
import { PrescriptionsRepository } from "./prescriptions.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";

@Module({
  imports: [CouchDBModule, ConsultationsRepositoryModule],
  providers: [PrescriptionsRepository],
  exports: [PrescriptionsRepository],
})
export class PrescriptionsRepositoryModule {}
```

- [ ] **Step 6: Write the failing policy tests**

```ts
// backend/src/modules/prescriptions/prescriptions.policy.spec.ts
import { PrescriptionsPolicy } from "./prescriptions.policy";

function policyFor(role: string): PrescriptionsPolicy {
  const policy = new PrescriptionsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("PrescriptionsPolicy", () => {
  it.each(["admin", "manager", "medecin", "infirmier", "pharmacien"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["accueil", "cashier", "laboratoire"])("%s cannot view", (role) => {
    expect(policyFor(role).view()).toBe(false);
  });

  it.each(["admin", "manager", "medecin"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["infirmier", "pharmacien", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager", "pharmacien"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "cashier"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });
});
```

- [ ] **Step 7: Run the tests to verify they fail, then implement `PrescriptionsPolicy`**

```ts
// backend/src/modules/prescriptions/prescriptions.policy.ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class PrescriptionsPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isPharmacien();
  }

  create(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }

  update(): boolean {
    return this.isAdmin() || this.isManager() || this.isPharmacien();
  }
}
```

Run: `cd backend && npx jest src/modules/prescriptions/prescriptions.policy.spec.ts` → PASS.

- [ ] **Step 8: DTOs**

```ts
// backend/src/modules/prescriptions/dto/create-prescription.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsNumber, IsArray, ArrayMinSize, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class PrescriptionLineDto {
  @IsString() @IsNotEmpty() drugName: string;
  @IsString() @IsNotEmpty() dosage: string;
  @IsString() @IsNotEmpty() frequency: string;
  @IsNumber() @IsOptional() durationDays?: number | null;
  @IsString() @IsOptional() quantity?: string | null;
}

export class CreatePrescriptionDto {
  @IsUUID() @IsNotEmpty() consultationId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PrescriptionLineDto) lines: PrescriptionLineDto[];
}
```

```ts
// backend/src/modules/prescriptions/dto/update-prescription.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, IsArray, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class PrescriptionLineUpdateDto {
  @IsString() @IsNotEmpty() drugName: string;
  @IsString() @IsNotEmpty() dosage: string;
  @IsString() @IsNotEmpty() frequency: string;
  @IsNumber() @IsOptional() durationDays?: number | null;
  @IsString() @IsOptional() quantity?: string | null;
  @IsIn(["en_attente", "delivre", "indisponible"]) dispenseStatus: string;
}

export class UpdatePrescriptionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => PrescriptionLineUpdateDto) @IsOptional() lines?: PrescriptionLineUpdateDto[];
  @IsIn(["en_attente", "prepare", "delivre", "delivre_partiel", "annule"]) @IsOptional() status?: string;
}
```

- [ ] **Step 9: `PrescriptionsService`**

```ts
// backend/src/modules/prescriptions/prescriptions.service.ts
import { Injectable } from "@nestjs/common";
import type { InsertPrescription } from "@shared/schema";
import { PrescriptionsRepository, type PrescriptionFilters, type UpdatePrescriptionData } from "./prescriptions.repository";

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prescriptionsRepository: PrescriptionsRepository) {}

  findByTenant(tenantId: string, filters?: PrescriptionFilters) {
    return this.prescriptionsRepository.findByTenant(tenantId, filters);
  }

  findById(id: string, tenantId: string) {
    return this.prescriptionsRepository.findById(id, tenantId);
  }

  create(data: InsertPrescription) {
    return this.prescriptionsRepository.create(data);
  }

  update(id: string, tenantId: string, data: UpdatePrescriptionData, actorUserId: string) {
    return this.prescriptionsRepository.update(id, tenantId, data, actorUserId);
  }
}
```

- [ ] **Step 10: `PrescriptionsController`**

```ts
// backend/src/modules/prescriptions/prescriptions.controller.ts
import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { PrescriptionsService } from "./prescriptions.service";
import { CreatePrescriptionDto } from "./dto/create-prescription.dto";
import { UpdatePrescriptionDto } from "./dto/update-prescription.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { PrescriptionsPolicy } from "./prescriptions.policy";

@Controller("api/prescriptions")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get(":tenantId")
  @CheckPolicy(PrescriptionsPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("consultationId") consultationId?: string,
    @Query("status") status?: string,
    @Request() req?: any
  ) {
    return this.prescriptionsService.findByTenant(this.tenantId(req, tenantId), { consultationId, status });
  }

  @Get("detail/:id")
  @CheckPolicy(PrescriptionsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.prescriptionsService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(PrescriptionsPolicy, "create")
  async create(@Body() dto: CreatePrescriptionDto, @Request() req: any) {
    return this.prescriptionsService.create({ ...dto, tenantId: this.tenantId(req), prescribedByUserId: req.user.id } as any);
  }

  @Put(":id")
  @CheckPolicy(PrescriptionsPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdatePrescriptionDto, @Request() req: any) {
    return this.prescriptionsService.update(id, this.tenantId(req), dto as any, req.user.id);
  }

  private tenantId(req: any, legacyTenantId?: string): string {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("Authenticated tenant is required");
    if (legacyTenantId && legacyTenantId !== tenantId) {
      throw new ForbiddenException("Tenant does not match authenticated user");
    }
    return tenantId;
  }
}
```

- [ ] **Step 11: `PrescriptionsModule`**

```ts
// backend/src/modules/prescriptions/prescriptions.module.ts
import { Module } from "@nestjs/common";
import { PrescriptionsController } from "./prescriptions.controller";
import { PrescriptionsService } from "./prescriptions.service";
import { PrescriptionsPolicy } from "./prescriptions.policy";
import { AuthModule } from "../auth/auth.module";
import { PrescriptionsRepositoryModule } from "./prescriptions.repository.module";

@Module({
  imports: [AuthModule, PrescriptionsRepositoryModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService, PrescriptionsPolicy],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
```

- [ ] **Step 12: Register in `app.module.ts`**

```ts
import { PrescriptionsModule } from "./modules/prescriptions/prescriptions.module";
```

Add `PrescriptionsModule` to the `imports` array, right after `LabOrdersModule`.

- [ ] **Step 13: Typecheck and boot-check**

Run: `cd backend && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add backend/src/modules/prescriptions backend/src/app.module.ts
git commit -m "feat: add prescriptions backend module (create, update, list, detail)"
```

---

### Task 4: Extend `computeConsultationJourney` for exams/prescription steps

**Files:**
- Modify: `frontend/src/lib/consultationJourney.ts`
- Modify: `frontend/src/lib/consultationJourney.spec.ts`

**Interfaces:**
- Consumes: `LabOrder`, `Prescription` (Task 1).
- Produces: `computeConsultationJourney(patient, consultation, queueItem, labOrders, prescriptions): JourneyStep[]` (signature extended with two new params) — consumed by Task 14 (`ConsultationHub`).

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/consultationJourney.spec.ts` (the existing three tests must also be updated to pass the two new arguments — see Step 2):

```ts
  it("marks step 6 current (not completed) while a LabOrder is still open, even though the consultation isn't terminee", () => {
    const c = consultation({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z" });
    const labOrders: LabOrder[] = [
      { id: "lo1", tenantId: "t1", consultationId: "c1", patientId: "p1", examLines: [{ examName: "NFS", resultText: null }], requestedByUserId: "doctor-1", requestedAt: "2026-08-27T10:40:00.000Z", priority: "normal", clinicalContext: null, specialInstructions: null, status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T10:41:00.000Z", validatedByUserId: null, validatedAt: null, problemReport: null, createdAt: "2026-08-27T10:40:00.000Z", updatedAt: "2026-08-27T10:41:00.000Z" } as any,
    ];

    const steps = computeConsultationJourney(patient(), c, undefined, labOrders, []);

    expect(steps[5]).toMatchObject({ key: "exams", state: "current" });
    expect(steps[6]).toMatchObject({ key: "prescription", state: "not_started" });
  });

  it("marks step 6 completed once every LabOrder for this consultation is termine", () => {
    const c = consultation({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z" });
    const labOrders: LabOrder[] = [
      { id: "lo1", tenantId: "t1", consultationId: "c1", patientId: "p1", examLines: [], requestedByUserId: "doctor-1", requestedAt: "2026-08-27T10:40:00.000Z", priority: "normal", clinicalContext: null, specialInstructions: null, status: "termine", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T10:41:00.000Z", validatedByUserId: "labtech-1", validatedAt: "2026-08-27T11:00:00.000Z", problemReport: null, createdAt: "2026-08-27T10:40:00.000Z", updatedAt: "2026-08-27T11:00:00.000Z" } as any,
    ];

    const steps = computeConsultationJourney(patient(), c, undefined, labOrders, []);

    expect(steps[5]).toMatchObject({ key: "exams", state: "completed" });
    expect(steps[6]).toMatchObject({ key: "prescription", state: "current" });
  });

  it("marks steps 6 and 7 completed when none were ever created and the consultation is terminee", () => {
    const c = consultation({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z", status: "terminee" });

    const steps = computeConsultationJourney(patient(), c, undefined, [], []);

    expect(steps[5]).toMatchObject({ key: "exams", state: "completed" });
    expect(steps[6]).toMatchObject({ key: "prescription", state: "completed" });
    expect(steps[7]).toMatchObject({ key: "carePlan", state: "current" });
  });

  it("marks step 7 completed once the Prescription is delivre_partiel", () => {
    const c = consultation({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z" });
    const prescriptions: Prescription[] = [
      { id: "pr1", tenantId: "t1", consultationId: "c1", patientId: "p1", lines: [], prescribedByUserId: "doctor-1", prescribedAt: "2026-08-27T10:40:00.000Z", status: "delivre_partiel", dispensedByUserId: "pharmacist-1", dispensedAt: "2026-08-27T11:00:00.000Z", createdAt: "2026-08-27T10:40:00.000Z", updatedAt: "2026-08-27T11:00:00.000Z" } as any,
    ];

    const steps = computeConsultationJourney(patient(), c, undefined, [], prescriptions);

    expect(steps[6]).toMatchObject({ key: "prescription", state: "completed" });
  });
```

Update the file's imports to add `LabOrder, Prescription` to the `@shared/schema` import, and update the three pre-existing `computeConsultationJourney(...)` calls to pass `[], []` as the two new trailing arguments (they test steps unrelated to exams/prescription and don't need real data there).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/consultationJourney.spec.ts`
Expected: FAIL — `computeConsultationJourney` doesn't accept the new arguments yet (TS error) and steps 6/7 are always `not_started`/never `completed` from data.

- [ ] **Step 3: Update `computeConsultationJourney`**

```ts
// frontend/src/lib/consultationJourney.ts
import type { Consultation, LabOrder, Patient, Prescription, QueueItem } from "@shared/schema";

export type JourneyStepState = "completed" | "current" | "not_started";

export interface JourneyStep {
  key: string;
  state: JourneyStepState;
  occurredAt: Date | null;
}

const STEP_KEYS = [
  "patientIdentified",
  "consultationRegistered",
  "queue",
  "preConsultation",
  "medicalConsultation",
  "exams",
  "prescription",
  "carePlan",
  "closure",
] as const;

const RESOLVED_LAB_ORDER_STATUSES = new Set(["termine", "annule"]);
const RESOLVED_PRESCRIPTION_STATUSES = new Set(["delivre", "delivre_partiel", "annule"]);

export function computeConsultationJourney(
  patient: Patient,
  consultation: Consultation,
  queueItem: QueueItem | undefined,
  labOrders: LabOrder[],
  prescriptions: Prescription[]
): JourneyStep[] {
  const arrivalEvent = queueItem?.timeline.find((e) => e.eventType === "arrived" || e.eventType === "registered");
  const consultationClosed = consultation.status === "terminee";

  const examsResolved =
    labOrders.length > 0 ? labOrders.every((order) => RESOLVED_LAB_ORDER_STATUSES.has(order.status)) : consultationClosed;
  const examsOccurredAt = examsResolved ? mostRecentDate(labOrders.map((o) => o.updatedAt)) ?? (consultationClosed ? new Date(consultation.updatedAt) : null) : null;

  const prescriptionResolved =
    prescriptions.length > 0 ? prescriptions.every((p) => RESOLVED_PRESCRIPTION_STATUSES.has(p.status)) : consultationClosed;
  const prescriptionOccurredAt = prescriptionResolved
    ? mostRecentDate(prescriptions.map((p) => p.updatedAt)) ?? (consultationClosed ? new Date(consultation.updatedAt) : null)
    : null;

  const occurredAtByKey: Record<(typeof STEP_KEYS)[number], Date | null> = {
    patientIdentified: new Date(patient.createdAt),
    consultationRegistered: new Date(consultation.createdAt),
    queue: arrivalEvent ? new Date(arrivalEvent.occurredAt) : null,
    preConsultation: consultation.vitalsRecordedAt ? new Date(consultation.vitalsRecordedAt) : null,
    medicalConsultation: consultation.medicalConsultationSavedAt ? new Date(consultation.medicalConsultationSavedAt) : null,
    exams: examsResolved ? (examsOccurredAt ?? new Date(consultation.updatedAt)) : null,
    prescription: prescriptionResolved ? (prescriptionOccurredAt ?? new Date(consultation.updatedAt)) : null,
    carePlan: null,
    closure: null,
  };

  const steps: JourneyStep[] = [];
  let currentAssigned = false;
  for (const key of STEP_KEYS) {
    const occurredAt = occurredAtByKey[key];
    if (occurredAt) {
      steps.push({ key, state: "completed", occurredAt });
      continue;
    }
    if (!currentAssigned) {
      steps.push({ key, state: "current", occurredAt: null });
      currentAssigned = true;
      continue;
    }
    steps.push({ key, state: "not_started", occurredAt: null });
  }
  return steps;
}

function mostRecentDate(values: (Date | string)[]): Date | null {
  if (values.length === 0) return null;
  return values.map((v) => new Date(v)).reduce((latest, current) => (current > latest ? current : latest));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/consultationJourney.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/consultationJourney.ts frontend/src/lib/consultationJourney.spec.ts
git commit -m "feat: derive exams/prescription hub steps from LabOrder/Prescription"
```

---

### Task 5: Frontend `LabOrdersPolicy`/`PrescriptionsPolicy`

**Files:**
- Create: `frontend/src/lib/policies/labOrders.policy.ts`
- Create: `frontend/src/lib/policies/prescriptions.policy.ts`

**Interfaces:**
- Consumes: `BasePolicy` (existing, `frontend/src/lib/policies/base.policy.ts`).
- Produces: `LabOrdersPolicy` (`canView`/`canCreate`/`canUpdate`), `PrescriptionsPolicy` (`canView`/`canCreate`/`canUpdate`) — consumed by Task 7-12 (pages) and Task 14 (Sidebar).

No dedicated spec file — frontend policy classes have no test coverage anywhere in this codebase today (`consultations.policy.ts`/`queue.policy.ts` are both untested; only the shared `base.policy.test.ts` tests the role helpers), so this task doesn't introduce a new pattern.

- [ ] **Step 1: `LabOrdersPolicy`**

```ts
// frontend/src/lib/policies/labOrders.policy.ts
import { BasePolicy } from "./base.policy";

export class LabOrdersPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isLaboratoire();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isLaboratoire();
  }
}
```

- [ ] **Step 2: `PrescriptionsPolicy`**

```ts
// frontend/src/lib/policies/prescriptions.policy.ts
import { BasePolicy } from "./base.policy";

export class PrescriptionsPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier() || this.isPharmacien();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isPharmacien();
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/policies/labOrders.policy.ts frontend/src/lib/policies/prescriptions.policy.ts
git commit -m "feat: add frontend LabOrdersPolicy and PrescriptionsPolicy"
```

---

### Task 6: i18n — `labOrders.ts` / `prescriptions.ts`

**Files:**
- Create: `frontend/src/lib/i18n/labOrders.ts`
- Create: `frontend/src/lib/i18n/prescriptions.ts`
- Modify: `frontend/src/lib/i18n/index.ts`

**Interfaces:**
- Consumes: `TranslationSection` (existing, `frontend/src/lib/i18n/types.ts`).
- Produces: every `t("...")` key used by Task 7-13.

- [ ] **Step 1: `labOrders.ts`**

```ts
// frontend/src/lib/i18n/labOrders.ts
import type { TranslationSection } from "./types";

export const labOrders: TranslationSection = {
  en: {
    laboratoireTitle: "Laboratory",
    laboratoireSubtitle: "Manage sample collection and analysis validation.",
    newLabOrder: "New Order",
    labOrderStatusDemande: "New",
    labOrderStatusEnCours: "In Progress",
    labOrderStatusAValider: "To Validate",
    labOrderStatusTermine: "Completed",
    labOrderStatusProblemeSignale: "Problem Reported",
    labOrderStatusAnnule: "Cancelled",
    statusAll: "All",
    noLabOrders: "No lab orders yet.",
    newLabOrderTitle: "New Lab Order",
    newLabOrderSubtitle: "Order one or more exams for this consultation.",
    examTypesRequested: "Exams Requested",
    newExamNamePlaceholder: "e.g. NFS, Créatinine",
    addExamLine: "Add",
    priorityLevelLabel: "Priority Level",
    clinicalContextLabel: "Clinical Context / Indication",
    specialInstructionsLabel: "Special Instructions",
    sendToLab: "Send to Laboratory",
    labOrderCreatedSuccessfully: "Lab order sent",
    failedToCreateLabOrder: "Failed to create the lab order",
    labOrderDetailTitle: "Lab Order",
    examResultsSection: "Exam Results",
    resultPlaceholder: "Enter the result...",
    takeInCharge: "Take In Charge",
    validateResults: "Validate Results",
    reportProblem: "Report a Problem",
    problemReportLabel: "Problem Description",
    problemReportPlaceholder: "Describe the issue...",
    labOrderUpdatedSuccessfully: "Lab order updated",
    failedToUpdateLabOrder: "Failed to update the lab order",
    requestedByLabel: "Requested By",
    requestedAtLabel: "Requested At",
    viewLabel: "View",
    statusColumnLabel: "Status",
    printLabOrder: "Print",
  },
  fr: {
    laboratoireTitle: "Laboratoire",
    laboratoireSubtitle: "Gérez les prélèvements et validations d'analyses.",
    newLabOrder: "Nouvelle demande",
    labOrderStatusDemande: "Nouvelle",
    labOrderStatusEnCours: "En cours",
    labOrderStatusAValider: "À valider",
    labOrderStatusTermine: "Terminée",
    labOrderStatusProblemeSignale: "Problème signalé",
    labOrderStatusAnnule: "Annulée",
    statusAll: "Tous",
    noLabOrders: "Aucune demande d'analyse pour le moment.",
    newLabOrderTitle: "Nouvelle demande d'analyse",
    newLabOrderSubtitle: "Demandez un ou plusieurs examens pour cette consultation.",
    examTypesRequested: "Examens demandés",
    newExamNamePlaceholder: "ex. NFS, Créatinine",
    addExamLine: "Ajouter",
    priorityLevelLabel: "Niveau de priorité",
    clinicalContextLabel: "Contexte clinique / Indication",
    specialInstructionsLabel: "Instructions particulières",
    sendToLab: "Envoyer au laboratoire",
    labOrderCreatedSuccessfully: "Demande envoyée au laboratoire",
    failedToCreateLabOrder: "Échec de la création de la demande",
    labOrderDetailTitle: "Demande d'analyses",
    examResultsSection: "Résultats des examens",
    resultPlaceholder: "Saisir le résultat...",
    takeInCharge: "Prendre en charge",
    validateResults: "Valider les résultats",
    reportProblem: "Signaler un problème",
    problemReportLabel: "Description du problème",
    problemReportPlaceholder: "Décrivez le problème...",
    labOrderUpdatedSuccessfully: "Demande mise à jour",
    failedToUpdateLabOrder: "Échec de la mise à jour de la demande",
    requestedByLabel: "Demandé par",
    requestedAtLabel: "Demandé le",
    viewLabel: "Voir",
    statusColumnLabel: "Statut",
    printLabOrder: "Imprimer",
  },
};
```

- [ ] **Step 2: `prescriptions.ts`**

```ts
// frontend/src/lib/i18n/prescriptions.ts
import type { TranslationSection } from "./types";

export const prescriptions: TranslationSection = {
  en: {
    pharmacieTitle: "Pharmacy",
    pharmacieSubtitle: "Track prescriptions awaiting dispensing.",
    ordonnancesEnAttenteTitle: "Pending Prescriptions",
    noPrescriptions: "No prescriptions yet.",
    prescriptionStatusEnAttente: "Pending",
    prescriptionStatusPrepare: "Prepared",
    prescriptionStatusDelivre: "Delivered",
    prescriptionStatusDelivrePartiel: "Partially Delivered",
    prescriptionStatusAnnule: "Cancelled",
    dispenseStatusEnAttente: "Pending",
    dispenseStatusDelivre: "Delivered",
    dispenseStatusIndisponible: "Unavailable",
    prescriptionDetailTitle: "Prescription",
    medicationsPrescribedSection: "Prescribed Medications",
    drugNameLabel: "Drug / INN",
    dosageLabel: "Dosage",
    frequencyLabel: "Frequency",
    durationDaysLabel: "Duration (days)",
    quantityLabel: "Quantity",
    addMedicationLine: "Add",
    deliverPrescription: "Deliver Prescription",
    partialDelivery: "Partial Delivery",
    prescriptionCreatedSuccessfully: "Prescription line added",
    failedToCreatePrescription: "Failed to add the prescription",
    prescriptionUpdatedSuccessfully: "Prescription updated",
    failedToUpdatePrescription: "Failed to update the prescription",
    printTicket: "Print Ticket",
    prescribedByLabel: "Prescribed By",
    viewLabel: "View",
    statusColumnLabel: "Status",
  },
  fr: {
    pharmacieTitle: "Pharmacie",
    pharmacieSubtitle: "Suivez les ordonnances en attente de délivrance.",
    ordonnancesEnAttenteTitle: "Ordonnances en attente",
    noPrescriptions: "Aucune ordonnance pour le moment.",
    prescriptionStatusEnAttente: "En attente",
    prescriptionStatusPrepare: "Préparée",
    prescriptionStatusDelivre: "Délivrée",
    prescriptionStatusDelivrePartiel: "Partiellement délivrée",
    prescriptionStatusAnnule: "Annulée",
    dispenseStatusEnAttente: "En attente",
    dispenseStatusDelivre: "Délivré",
    dispenseStatusIndisponible: "Indisponible",
    prescriptionDetailTitle: "Ordonnance",
    medicationsPrescribedSection: "Médicaments prescrits",
    drugNameLabel: "Nom / DCI",
    dosageLabel: "Dosage",
    frequencyLabel: "Posologie",
    durationDaysLabel: "Durée (jours)",
    quantityLabel: "Qté",
    addMedicationLine: "Ajouter",
    deliverPrescription: "Délivrer ordonnance",
    partialDelivery: "Délivrance partielle",
    prescriptionCreatedSuccessfully: "Ligne de prescription ajoutée",
    failedToCreatePrescription: "Échec de l'ajout de la prescription",
    prescriptionUpdatedSuccessfully: "Ordonnance mise à jour",
    failedToUpdatePrescription: "Échec de la mise à jour de l'ordonnance",
    printTicket: "Imprimer ticket",
    prescribedByLabel: "Prescrit par",
    viewLabel: "Voir",
    statusColumnLabel: "Statut",
  },
};
```

- [ ] **Step 3: Register both in `frontend/src/lib/i18n/index.ts`**

Add imports:

```ts
import { labOrders } from "./labOrders";
import { prescriptions } from "./prescriptions";
```

Add both to the `sections` array (after `queue`):

```ts
const sections: TranslationSection[] = [
  navigation,
  dashboard,
  validation,
  lan,
  messages,
  audit,
  auth,
  settings,
  formatting,
  setup,
  patients,
  consultations,
  queue,
  labOrders,
  prescriptions,
];
```

- [ ] **Step 4: Run the i18n completeness test**

Run: `cd frontend && npx vitest run src/lib/i18nCompleteness.test.ts`
Expected: PASS (both `en`/`fr` blocks have identical key sets).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/i18n/labOrders.ts frontend/src/lib/i18n/prescriptions.ts frontend/src/lib/i18n/index.ts
git commit -m "feat: add labOrders and prescriptions i18n domains"
```

---

### Task 7: `/laboratoire` — worklist index page

**Files:**
- Create: `frontend/src/pages/laboratoire/index.tsx`

**Interfaces:**
- Consumes: `LabOrder`, `LabOrderStatus` (`@shared/schema`), `GET /api/lab-orders/:tenantId?status=`, `LabOrdersPolicy` (Task 5), i18n keys from Task 6.
- Produces: default-exported `LaboratoireIndex` component — consumed by Task 12 (`App.tsx` route).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/laboratoire/index.tsx
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { LabOrder, LabOrderStatus } from "@shared/schema";

function statusVariant(status: LabOrderStatus): "default" | "secondary" | "destructive" {
  if (status === "annule" || status === "probleme_signale") return "destructive";
  if (status === "termine") return "secondary";
  return "default";
}

function statusLabelKey(status: string): string {
  return "labOrderStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const STATUS_FILTERS: (LabOrderStatus | "all")[] = ["all", "demande", "en_cours", "a_valider", "termine"];

export default function LaboratoireIndex() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState<LabOrderStatus | "all">("all");

  const statusQuery = statusFilter !== "all" ? `?status=${statusFilter}` : "";
  const { data: labOrders = [], isLoading } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}${statusQuery}`],
    enabled: !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  const counts = {
    demande: labOrders.filter((o) => o.status === "demande").length,
    en_cours: labOrders.filter((o) => o.status === "en_cours").length,
    a_valider: labOrders.filter((o) => o.status === "a_valider").length,
    termine: labOrders.filter((o) => o.status === "termine").length,
  };

  return (
    <div className="space-y-6" data-testid="laboratoire-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("laboratoireTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("laboratoireSubtitle")}</p>
        </div>
        <PolicyGuard policy={LabOrdersPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setLocation("/laboratoire/new")} data-testid="button-new-lab-order">
            <Plus className="w-4 h-4 mr-2" />
            {t("newLabOrder")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusDemande")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-demande">{counts.demande}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusEnCours")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-en-cours">{counts.en_cours}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusAValider")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-a-valider">{counts.a_valider}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("labOrderStatusTermine")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-termine">{counts.termine}</p>
        </Card>
      </div>

      <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as LabOrderStatus | "all")}>
        <SelectTrigger className="w-56" data-testid="select-status-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_FILTERS.map((status) => (
            <SelectItem key={status} value={status}>
              {status === "all" ? t("statusAll") : t(statusLabelKey(status))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : labOrders.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noLabOrders")}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("examTypesRequested")}</TableHead>
              <TableHead>{t("priorityLevelLabel")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {labOrders.map((order) => (
              <TableRow
                key={order.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => setLocation(`/laboratoire/${order.id}`)}
                data-testid={`row-lab-order-${order.id}`}>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {order.examLines.map((line, index) => (
                      <Badge key={index} variant="secondary">{line.examName}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>{t(order.priority === "urgent" ? "priorityUrgent" : "priorityNormal")}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(order.status)}>{t(statusLabelKey(order.status))}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/laboratoire/index.tsx
git commit -m "feat: add /laboratoire worklist index page"
```

---

### Task 8: `/laboratoire/new` — create lab order form

**Files:**
- Create: `frontend/src/pages/laboratoire/new.tsx`

**Interfaces:**
- Consumes: `POST /api/lab-orders`, `Consultation`/`Patient` detail fetch (existing routes), i18n keys from Task 6.
- Produces: default-exported `NewLabOrder` component — consumed by Task 12 (route) and linked from Task 13 (consultation-medicale) and Task 7 (index "+ Nouvelle demande").

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/laboratoire/new.tsx
import React, { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation, Patient } from "@shared/schema";

export default function NewLabOrder() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [searchParams] = useSearchParams();
  const consultationId = searchParams.get("consultationId") ?? "";

  const [examNames, setExamNames] = useState<string[]>([]);
  const [newExamName, setNewExamName] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [clinicalContext, setClinicalContext] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultationId,
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", consultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${consultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultation?.patientId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest(
        "POST",
        "/api/lab-orders",
        { consultationId, examLines: examNames.map((examName) => ({ examName })), priority, clinicalContext, specialInstructions },
        { collection: "lab-orders" }
      );
      return response.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: [`/api/lab-orders`] });
      toast({ title: t("success"), description: t("labOrderCreatedSuccessfully") });
      setLocation(`/laboratoire/${created.id}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateLabOrder"), t("networkRequestFailed"));
    },
  });

  function addExamName() {
    if (!newExamName.trim()) return;
    setExamNames((prev) => [...prev, newExamName.trim()]);
    setNewExamName("");
  }

  if (!consultationId) {
    return <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noLabOrders")}</div>;
  }

  return (
    <div className="space-y-6" data-testid="new-lab-order-page">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("newLabOrderTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("newLabOrderSubtitle")}</p>
      </div>

      {patient && (
        <Card className="p-4">
          <p className="font-semibold text-foreground">{patient.firstName} {patient.lastName}</p>
          <p className="text-sm text-muted-foreground">{patient.dossierNumber ?? t("pendingSync")}</p>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <div>
          <Label>{t("examTypesRequested")}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {examNames.map((name, index) => (
              <Badge key={`${name}-${index}`} variant="secondary" className="gap-1">
                {name}
                <button type="button" onClick={() => setExamNames((prev) => prev.filter((_, i) => i !== index))} aria-label={t("cancel")}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={newExamName}
              onChange={(e) => setNewExamName(e.target.value)}
              placeholder={t("newExamNamePlaceholder")}
              className="glass-input"
              data-testid="input-new-exam-name"
            />
            <Button type="button" variant="outline" onClick={addExamName} data-testid="button-add-exam-line">
              <Plus className="w-4 h-4 mr-1" />
              {t("addExamLine")}
            </Button>
          </div>
        </div>

        <div>
          <Label>{t("priorityLevelLabel")}</Label>
          <RadioGroup value={priority} onValueChange={(v) => setPriority(v as "normal" | "urgent")} className="flex gap-4 mt-2">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="normal" id="priority-normal" />
              <Label htmlFor="priority-normal">{t("priorityNormal")}</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="urgent" id="priority-urgent" />
              <Label htmlFor="priority-urgent">{t("priorityUrgent")}</Label>
            </div>
          </RadioGroup>
        </div>

        <div>
          <Label htmlFor="clinicalContext">{t("clinicalContextLabel")}</Label>
          <Textarea id="clinicalContext" className="glass-input" value={clinicalContext} onChange={(e) => setClinicalContext(e.target.value)} data-testid="textarea-clinical-context" />
        </div>

        <div>
          <Label htmlFor="specialInstructions">{t("specialInstructionsLabel")}</Label>
          <Textarea id="specialInstructions" className="glass-input" value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} data-testid="textarea-special-instructions" />
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("cancel")}</Button>
        <Button
          className="btn-primary"
          onClick={() => createMutation.mutate()}
          disabled={examNames.length === 0 || createMutation.isPending}
          data-testid="button-send-to-lab">
          {createMutation.isPending ? t("saving") : t("sendToLab")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/laboratoire/new.tsx
git commit -m "feat: add /laboratoire/new lab order creation form"
```

---

### Task 9: `/laboratoire/:id` — lab order detail

**Files:**
- Create: `frontend/src/pages/laboratoire/show.tsx`

**Interfaces:**
- Consumes: `LabOrder` (`@shared/schema`), `GET /api/lab-orders/detail/:id`, `PUT /api/lab-orders/:id`, i18n keys from Task 6.
- Produces: default-exported `LabOrderDetails` component — consumed by Task 12 (route).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/laboratoire/show.tsx
import React, { useState } from "react";
import { ArrowLeft, CheckCircle, ClipboardCheck, AlertTriangle, Printer } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { LabOrder, LabOrderExamLine } from "@shared/schema";

function statusLabelKey(status: string): string {
  return "labOrderStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function LabOrderDetails() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const [examLines, setExamLines] = useState<LabOrderExamLine[] | null>(null);
  const [problemDialogOpen, setProblemDialogOpen] = useState(false);
  const [problemReport, setProblemReport] = useState("");

  const { data: labOrder } = useQuery<LabOrder>({
    queryKey: ["/api/lab-orders/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/lab-orders/detail/${id}`, { credentials: "include" });
      return response.json();
    },
  });

  if (labOrder && examLines === null) {
    setExamLines(labOrder.examLines);
  }

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const response = await offlineApiRequest("PUT", `/api/lab-orders/${id}`, data, { collection: "lab-orders", entityId: id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders/detail", id] });
      toast({ title: t("success"), description: t("labOrderUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateLabOrder"), t("networkRequestFailed"));
    },
  });

  function updateResult(index: number, resultText: string) {
    setExamLines((prev) => (prev ? prev.map((line, i) => (i === index ? { ...line, resultText } : line)) : prev));
  }

  if (!labOrder || !examLines) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="lab-order-detail-page">
      <Button variant="ghost" onClick={() => setLocation("/laboratoire")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("laboratoireTitle")}
      </Button>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("labOrderDetailTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("requestedAtLabel")}: {new Date(labOrder.requestedAt).toLocaleString()}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{t(statusLabelKey(labOrder.status))}</Badge>
          <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="button-print-lab-order">
            <Printer className="w-4 h-4 mr-2" />
            {t("printLabOrder")}
          </Button>
        </div>
      </div>

      {labOrder.clinicalContext && (
        <Card className="p-4 space-y-1">
          <p className="text-sm font-medium text-foreground">{t("clinicalContextLabel")}</p>
          <p className="text-sm text-muted-foreground">{labOrder.clinicalContext}</p>
        </Card>
      )}
      {labOrder.specialInstructions && (
        <Card className="p-4 space-y-1">
          <p className="text-sm font-medium text-foreground">{t("specialInstructionsLabel")}</p>
          <p className="text-sm text-muted-foreground">{labOrder.specialInstructions}</p>
        </Card>
      )}

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("examResultsSection")}</h2>
        {examLines.map((line, index) => (
          <div key={index} className="space-y-1">
            <Label>{line.examName}</Label>
            <Textarea
              className="glass-input"
              placeholder={t("resultPlaceholder")}
              value={line.resultText ?? ""}
              onChange={(e) => updateResult(index, e.target.value)}
              disabled={labOrder.status === "termine"}
              data-testid={`textarea-result-${index}`}
            />
          </div>
        ))}
      </Card>

      <PolicyGuard policy={LabOrdersPolicy} action="canUpdate">
        <div className="flex flex-wrap justify-end gap-2">
          {labOrder.status === "demande" && (
            <Button className="btn-primary" onClick={() => updateMutation.mutate({ status: "en_cours" })} disabled={updateMutation.isPending} data-testid="button-take-in-charge">
              <ClipboardCheck className="w-4 h-4 mr-2" />
              {t("takeInCharge")}
            </Button>
          )}
          {(labOrder.status === "en_cours" || labOrder.status === "a_valider") && (
            <Button
              className="btn-primary"
              onClick={() => updateMutation.mutate({ status: "termine", examLines })}
              disabled={updateMutation.isPending}
              data-testid="button-validate-results">
              <CheckCircle className="w-4 h-4 mr-2" />
              {t("validateResults")}
            </Button>
          )}
          {labOrder.status !== "termine" && labOrder.status !== "annule" && (
            <Button variant="outline" onClick={() => setProblemDialogOpen(true)} data-testid="button-report-problem">
              <AlertTriangle className="w-4 h-4 mr-2" />
              {t("reportProblem")}
            </Button>
          )}
        </div>
      </PolicyGuard>

      <Dialog open={problemDialogOpen} onOpenChange={setProblemDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("reportProblem")}</DialogTitle>
          </DialogHeader>
          <Textarea
            className="glass-input"
            placeholder={t("problemReportPlaceholder")}
            value={problemReport}
            onChange={(e) => setProblemReport(e.target.value)}
            data-testid="textarea-problem-report"
          />
          <DialogFooter>
            <Button
              variant="destructive"
              onClick={() => {
                updateMutation.mutate({ status: "probleme_signale", problemReport });
                setProblemDialogOpen(false);
              }}
              data-testid="button-confirm-problem-report">
              {t("reportProblem")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/laboratoire/show.tsx
git commit -m "feat: add /laboratoire/:id lab order detail page"
```

---

### Task 10: `/pharmacie` — worklist index page

**Files:**
- Create: `frontend/src/pages/pharmacie/index.tsx`

**Interfaces:**
- Consumes: `Prescription`, `PrescriptionStatus` (`@shared/schema`), `GET /api/prescriptions/:tenantId`, i18n keys from Task 6.
- Produces: default-exported `PharmacieIndex` component — consumed by Task 12 (route).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/pharmacie/index.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import type { Prescription, PrescriptionStatus } from "@shared/schema";

function statusVariant(status: PrescriptionStatus): "default" | "secondary" | "destructive" {
  if (status === "annule") return "destructive";
  if (status === "delivre") return "secondary";
  return "default";
}

function statusLabelKey(status: string): string {
  return "prescriptionStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function PharmacieIndex() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();

  const { data: prescriptions = [], isLoading } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}`],
    enabled: !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  const pending = prescriptions.filter((p) => p.status === "en_attente" || p.status === "prepare");
  const delivered = prescriptions.filter((p) => p.status === "delivre" || p.status === "delivre_partiel");

  return (
    <div className="space-y-6" data-testid="pharmacie-page">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("pharmacieTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("pharmacieSubtitle")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("prescriptionStatusEnAttente")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-en-attente">{pending.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("prescriptionStatusDelivre")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-delivre">{delivered.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{t("ordonnancesEnAttenteTitle")}</p>
          <p className="text-2xl font-bold text-foreground" data-testid="stat-total">{prescriptions.length}</p>
        </Card>
      </div>

      <h2 className="font-semibold text-foreground">{t("ordonnancesEnAttenteTitle")}</h2>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : prescriptions.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noPrescriptions")}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("medicationsPrescribedSection")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prescriptions.map((prescription) => (
              <TableRow
                key={prescription.id}
                className="cursor-pointer hover:bg-accent/50"
                onClick={() => setLocation(`/pharmacie/${prescription.id}`)}
                data-testid={`row-prescription-${prescription.id}`}>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {prescription.lines.map((line, index) => (
                      <Badge key={index} variant="secondary">{line.drugName}</Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(prescription.status)}>{t(statusLabelKey(prescription.status))}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/pharmacie/index.tsx
git commit -m "feat: add /pharmacie worklist index page"
```

---

### Task 11: `/pharmacie/:id` — prescription detail

**Files:**
- Create: `frontend/src/pages/pharmacie/show.tsx`

**Interfaces:**
- Consumes: `Prescription`, `PrescriptionLine`, `DispenseStatus` (`@shared/schema`), `GET /api/prescriptions/detail/:id`, `PUT /api/prescriptions/:id`, i18n keys from Task 6.
- Produces: default-exported `PrescriptionDetails` component — consumed by Task 12 (route).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/pharmacie/show.tsx
import React, { useState } from "react";
import { ArrowLeft, CheckCircle, ListChecks, Printer } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { PrescriptionsPolicy } from "@/lib/policies/prescriptions.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { DispenseStatus, Prescription, PrescriptionLine } from "@shared/schema";

function statusLabelKey(status: string): string {
  return "prescriptionStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function dispenseStatusLabelKey(status: string): string {
  return "dispenseStatus" + status[0].toUpperCase() + status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default function PrescriptionDetails() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();

  const [partialDialogOpen, setPartialDialogOpen] = useState(false);
  const [draftLines, setDraftLines] = useState<PrescriptionLine[] | null>(null);

  const { data: prescription } = useQuery<Prescription>({
    queryKey: ["/api/prescriptions/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/prescriptions/detail/${id}`, { credentials: "include" });
      return response.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (lines: PrescriptionLine[]) => {
      const response = await offlineApiRequest("PUT", `/api/prescriptions/${id}`, { lines }, { collection: "prescriptions", entityId: id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prescriptions/detail", id] });
      toast({ title: t("success"), description: t("prescriptionUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdatePrescription"), t("networkRequestFailed"));
    },
  });

  function openPartialDelivery() {
    if (!prescription) return;
    setDraftLines(prescription.lines);
    setPartialDialogOpen(true);
  }

  function updateDraftLine(index: number, dispenseStatus: DispenseStatus) {
    setDraftLines((prev) => (prev ? prev.map((line, i) => (i === index ? { ...line, dispenseStatus } : line)) : prev));
  }

  if (!prescription) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="prescription-detail-page">
      <Button variant="ghost" onClick={() => setLocation("/pharmacie")}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("pharmacieTitle")}
      </Button>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-foreground">{t("prescriptionDetailTitle")}</h1>
        <Badge>{t(statusLabelKey(prescription.status))}</Badge>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="p-4">
          <h2 className="font-semibold text-foreground">{t("medicationsPrescribedSection")}</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("drugNameLabel")}</TableHead>
              <TableHead>{t("dosageLabel")}</TableHead>
              <TableHead>{t("frequencyLabel")}</TableHead>
              <TableHead>{t("durationDaysLabel")}</TableHead>
              <TableHead>{t("quantityLabel")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {prescription.lines.map((line, index) => (
              <TableRow key={index} data-testid={`row-prescription-line-${index}`}>
                <TableCell>{line.drugName}</TableCell>
                <TableCell>{line.dosage}</TableCell>
                <TableCell>{line.frequency}</TableCell>
                <TableCell>{line.durationDays ?? "—"}</TableCell>
                <TableCell>{line.quantity ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={line.dispenseStatus === "indisponible" ? "destructive" : line.dispenseStatus === "delivre" ? "secondary" : "default"}>
                    {t(dispenseStatusLabelKey(line.dispenseStatus))}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={() => window.print()} data-testid="button-print-ticket">
          <Printer className="w-4 h-4 mr-2" />
          {t("printTicket")}
        </Button>
        <PolicyGuard policy={PrescriptionsPolicy} action="canUpdate">
          <>
            {(prescription.status === "en_attente" || prescription.status === "prepare" || prescription.status === "delivre_partiel") && (
              <>
                <Button variant="outline" onClick={openPartialDelivery} data-testid="button-partial-delivery">
                  <ListChecks className="w-4 h-4 mr-2" />
                  {t("partialDelivery")}
                </Button>
                <Button
                  className="btn-primary"
                  onClick={() => updateMutation.mutate(prescription.lines.map((line) => ({ ...line, dispenseStatus: "delivre" as const })))}
                  disabled={updateMutation.isPending}
                  data-testid="button-deliver-prescription">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t("deliverPrescription")}
                </Button>
              </>
            )}
          </>
        </PolicyGuard>
      </div>

      <Dialog open={partialDialogOpen} onOpenChange={setPartialDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("partialDelivery")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {draftLines?.map((line, index) => (
              <div key={index} className="space-y-1">
                <Label>{line.drugName} — {line.dosage}</Label>
                <RadioGroup value={line.dispenseStatus} onValueChange={(v) => updateDraftLine(index, v as DispenseStatus)} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="en_attente" id={`line-${index}-en-attente`} />
                    <Label htmlFor={`line-${index}-en-attente`}>{t("dispenseStatusEnAttente")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="delivre" id={`line-${index}-delivre`} />
                    <Label htmlFor={`line-${index}-delivre`}>{t("dispenseStatusDelivre")}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="indisponible" id={`line-${index}-indisponible`} />
                    <Label htmlFor={`line-${index}-indisponible`}>{t("dispenseStatusIndisponible")}</Label>
                  </div>
                </RadioGroup>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              className="btn-primary"
              onClick={() => {
                if (draftLines) updateMutation.mutate(draftLines);
                setPartialDialogOpen(false);
              }}
              data-testid="button-confirm-partial-delivery">
              {t("partialDelivery")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/pharmacie/show.tsx
git commit -m "feat: add /pharmacie/:id prescription detail page"
```

---

### Task 12: Routes and sidebar navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `LaboratoireIndex`/`NewLabOrder`/`LabOrderDetails` (Tasks 7-9), `PharmacieIndex`/`PrescriptionDetails` (Tasks 10-11), `LabOrdersPolicy`/`PrescriptionsPolicy` (Task 5).
- Produces: `/laboratoire`, `/laboratoire/new`, `/laboratoire/:id`, `/pharmacie`, `/pharmacie/:id` routes; two new sidebar nav items.

- [ ] **Step 1: Register the lazy imports in `App.tsx`**

Add after the `ConsultationMedicaleForm` import:

```ts
const LaboratoireIndex = lazy(() => import("./pages/laboratoire"));
const NewLabOrder = lazy(() => import("./pages/laboratoire/new"));
const LabOrderDetails = lazy(() => import("./pages/laboratoire/show"));
const PharmacieIndex = lazy(() => import("./pages/pharmacie"));
const PrescriptionDetails = lazy(() => import("./pages/pharmacie/show"));
```

- [ ] **Step 2: Add the routes**

Insert after the `/file-attente/:consultationId` route and before `/staff`:

```tsx
        <Route path="/laboratoire">
          <ProtectedRoute>
            <Layout>
              <LaboratoireIndex />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire/new">
          <ProtectedRoute>
            <Layout>
              <NewLabOrder />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/laboratoire/:id">
          <ProtectedRoute>
            <Layout>
              <LabOrderDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/pharmacie">
          <ProtectedRoute>
            <Layout>
              <PharmacieIndex />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/pharmacie/:id">
          <ProtectedRoute>
            <Layout>
              <PrescriptionDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
```

(`/laboratoire/new` must be declared before `/laboratoire/:id` — Wouter matches routes in declaration order and `:id` would otherwise swallow the literal `new` segment, exactly like `/consultations/new` is declared before `/consultations/:id` today.)

- [ ] **Step 3: Add sidebar nav items**

In `frontend/src/components/Sidebar.tsx`, add imports:

```ts
import { FlaskConical, Pill } from "lucide-react";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PrescriptionsPolicy } from "@/lib/policies/prescriptions.policy";
```

Add policy hooks next to the existing ones:

```ts
  const labOrdersPolicy = usePolicy(LabOrdersPolicy);
  const prescriptionsPolicy = usePolicy(PrescriptionsPolicy);
```

Add two entries to `menuItems`, right after the `queuePolicy.canView()` entry:

```ts
    ...(labOrdersPolicy.canView()
      ? [{ icon: FlaskConical, label: t("laboratoireTitle"), path: "/laboratoire" }]
      : []),
    ...(prescriptionsPolicy.canView()
      ? [{ icon: Pill, label: t("pharmacieTitle"), path: "/pharmacie" }]
      : []),
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: wire /laboratoire and /pharmacie routes and nav items"
```

---

### Task 13: Wire `consultation-medicale.tsx`'s Examens/Prescription sections live

**Files:**
- Modify: `frontend/src/pages/consultations/consultation-medicale.tsx`

**Interfaces:**
- Consumes: `LabOrder`, `Prescription` (`@shared/schema`), `GET /api/lab-orders/:tenantId?consultationId=`, `GET /api/prescriptions/:tenantId?consultationId=`, `POST /api/prescriptions`, `LabOrdersPolicy`/`PrescriptionsPolicy` (Task 5).
- Produces: the previously-disabled "Examens complémentaires"/"Prescription" card (`data-testid="card-future-phase-sections"`, `button-request-exams`, `button-prescribe`) becomes two live sections.

- [ ] **Step 1: Add imports and state**

Add to the existing import block:

```ts
import { useLocation, useParams } from "wouter";
```

(already imported — no change needed there.) Add new imports:

```ts
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTenant } from "../../contexts/TenantContext";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { PrescriptionsPolicy } from "@/lib/policies/prescriptions.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { LabOrder, Prescription } from "@shared/schema";
```

Add inside the component body, alongside the existing `useTranslation`/`useToast` hooks:

```ts
  const { currentTenant } = useTenant();
```

Add new state for the prescription add-line form, alongside the existing `useState` calls:

```ts
  const [newDrugName, setNewDrugName] = useState("");
  const [newDosage, setNewDosage] = useState("");
  const [newFrequency, setNewFrequency] = useState("");
```

- [ ] **Step 2: Fetch this consultation's lab orders and prescriptions**

Add alongside the existing `consultation`/`patient` queries:

```ts
  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });
```

- [ ] **Step 3: Add the prescription-line create mutation**

Add alongside `saveDraftMutation`/`markCompletedMutation`:

```ts
  const addPrescriptionLineMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest(
        "POST",
        "/api/prescriptions",
        { consultationId, lines: [{ drugName: newDrugName, dosage: newDosage, frequency: newFrequency }] },
        { collection: "prescriptions" }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`] });
      toast({ title: t("success"), description: t("prescriptionCreatedSuccessfully") });
      setNewDrugName("");
      setNewDosage("");
      setNewFrequency("");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreatePrescription"), t("networkRequestFailed"));
    },
  });
```

- [ ] **Step 4: Replace the disabled placeholder card with two live sections**

Replace this whole block:

```tsx
      <Card className="p-6 space-y-2 opacity-60" data-testid="card-future-phase-sections">
        <h2 className="font-semibold text-foreground">{t("requestExams")} · {t("prescribeAction")} · {t("closeConsultationAction")}</h2>
        <p className="text-sm text-muted-foreground">{t("availableInFuturePhase")}</p>
      </Card>
```

with:

```tsx
      <Card className="p-6 space-y-4" data-testid="card-lab-orders">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{t("examTypesRequested")}</h2>
          <PolicyGuard policy={LabOrdersPolicy} action="canCreate">
            <Button variant="outline" size="sm" onClick={() => setLocation(`/laboratoire/new?consultationId=${consultationId}`)} data-testid="button-request-exams">
              {t("newLabOrder")}
            </Button>
          </PolicyGuard>
        </div>
        {labOrders.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noLabOrders")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("examTypesRequested")}</TableHead>
                <TableHead>{t("statusColumnLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {labOrders.map((order) => (
                <TableRow key={order.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setLocation(`/laboratoire/${order.id}`)} data-testid={`row-lab-order-${order.id}`}>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {order.examLines.map((line, index) => (
                        <Badge key={index} variant="secondary">{line.examName}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge>{t("labOrderStatus" + order.status[0].toUpperCase() + order.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-6 space-y-4" data-testid="card-prescriptions">
        <h2 className="font-semibold text-foreground">{t("medicationsPrescribedSection")}</h2>
        {prescriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPrescriptions")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("drugNameLabel")}</TableHead>
                <TableHead>{t("dosageLabel")}</TableHead>
                <TableHead>{t("frequencyLabel")}</TableHead>
                <TableHead>{t("statusColumnLabel")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prescriptions.map((prescription) => (
                <TableRow key={prescription.id} className="cursor-pointer hover:bg-accent/50" onClick={() => setLocation(`/pharmacie/${prescription.id}`)} data-testid={`row-prescription-${prescription.id}`}>
                  <TableCell>{prescription.lines.map((l) => l.drugName).join(", ")}</TableCell>
                  <TableCell>{prescription.lines.map((l) => l.dosage).join(", ")}</TableCell>
                  <TableCell>{prescription.lines.map((l) => l.frequency).join(", ")}</TableCell>
                  <TableCell>
                    <Badge>{t("prescriptionStatus" + prescription.status[0].toUpperCase() + prescription.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <PolicyGuard policy={PrescriptionsPolicy} action="canCreate">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input value={newDrugName} onChange={(e) => setNewDrugName(e.target.value)} placeholder={t("drugNameLabel")} className="glass-input" data-testid="input-new-drug-name" />
            <Input value={newDosage} onChange={(e) => setNewDosage(e.target.value)} placeholder={t("dosageLabel")} className="glass-input" data-testid="input-new-dosage" />
            <Input value={newFrequency} onChange={(e) => setNewFrequency(e.target.value)} placeholder={t("frequencyLabel")} className="glass-input" data-testid="input-new-frequency" />
          </div>
          <Button
            variant="outline"
            onClick={() => addPrescriptionLineMutation.mutate()}
            disabled={!newDrugName.trim() || !newDosage.trim() || !newFrequency.trim() || addPrescriptionLineMutation.isPending}
            data-testid="button-prescribe">
            {t("addMedicationLine")}
          </Button>
        </PolicyGuard>
      </Card>
```

Remove the now-unused disabled buttons from the bottom action bar — replace:

```tsx
        <Button variant="outline" disabled data-testid="button-request-exams">{t("requestExams")}</Button>
        <Button variant="outline" disabled data-testid="button-prescribe">{t("prescribeAction")}</Button>
```

with nothing (both actions now live inside the two cards above; the bottom bar keeps only "Sauvegarder brouillon", the disabled "Clôturer la consultation" placeholder, and "Marquer terminée", unchanged).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/consultations/consultation-medicale.tsx
git commit -m "feat: wire lab orders and prescriptions into consultation-medicale"
```

---

### Task 14: Wire the consultation hub's exams/prescription cards

**Files:**
- Modify: `frontend/src/pages/consultations/show.tsx`

**Interfaces:**
- Consumes: `LabOrder`, `Prescription` (`@shared/schema`), `GET /api/lab-orders/:tenantId?consultationId=`, `GET /api/prescriptions/:tenantId?consultationId=`, `computeConsultationJourney` (Task 4, new signature).
- Produces: the hub's `card-hub-exams`/`card-hub-prescription` placeholders show real data; `computeConsultationJourney` is called with the two new arguments.

- [ ] **Step 1: Fetch lab orders and prescriptions for this consultation**

Add to the imports:

```ts
import type { Consultation, LabOrder, Patient, Prescription, QueueItem } from "@shared/schema";
```

(replaces the existing `import type { Consultation, Patient, QueueItem } from "@shared/schema";` line.)

Add alongside the existing `queueItems` query:

```ts
  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });
```

- [ ] **Step 2: Pass them to `computeConsultationJourney`**

Replace:

```ts
  const steps = computeConsultationJourney(patient, consultation, queueItem);
```

with:

```ts
  const steps = computeConsultationJourney(patient, consultation, queueItem, labOrders, prescriptions);
```

- [ ] **Step 3: Replace the two placeholder cards with real content**

Replace:

```tsx
          <Card className="p-4 space-y-1 opacity-60" data-testid="card-hub-exams">
            <span className="text-sm font-medium">{t("examsCardTitle")}</span>
            <p className="text-sm text-muted-foreground">{t("notStartedYet")}</p>
          </Card>
          <Card className="p-4 space-y-1 opacity-60" data-testid="card-hub-prescription">
            <span className="text-sm font-medium">{t("prescriptionCardTitle")}</span>
            <p className="text-sm text-muted-foreground">{t("notStartedYet")}</p>
          </Card>
```

with:

```tsx
          <Card className="p-4 space-y-1" data-testid="card-hub-exams">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("examsCardTitle")}</span>
              {labOrders.length > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("viewLabel")}</Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {labOrders.length === 0 ? t("notStartedYet") : labOrders.map((o) => o.examLines.map((l) => l.examName).join(", ")).join(" · ")}
            </p>
          </Card>
          <Card className="p-4 space-y-1" data-testid="card-hub-prescription">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("prescriptionCardTitle")}</span>
              {prescriptions.length > 0 && (
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("viewLabel")}</Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {prescriptions.length === 0 ? t("notStartedYet") : prescriptions.flatMap((p) => p.lines.map((l) => l.drugName)).join(", ")}
            </p>
          </Card>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/consultations/show.tsx
git commit -m "feat: wire lab orders and prescriptions into the consultation hub"
```

---

## Final verification

- [ ] Run the full backend suite: `cd backend && npx jest`
- [ ] Run the full frontend suite: `cd frontend && npx vitest run`
- [ ] Run both typechecks: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- [ ] Manually exercise the golden path in the running app: as a `medecin`, open a consultation's `consultation-medicale` screen, add a lab exam line (verify it appears on `/laboratoire`), add a prescription line (verify it appears on `/pharmacie`); as a `laboratoire` user, take the order in charge, enter a result, and validate it; as a `pharmacien` user, deliver the prescription; return to the hub and confirm steps 6/7 now show completed.
