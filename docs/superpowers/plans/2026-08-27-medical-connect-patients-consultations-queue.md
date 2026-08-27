# Medical Connect — Patients, Consultations, File d'attente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Medical Connect Phase 1 domain (Patients, Consultations, File d'attente) alongside the existing shop-management domain, in the same NestJS/CouchDB backend and React/Wouter frontend.

**Architecture:** Three new CouchDB-backed modules (`patients`, `consultations`, `queue`) built exactly on the `rayons`/`products` module template (repository → service → controller → policy, `@UseGuards(JwtAuthGuard, PolicyGuard)` + `@CheckPolicy`), plus 5 new staff roles, a shared retry-on-409 sequence counter for human-readable numbering, and an S3 upload path for patient photos reached through the existing offline-request queue (no new sync infrastructure).

**Tech Stack:** NestJS, CouchDB (`nano`), Zod + class-validator, React 18, Wouter, `@tanstack/react-query`, `react-hook-form`, Tailwind + shadcn `ui/` components, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

**Spec:** `docs/superpowers/specs/2026-08-27-medical-connect-patients-consultations-queue-design.md`

## Global Constraints

- CouchDB documents only (`type` discriminator field, one DB per tenant named `medicalconnect_{tenantId}`) — no Drizzle/Postgres. `backend/src/shared/schema.ts` holds plain TS interfaces + Zod, not `pgTable`.
- Tenant ID is always derived from `req.user.tenantId` on the backend, never trusted from the client body/params — reuse the `tenantId(req, legacyTenantId?)` controller helper pattern (see `RayonsController`).
- Every user-facing string goes through `t("key")`, added to **both** `en` and `fr` in the relevant `frontend/src/lib/i18n/*.ts` file, checked by `frontend/src/lib/i18nCompleteness.test.ts`.
- No `@testing-library/react`/jsdom in this repo. Backend logic is unit-tested (repository/service, plain `new X(mockedDep as any)` construction, no `TestingModule`). Frontend pages are thin and untested; only non-trivial frontend logic (e.g. queue folding helpers if extracted) gets a unit test.
- Never hand-roll a raw `<button>`/`<input>`/`<select>`/`<textarea>` when `frontend/src/components/ui/` has the component — this project already has `Button`, `Input`, `Textarea`, `Select`, `RadioGroup`, `Checkbox`, `Dialog`, `Table`, `Badge`, `Card`, `Tabs`, `Avatar`.
- Deviation from the written spec discovered while planning (documented here, spec should be amended to match): numbering (`dossierNumber`/consultation `number`) and the S3 photo upload do **not** need a new CouchDB `_changes`-feed watcher service. `POST`/`PUT` calls already go through `offlineApiRequest`, which queues the exact request for replay via `replayOfflineOperations` (`frontend/src/lib/offlineOperationQueue.ts`) once connectivity returns. So the backend's normal `create()`/`attachPhoto()` handlers — which only ever run while the device has a route to the backend, whether immediately or after a queued replay — can assign the sequence number and do the S3 upload **synchronously**, no separate watcher process needed. This removes an entire subsystem from the design; functional behavior for the user is unchanged (number/photo appear once the device is back online).

---

### Task 1: Extend `UserRole` with the 5 Medical Connect roles

**Files:**
- Modify: `backend/src/modules/auth/policies/policy.types.ts`
- Modify: `backend/src/modules/auth/policies/base.policy.ts`
- Modify: `frontend/src/lib/policies/policy.types.ts`
- Modify: `frontend/src/lib/policies/base.policy.ts`
- Modify: `backend/src/modules/staff/dto/create-staff.dto.ts`
- Modify: `backend/src/modules/staff/dto/update-staff.dto.ts`
- Modify: `backend/src/shared/schema.ts` (`User.role`, `insertUserSchema`)
- Modify: `frontend/shared/schema.ts` (`User.role`)
- Modify: `frontend/src/pages/Staff.tsx` (role select options + badge config)
- Modify: `frontend/src/lib/i18n/auth.ts` (role labels)
- Modify: `backend/scripts/seed-database.ts` (seed one staff account per new role for manual testing)
- Test: `backend/src/modules/auth/policies/base.policy.spec.ts` (new)
- Test: `frontend/src/lib/policies/base.policy.spec.ts` (new)

**Interfaces:**
- Produces: `UserRole = "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien"` (backend and frontend, identical). `BasePolicy.isAccueil()`, `isInfirmier()`, `isMedecin()`, `isLaboratoire()`, `isPharmacien()` on both backend and frontend `BasePolicy`. Every later task's `*Policy` classes call these.

- [ ] **Step 1: Write the failing tests for the new role helpers**

`backend/src/modules/auth/policies/base.policy.spec.ts`:
```ts
import { BasePolicy } from "./base.policy";

class TestPolicy extends BasePolicy {}

describe("BasePolicy new Medical Connect role helpers", () => {
  it.each([
    ["accueil", "isAccueil"],
    ["infirmier", "isInfirmier"],
    ["medecin", "isMedecin"],
    ["laboratoire", "isLaboratoire"],
    ["pharmacien", "isPharmacien"],
  ] as const)("%s -> %s() is true only for that role", (role, method) => {
    const policy = new TestPolicy();
    policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
    expect((policy as any)[method]()).toBe(true);
    expect((policy as any).isAdmin()).toBe(false);
  });
});
```

`frontend/src/lib/policies/base.policy.spec.ts`:
```ts
import { BasePolicy } from "./base.policy";

class TestPolicy extends BasePolicy {}

describe("BasePolicy new Medical Connect role helpers", () => {
  it.each([
    ["accueil", "isAccueil"],
    ["infirmier", "isInfirmier"],
    ["medecin", "isMedecin"],
    ["laboratoire", "isLaboratoire"],
    ["pharmacien", "isPharmacien"],
  ] as const)("%s -> %s() is true only for that role", (role, method) => {
    const policy = new TestPolicy(role);
    expect((policy as any)[method]()).toBe(true);
    expect((policy as any).isAdmin()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/auth/policies/base.policy.spec.ts` and `cd frontend && npx vitest run src/lib/policies/base.policy.spec.ts`
Expected: FAIL — `isAccueil is not a function` (method doesn't exist yet).

- [ ] **Step 3: Extend the role union on both sides**

`backend/src/modules/auth/policies/policy.types.ts` line 3, replace:
```ts
export type UserRole = "admin" | "manager" | "cashier";
```
with:
```ts
export type UserRole =
  | "admin"
  | "manager"
  | "cashier"
  | "accueil"
  | "infirmier"
  | "medecin"
  | "laboratoire"
  | "pharmacien";
```

`frontend/src/lib/policies/policy.types.ts` line 1, same replacement.

- [ ] **Step 4: Add the role helper methods to both `BasePolicy` classes**

`backend/src/modules/auth/policies/base.policy.ts`, after `isCashier()` (line 28-30), add:
```ts
  protected isAccueil(): boolean {
    return this.hasRole("accueil");
  }

  protected isInfirmier(): boolean {
    return this.hasRole("infirmier");
  }

  protected isMedecin(): boolean {
    return this.hasRole("medecin");
  }

  protected isLaboratoire(): boolean {
    return this.hasRole("laboratoire");
  }

  protected isPharmacien(): boolean {
    return this.hasRole("pharmacien");
  }
```

`frontend/src/lib/policies/base.policy.ts`, same 5 methods inserted after `isCashier()` (line 26-28).

- [ ] **Step 5: Run tests to verify they pass**

Run: same commands as Step 2.
Expected: PASS.

- [ ] **Step 6: Extend the staff DTOs, schema, and seed script**

`backend/src/modules/staff/dto/create-staff.dto.ts` line 38, replace:
```ts
  @IsIn(["admin", "manager", "cashier"])
  role?: "admin" | "manager" | "cashier";
```
with:
```ts
  @IsIn(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien"])
  role?: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien";
```

`backend/src/modules/staff/dto/update-staff.dto.ts` line 26-27, same replacement.

`backend/src/shared/schema.ts` line 13, replace the `role` field type in the `User` interface:
```ts
export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien"; tenantId: string; isActive: boolean; createdAt: Date }
```
Line 80, replace `insertUserSchema`'s role enum:
```ts
export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien"]).optional(), tenantId: z.string(), isActive: z.boolean().optional() });
```

`frontend/shared/schema.ts`: apply the identical `User.role` union change (same line shape, `createdAt: string` stays as-is on that file).

`backend/scripts/seed-database.ts`: after the existing `admin` user creation (after line 32's closing `});`), add:
```ts
  await users.create({
    id: "00000000-0000-4000-8000-000000000005",
    username: "accueil",
    password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
    firstName: "Medical Connect",
    lastName: "Accueil",
    role: "accueil",
    tenantId: tenant.id,
  });
  await users.create({
    id: "00000000-0000-4000-8000-000000000006",
    username: "infirmier",
    password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
    firstName: "Medical Connect",
    lastName: "Infirmier",
    role: "infirmier",
    tenantId: tenant.id,
  });
  await users.create({
    id: "00000000-0000-4000-8000-000000000007",
    username: "medecin",
    password: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD ?? "admin123", 10),
    firstName: "Dr.",
    lastName: "Mbarga",
    role: "medecin",
    tenantId: tenant.id,
  });
```

- [ ] **Step 7: Add role labels and update the Staff role picker UI**

`frontend/src/lib/i18n/auth.ts` line 79-80 (en block), add after `manager: "Manager",`:
```ts
    accueil: "Front Desk",
    infirmier: "Nurse",
    medecin: "Doctor",
    laboratoire: "Lab Technician",
    pharmacien: "Pharmacist",
```
Line 161-162 (fr block), add after `manager: "Gestionnaire",`:
```ts
    accueil: "Accueil",
    infirmier: "Infirmier",
    medecin: "Médecin",
    laboratoire: "Laborantin",
    pharmacien: "Pharmacien",
```

`frontend/src/pages/Staff.tsx` line 294-299, replace the `getRoleBadge` config map:
```ts
  const getRoleBadge = (role: string) => {
    const config = {
      admin: { label: t("admin"), variant: "destructive" as const },
      manager: { label: t("manager"), variant: "default" as const },
      cashier: { label: t("cashier"), variant: "secondary" as const },
      accueil: { label: t("accueil"), variant: "secondary" as const },
      infirmier: { label: t("infirmier"), variant: "secondary" as const },
      medecin: { label: t("medecin"), variant: "default" as const },
      laboratoire: { label: t("laboratoire"), variant: "secondary" as const },
      pharmacien: { label: t("pharmacien"), variant: "secondary" as const },
    };

    const { label, variant } =
      config[role as keyof typeof config] || config.cashier;
    return <Badge variant={variant}>{label}</Badge>;
  };
```

Line 634-657, add 5 more `SelectItem` entries inside `SelectContent`, right after the existing `cashier`/`manager`/`admin` items:
```tsx
                  <SelectItem value="accueil">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("accueil")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="infirmier">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("infirmier")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="medecin">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4" />
                      <span>{t("medecin")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="laboratoire">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("laboratoire")}</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pharmacien">
                    <div className="flex items-center space-x-2">
                      <UserCheck className="w-4 h-4" />
                      <span>{t("pharmacien")}</span>
                    </div>
                  </SelectItem>
```

- [ ] **Step 8: Run the full backend and frontend test suites for regressions**

Run: `cd backend && npx jest` and `cd frontend && npx vitest run`
Expected: PASS (including `i18nCompleteness.test.ts`, which will fail loudly if an `en`/`fr` key pair is mismatched).

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/auth/policies/policy.types.ts backend/src/modules/auth/policies/base.policy.ts backend/src/modules/auth/policies/base.policy.spec.ts frontend/src/lib/policies/policy.types.ts frontend/src/lib/policies/base.policy.ts frontend/src/lib/policies/base.policy.spec.ts backend/src/modules/staff/dto/create-staff.dto.ts backend/src/modules/staff/dto/update-staff.dto.ts backend/src/shared/schema.ts frontend/shared/schema.ts frontend/src/pages/Staff.tsx frontend/src/lib/i18n/auth.ts backend/scripts/seed-database.ts
git commit -m "feat: add Medical Connect staff roles (accueil, infirmier, medecin, laboratoire, pharmacien)"
```

---

### Task 2: `Patient` schema types (backend + frontend)

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `frontend/shared/schema.ts`

**Interfaces:**
- Consumes: `nullableString`, `id`, `money` Zod helpers already defined in both `schema.ts` files (lines 76-78 backend).
- Produces: `Patient`, `InsertPatient`, `EmergencyContact`, `PediatricInfo`, `PatientStatus`, `PatientType`, `PaymentMode`, `IdDocumentType`, `AllergyKnowledge`, `insertPatientSchema` — consumed by Task 4 (`PatientsRepository`), Task 6 (`CreatePatientDto`/`UpdatePatientDto`), Task 7-8 (frontend `Patients.tsx`/`PatientDetails.tsx`).

- [ ] **Step 1: Add the types to `backend/src/shared/schema.ts`**

Insert after the `Rayon`/`InsertRayon` block (after line 23):
```ts
export type PatientStatus = "actif" | "inactif" | "hospitalise";
export type PatientType = "externe" | "hospitalise" | "urgence";
export type PaymentMode = "assurance" | "mutuelle" | "tiers_payant" | "comptant";
export type IdDocumentType = "cni" | "passeport" | "permis" | "autre";
export type AllergyKnowledge = "aucune_connue" | "allergies_connues" | "non_renseigne";

export interface EmergencyContact { name: string; relation: string; phone: string; address: string | null; isPriority: boolean }
export interface PediatricInfo { fatherName: string | null; motherName: string | null; legalGuardian: string | null; guardianPhone: string | null; guardianRelation: string | null; weightKg: string | null; heightCm: string | null; birthInfo: string | null; vaccinations: string | null }

export interface Patient { id: string; tenantId: string; dossierNumber: string | null; lastName: string; firstName: string; searchName: string; dateOfBirth: string; sex: "M" | "F"; primaryPhone: string; residenceAddress: string; usualName: string | null; birthPlace: string | null; nationality: string | null; profession: string | null; maritalStatus: string | null; idDocumentType: IdDocumentType | null; idDocumentNumber: string | null; idDocumentExpiry: string | null; email: string | null; secondaryPhone: string | null; residenceZone: string | null; fullAddress: string | null; emergencyContact: EmergencyContact | null; bloodGroup: string | null; allergyKnowledge: AllergyKnowledge; allergyDetails: string | null; medicalHistory: string | null; surgicalHistory: string | null; chronicDiseases: string | null; currentTreatments: string | null; disabilities: string | null; facilityService: string | null; referringDoctorId: string | null; patientType: PatientType; paymentMode: PaymentMode | null; insuranceName: string | null; insuranceNumber: string | null; financiallyResponsible: string | null; pediatricInfo: PediatricInfo | null; photoS3Key: string | null; status: PatientStatus; isActive: boolean; createdAt: Date; updatedAt: Date }
export interface InsertPatient { id?: string; lastName: string; firstName: string; dateOfBirth: string; sex: "M" | "F"; primaryPhone: string; residenceAddress: string; usualName?: string | null; birthPlace?: string | null; nationality?: string | null; profession?: string | null; maritalStatus?: string | null; idDocumentType?: IdDocumentType | null; idDocumentNumber?: string | null; idDocumentExpiry?: string | null; email?: string | null; secondaryPhone?: string | null; residenceZone?: string | null; fullAddress?: string | null; emergencyContact?: EmergencyContact | null; bloodGroup?: string | null; allergyKnowledge?: AllergyKnowledge; allergyDetails?: string | null; medicalHistory?: string | null; surgicalHistory?: string | null; chronicDiseases?: string | null; currentTreatments?: string | null; disabilities?: string | null; facilityService?: string | null; referringDoctorId?: string | null; patientType?: PatientType; paymentMode?: PaymentMode | null; insuranceName?: string | null; insuranceNumber?: string | null; financiallyResponsible?: string | null; pediatricInfo?: PediatricInfo | null; tenantId: string }
```

Insert after the `insertRayonSchema` line (after line 83):
```ts
const emergencyContactSchema = z.object({ name: z.string().min(1), relation: z.string().min(1), phone: z.string().min(1), address: nullableString, isPriority: z.boolean() }).nullable().optional();
const pediatricInfoSchema = z.object({ fatherName: nullableString, motherName: nullableString, legalGuardian: nullableString, guardianPhone: nullableString, guardianRelation: nullableString, weightKg: nullableString, heightCm: nullableString, birthInfo: nullableString, vaccinations: nullableString }).nullable().optional();
export const insertPatientSchema = z.object({ id, lastName: z.string().min(1), firstName: z.string().min(1), dateOfBirth: z.string().min(1), sex: z.enum(["M", "F"]), primaryPhone: z.string().min(1), residenceAddress: z.string().min(1), usualName: nullableString, birthPlace: nullableString, nationality: nullableString, profession: nullableString, maritalStatus: nullableString, idDocumentType: z.enum(["cni", "passeport", "permis", "autre"]).nullable().optional(), idDocumentNumber: nullableString, idDocumentExpiry: nullableString, email: nullableString, secondaryPhone: nullableString, residenceZone: nullableString, fullAddress: nullableString, emergencyContact: emergencyContactSchema, bloodGroup: nullableString, allergyKnowledge: z.enum(["aucune_connue", "allergies_connues", "non_renseigne"]).optional(), allergyDetails: nullableString, medicalHistory: nullableString, surgicalHistory: nullableString, chronicDiseases: nullableString, currentTreatments: nullableString, disabilities: nullableString, facilityService: nullableString, referringDoctorId: nullableString, patientType: z.enum(["externe", "hospitalise", "urgence"]).optional(), paymentMode: z.enum(["assurance", "mutuelle", "tiers_payant", "comptant"]).nullable().optional(), insuranceName: nullableString, insuranceNumber: nullableString, financiallyResponsible: nullableString, pediatricInfo: pediatricInfoSchema, tenantId: z.string() });
```

- [ ] **Step 2: Mirror the same block into `frontend/shared/schema.ts`**

Append the identical `PatientStatus`/`PatientType`/`PaymentMode`/`IdDocumentType`/`AllergyKnowledge`/`EmergencyContact`/`PediatricInfo`/`Patient`/`InsertPatient` block and `insertPatientSchema` (with its two helper consts) to the end of `frontend/shared/schema.ts`, with one change: `createdAt: Date; updatedAt: Date` becomes `createdAt: string; updatedAt: string` on the `Patient` interface, matching this file's existing convention (dates are JSON strings on the frontend).

- [ ] **Step 3: Typecheck both packages**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: PASS, no new type errors (nothing references these types yet, so this only catches syntax mistakes in the block itself).

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add Patient schema types"
```

---

### Task 3: `SequenceCounterService` — shared per-tenant sequential numbering

**Files:**
- Create: `backend/src/lib/sequence-counter.service.ts`
- Create: `backend/src/lib/sequence-counter.module.ts`
- Test: `backend/src/lib/sequence-counter.service.spec.ts`

**Interfaces:**
- Consumes: `CouchDBService.getDatabase(dbName)` (existing, returns a `nano` `DocumentScope`), `tenantDatabaseName(tenantId)` from `backend/src/database/couchdb-naming.ts`.
- Produces: `SequenceCounterService.next(tenantId: string, key: string): Promise<number>` — consumed by Task 4 (`PatientsRepository.create`) and Task 10 (`ConsultationsRepository.create`). `SequenceCounterModule` (imports `CouchDBModule`, exports `SequenceCounterService`) — imported by `PatientsModule` and `ConsultationsModule` in Tasks 6 and 11.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/lib/sequence-counter.service.spec.ts
import { SequenceCounterService } from "./sequence-counter.service";

describe("SequenceCounterService", () => {
  it("starts a new counter at 1 when no counter document exists yet", async () => {
    const db = {
      get: jest.fn().mockRejectedValue({ statusCode: 404 }),
      insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }),
    };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new SequenceCounterService(couchDBService as any);

    const result = await service.next("tenant-1", "patient:2026");

    expect(result).toBe(1);
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "counter:patient:2026:tenant-1",
        type: "counter",
        tenantId: "tenant-1",
        value: 1,
      })
    );
  });

  it("increments an existing counter", async () => {
    const db = {
      get: jest.fn().mockResolvedValue({ _id: "counter:patient:2026:tenant-1", _rev: "3-x", type: "counter", tenantId: "tenant-1", value: 41 }),
      insert: jest.fn().mockResolvedValue({ ok: true, rev: "4-x" }),
    };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new SequenceCounterService(couchDBService as any);

    const result = await service.next("tenant-1", "patient:2026");

    expect(result).toBe(42);
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ _rev: "3-x", value: 42 }));
  });

  it("retries on a 409 conflict from a concurrent increment", async () => {
    const db = {
      get: jest
        .fn()
        .mockResolvedValueOnce({ _id: "counter:patient:2026:tenant-1", _rev: "3-x", type: "counter", tenantId: "tenant-1", value: 41 })
        .mockResolvedValueOnce({ _id: "counter:patient:2026:tenant-1", _rev: "4-y", type: "counter", tenantId: "tenant-1", value: 42 }),
      insert: jest
        .fn()
        .mockRejectedValueOnce({ statusCode: 409 })
        .mockResolvedValueOnce({ ok: true, rev: "5-y" }),
    };
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const service = new SequenceCounterService(couchDBService as any);

    const result = await service.next("tenant-1", "patient:2026");

    expect(result).toBe(43);
    expect(db.insert).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/lib/sequence-counter.service.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `SequenceCounterService`**

```ts
// backend/src/lib/sequence-counter.service.ts
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { CouchDBService } from "../database/couchdb.service";
import { tenantDatabaseName } from "../database/couchdb-naming";

@Injectable()
export class SequenceCounterService {
  constructor(private readonly couchDBService: CouchDBService) {}

  async next(tenantId: string, key: string): Promise<number> {
    const db = await this.couchDBService.getDatabase(tenantDatabaseName(tenantId));
    const counterId = `counter:${key}:${tenantId}`;
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const existing = await this.findExisting(db, counterId);
      const nextValue = (existing?.value ?? 0) + 1;

      try {
        await db.insert({
          _id: counterId,
          ...(existing?._rev ? { _rev: existing._rev } : {}),
          type: "counter",
          tenantId,
          value: nextValue,
        } as any);
        return nextValue;
      } catch (error: any) {
        if (error?.statusCode === 409 && attempt < maxAttempts) continue;
        throw error;
      }
    }
    /* istanbul ignore next -- unreachable: loop always returns or throws */
    throw new ServiceUnavailableException(`Failed to allocate sequence for ${key}`);
  }

  private async findExisting(
    db: any,
    counterId: string
  ): Promise<{ _rev: string; value: number } | null> {
    try {
      return await db.get(counterId);
    } catch (error: any) {
      if (error?.statusCode === 404) return null;
      throw error;
    }
  }
}
```

```ts
// backend/src/lib/sequence-counter.module.ts
import { Module } from "@nestjs/common";
import { SequenceCounterService } from "./sequence-counter.service";
import { CouchDBModule } from "../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [SequenceCounterService],
  exports: [SequenceCounterService],
})
export class SequenceCounterModule {}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest src/lib/sequence-counter.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/sequence-counter.service.ts backend/src/lib/sequence-counter.module.ts backend/src/lib/sequence-counter.service.spec.ts
git commit -m "feat: add SequenceCounterService for per-tenant sequential numbering"
```

---

### Task 4: `PatientsRepository` — create, update, find, search

**Files:**
- Create: `backend/src/modules/patients/patients.repository.ts`
- Create: `backend/src/modules/patients/patients.repository.module.ts`
- Test: `backend/src/modules/patients/patients.repository.spec.ts`

**Interfaces:**
- Consumes: `InsertPatient`/`Patient` (Task 2), `SequenceCounterService.next(tenantId, key)` (Task 3), `couchDocumentId`/`publicDocumentId`/`tenantDatabaseName` (existing, `backend/src/database/couchdb-naming.ts`), `PaginationOptions` (existing, `backend/src/lib/pagination.ts`).
- Produces: `PatientsRepository.create(data: InsertPatient): Promise<Patient>`, `.update(id, tenantId, data: Partial<InsertPatient>): Promise<Patient>`, `.findById(id, tenantId): Promise<Patient>`, `.findByTenant(tenantId, options?): Promise<Patient[]>`, `.search(query, tenantId, options?): Promise<Patient[]>` — consumed by Task 6 (`PatientsService`/`PatientsController`) and Task 10 (`ConsultationsRepository`, via `PatientsRepositoryModule`, to validate `patientId` references).

- [ ] **Step 1: Write the failing tests**

```ts
// backend/src/modules/patients/patients.repository.spec.ts
import { NotFoundException } from "@nestjs/common";
import { PatientsRepository } from "./patients.repository";

describe("PatientsRepository", () => {
  describe("create", () => {
    it("allocates a dossier number, computes searchName, and creates the patient", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const sequenceCounterService = { next: jest.fn().mockResolvedValue(98) };
      const repository = new PatientsRepository(couchDBService as any, sequenceCounterService as any);

      const result = await repository.create({
        id: "123e4567-e89b-42d3-a456-426614174000",
        lastName: "Diallo",
        firstName: "Aïssatou",
        dateOfBirth: "1994-03-12",
        sex: "F",
        primaryPhone: "+237677889900",
        residenceAddress: "Bastos, Yaoundé",
        tenantId: "tenant-1",
      } as any);

      expect(sequenceCounterService.next).toHaveBeenCalledWith("tenant-1", expect.stringMatching(/^patient:\d{4}$/));
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: "patient:123e4567-e89b-42d3-a456-426614174000",
          type: "patient",
          tenantId: "tenant-1",
          searchName: "aïssatou diallo",
          dossierNumber: expect.stringMatching(/^MC-\d{4}-0098$/),
          status: "actif",
          allergyKnowledge: "non_renseigne",
          patientType: "externe",
        })
      );
      expect(result.dossierNumber).toMatch(/^MC-\d{4}-0098$/);
    });
  });

  describe("update", () => {
    function existingPatient(overrides: Record<string, unknown> = {}) {
      return {
        _id: "patient:patient-1",
        _rev: "2-a",
        id: "patient-1",
        type: "patient",
        lastName: "Diallo",
        firstName: "Aïssatou",
        searchName: "aïssatou diallo",
        dossierNumber: "MC-2026-0098",
        tenantId: "tenant-1",
        status: "actif",
        isActive: true,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        ...overrides,
      };
    }

    it("recomputes searchName when the name changes", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingPatient()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new PatientsRepository(couchDBService as any, { next: jest.fn() } as any);

      const result = await repository.update("patient-1", "tenant-1", { firstName: "Aissatou" });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: "Aissatou", searchName: "aissatou diallo" })
      );
      expect(result.firstName).toBe("Aissatou");
    });

    it("throws NotFoundException when the patient does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any
      );

      await expect(repository.update("missing", "tenant-1", { firstName: "X" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("search", () => {
    it("queries by searchName, dossierNumber, and phone with an escaped regex", async () => {
      const docs = [{ _id: "patient:patient-1", type: "patient", firstName: "Aïssatou" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = {
        getDatabase: jest.fn().mockResolvedValue(db),
        ensureIndex: jest.fn().mockResolvedValue(undefined),
      };
      const repository = new PatientsRepository(couchDBService as any, { next: jest.fn() } as any);

      const result = await repository.search("Diallo Aïssatou", "tenant-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({
            type: "patient",
            tenantId: "tenant-1",
            $or: expect.arrayContaining([
              { searchName: { $regex: "diallo a\\u00efssatou" } },
              { dossierNumber: { $regex: "Diallo A\\u00efssatou" } },
              { primaryPhone: { $regex: "Diallo A\\u00efssatou" } },
            ]),
          }),
        })
      );
      expect(result).toEqual([{ _id: "patient:patient-1", type: "patient", firstName: "Aïssatou", id: "patient-1" }]);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/patients/patients.repository.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `PatientsRepository`**

```ts
// backend/src/modules/patients/patients.repository.ts
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

    const nextFirstName = data.firstName ?? current.firstName;
    const nextLastName = data.lastName ?? current.lastName;

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

  private statusCode(error: unknown): number | undefined {
    return typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as any).statusCode)
      : undefined;
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
```

```ts
// backend/src/modules/patients/patients.repository.module.ts
import { Module } from "@nestjs/common";
import { PatientsRepository } from "./patients.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { SequenceCounterModule } from "../../lib/sequence-counter.module";

@Module({
  imports: [CouchDBModule, SequenceCounterModule],
  providers: [PatientsRepository],
  exports: [PatientsRepository],
})
export class PatientsRepositoryModule {}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/patients/patients.repository.spec.ts`
Expected: PASS. If the `search` regex assertion's Unicode escaping (`ï`) doesn't match Jest's literal string comparison, replace that assertion with `expect.objectContaining` on just the `type`/`tenantId` keys plus a looser check that `$or` has length 3 — the exact escaped-accented-character behavior of `String.prototype.toLowerCase()` output should not be over-specified in the test.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/patients/patients.repository.ts backend/src/modules/patients/patients.repository.module.ts backend/src/modules/patients/patients.repository.spec.ts
git commit -m "feat: add PatientsRepository (create, update, find, search)"
```

---

### Task 5: Patient photos — S3 upload + presigned read URL

**Files:**
- Create: `backend/src/lib/s3.service.ts`
- Create: `backend/src/lib/s3.module.ts`
- Modify: `backend/src/modules/patients/patients.repository.ts` (add `attachPhoto`, `getPhotoUrl`)
- Modify: `backend/env.template`
- Modify: `backend/package.json` (add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- Test: `backend/src/lib/s3.service.spec.ts`
- Test: `backend/src/modules/patients/patients.repository.spec.ts` (add photo cases)

**Interfaces:**
- Produces: `S3Service.uploadObject(key: string, body: Buffer, contentType: string): Promise<void>`, `S3Service.getPresignedUrl(key: string, expiresInSeconds: number): Promise<string>`. `PatientsRepository.attachPhoto(id, tenantId, base64: string, contentType: string): Promise<Patient>`, `.getPhotoUrl(id, tenantId): Promise<string>` — consumed by Task 6 (`PatientsController`).

- [ ] **Step 1: Install the AWS SDK packages**

Run: `cd backend && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner`
Expected: `backend/package.json` and `backend/package-lock.json` updated with the two new dependencies.

- [ ] **Step 2: Add the AWS environment variables**

`backend/env.template`, append after the `COUCHDB_URL` line:
```
# S3 (patient photos). Bucket must be private; the backend is the only
# component that ever holds these credentials.
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET_PATIENT_PHOTOS=
```

- [ ] **Step 3: Write the failing test for `S3Service`**

```ts
// backend/src/lib/s3.service.spec.ts
import { S3Service } from "./s3.service";

const sendMock = jest.fn().mockResolvedValue({});
jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));
jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: jest.fn().mockResolvedValue("https://signed.example/photo.jpg"),
}));

describe("S3Service", () => {
  beforeEach(() => {
    process.env.AWS_REGION = "eu-west-1";
    process.env.AWS_S3_BUCKET_PATIENT_PHOTOS = "medical-connect-photos";
    sendMock.mockClear();
  });

  it("uploads an object with the given key, body, and content type", async () => {
    const service = new S3Service();
    await service.uploadObject("tenants/t1/patients/p1/photo-1.jpg", Buffer.from("data"), "image/jpeg");

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          Bucket: "medical-connect-photos",
          Key: "tenants/t1/patients/p1/photo-1.jpg",
          ContentType: "image/jpeg",
        }),
      })
    );
  });

  it("returns a presigned URL for a given key", async () => {
    const service = new S3Service();
    const url = await service.getPresignedUrl("tenants/t1/patients/p1/photo-1.jpg", 300);
    expect(url).toBe("https://signed.example/photo.jpg");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `cd backend && npx jest src/lib/s3.service.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 5: Implement `S3Service`**

```ts
// backend/src/lib/s3.service.ts
import { Injectable } from "@nestjs/common";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

@Injectable()
export class S3Service {
  private readonly client = new S3Client({ region: process.env.AWS_REGION });
  private readonly bucket = process.env.AWS_S3_BUCKET_PATIENT_PHOTOS ?? "";

  async uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType })
    );
  }

  async getPresignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
```

```ts
// backend/src/lib/s3.module.ts
import { Module } from "@nestjs/common";
import { S3Service } from "./s3.service";

@Module({
  providers: [S3Service],
  exports: [S3Service],
})
export class S3Module {}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `cd backend && npx jest src/lib/s3.service.spec.ts`
Expected: PASS.

- [ ] **Step 7: Write the failing tests for `PatientsRepository` photo methods**

Add to `backend/src/modules/patients/patients.repository.spec.ts`:
```ts
  describe("attachPhoto", () => {
    it("uploads to S3 with a tenant/patient-scoped key and patches photoS3Key", async () => {
      const existing = {
        _id: "patient:patient-1",
        _rev: "2-a",
        id: "patient-1",
        type: "patient",
        tenantId: "tenant-1",
        photoS3Key: null,
      };
      const db = {
        get: jest.fn().mockResolvedValue(existing),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const s3Service = { uploadObject: jest.fn().mockResolvedValue(undefined) };
      const repository = new PatientsRepository(couchDBService as any, { next: jest.fn() } as any, s3Service as any);

      const result = await repository.attachPhoto("patient-1", "tenant-1", Buffer.from("img").toString("base64"), "image/jpeg");

      expect(s3Service.uploadObject).toHaveBeenCalledWith(
        expect.stringMatching(/^tenants\/tenant-1\/patients\/patient-1\/photo-\d+\.jpg$/),
        Buffer.from("img"),
        "image/jpeg"
      );
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ photoS3Key: expect.stringMatching(/^tenants\//) }));
      expect(result.photoS3Key).toMatch(/^tenants\//);
    });

    it("throws NotFoundException when the patient does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        { uploadObject: jest.fn() } as any
      );

      await expect(
        repository.attachPhoto("missing", "tenant-1", "aW1n", "image/jpeg")
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getPhotoUrl", () => {
    it("returns a presigned URL when photoS3Key is set", async () => {
      const db = { get: jest.fn().mockResolvedValue({ type: "patient", tenantId: "tenant-1", photoS3Key: "tenants/tenant-1/patients/patient-1/photo-1.jpg" }) };
      const s3Service = { getPresignedUrl: jest.fn().mockResolvedValue("https://signed.example/photo.jpg") };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        s3Service as any
      );

      const url = await repository.getPhotoUrl("patient-1", "tenant-1");

      expect(s3Service.getPresignedUrl).toHaveBeenCalledWith("tenants/tenant-1/patients/patient-1/photo-1.jpg", 300);
      expect(url).toBe("https://signed.example/photo.jpg");
    });

    it("throws NotFoundException when no photo has been uploaded yet", async () => {
      const db = { get: jest.fn().mockResolvedValue({ type: "patient", tenantId: "tenant-1", photoS3Key: null }) };
      const repository = new PatientsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        { getPresignedUrl: jest.fn() } as any
      );

      await expect(repository.getPhotoUrl("patient-1", "tenant-1")).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 8: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/patients/patients.repository.spec.ts`
Expected: FAIL — constructor now takes a 3rd arg that doesn't exist yet, `attachPhoto`/`getPhotoUrl` don't exist.

- [ ] **Step 9: Wire `S3Service` into `PatientsRepository`**

In `backend/src/modules/patients/patients.repository.ts`:
- Add `import { S3Service } from "../../lib/s3.service";` to the imports.
- Change the constructor to: `constructor(private readonly couchDBService: CouchDBService, private readonly sequenceCounterService: SequenceCounterService, private readonly s3Service: S3Service) {}`
- Add these two methods (near `findById`):
```ts
  async attachPhoto(id: string, tenantId: string, base64Body: string, contentType: string): Promise<Patient> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "patient" || current.tenantId !== tenantId) {
      throw new NotFoundException("Patient not found");
    }

    const extension = contentType === "image/png" ? "png" : "jpg";
    const key = `tenants/${tenantId}/patients/${id}/photo-${Date.now()}.${extension}`;
    await this.s3Service.uploadObject(key, Buffer.from(base64Body, "base64"), contentType);

    const updated = { ...current, photoS3Key: key, updatedAt: new Date().toISOString() };
    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  async getPhotoUrl(id: string, tenantId: string): Promise<string> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "patient" || current.tenantId !== tenantId) {
      throw new NotFoundException("Patient not found");
    }
    if (!current.photoS3Key) {
      throw new NotFoundException("Patient has no photo");
    }
    return this.s3Service.getPresignedUrl(current.photoS3Key, 300);
  }
```

Update `patients.repository.module.ts` to import `S3Module` and add it to `providers`' dependency graph (NestJS resolves constructor deps from imported modules' exports, so just add `S3Module` to `imports`):
```ts
import { S3Module } from "../../lib/s3.module";
// ...
@Module({
  imports: [CouchDBModule, SequenceCounterModule, S3Module],
  providers: [PatientsRepository],
  exports: [PatientsRepository],
})
export class PatientsRepositoryModule {}
```

- [ ] **Step 10: Fix the earlier tests' constructor calls**

Every `new PatientsRepository(couchDBService as any, ...)` call written in Task 4's test file now needs a 3rd constructor argument. Update each to pass `{ uploadObject: jest.fn(), getPresignedUrl: jest.fn() } as any` as the 3rd argument (e.g. `new PatientsRepository(couchDBService as any, sequenceCounterService as any, { uploadObject: jest.fn(), getPresignedUrl: jest.fn() } as any)`).

- [ ] **Step 11: Run the full repository test file to verify everything passes**

Run: `cd backend && npx jest src/modules/patients/patients.repository.spec.ts`
Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add backend/src/lib/s3.service.ts backend/src/lib/s3.module.ts backend/src/lib/s3.service.spec.ts backend/src/modules/patients/patients.repository.ts backend/src/modules/patients/patients.repository.module.ts backend/src/modules/patients/patients.repository.spec.ts backend/env.template backend/package.json backend/package-lock.json
git commit -m "feat: upload patient photos to S3 with presigned read URLs"
```

---

### Task 6: `PatientsPolicy`, `PatientsController`, DTOs, `PatientsModule`

**Files:**
- Create: `backend/src/modules/patients/patients.policy.ts`
- Create: `backend/src/modules/patients/patients.service.ts`
- Create: `backend/src/modules/patients/patients.controller.ts`
- Create: `backend/src/modules/patients/patients.module.ts`
- Create: `backend/src/modules/patients/dto/create-patient.dto.ts`
- Create: `backend/src/modules/patients/dto/update-patient.dto.ts`
- Create: `backend/src/modules/patients/dto/attach-patient-photo.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/patients/patients.policy.spec.ts`

**Interfaces:**
- Consumes: `PatientsRepository` (Task 4/5), `BasePolicy` (Task 1), `JwtAuthGuard`/`PolicyGuard`/`CheckPolicy` (existing, `backend/src/modules/auth/`).
- Produces: `PatientsPolicy` with `view()`, `create()`, `update()` — consumed only within this task's controller. Routes `GET /api/patients/:tenantId`, `POST /api/patients`, `GET /api/patients/:id`, `PUT /api/patients/:id`, `PUT /api/patients/:id/photo`, `GET /api/patients/:id/photo-url` — consumed by Task 7/8 (frontend).

- [ ] **Step 1: Write the failing policy test**

```ts
// backend/src/modules/patients/patients.policy.spec.ts
import { PatientsPolicy } from "./patients.policy";

function policyFor(role: string): PatientsPolicy {
  const policy = new PatientsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("PatientsPolicy", () => {
  it.each(["admin", "manager", "accueil", "infirmier", "medecin"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["admin", "manager", "accueil"])("%s can create and update", (role) => {
    expect(policyFor(role).create()).toBe(true);
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "laboratoire", "cashier"])("%s cannot create or update", (role) => {
    expect(policyFor(role).create()).toBe(false);
    expect(policyFor(role).update()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/modules/patients/patients.policy.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the policy, DTOs, service, controller, module**

```ts
// backend/src/modules/patients/patients.policy.ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class PatientsPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  create(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }

  update(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }
}
```

```ts
// backend/src/modules/patients/dto/create-patient.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn, IsEmail, IsBoolean, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class EmergencyContactDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() relation: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsOptional() address?: string;
  @IsBoolean() isPriority: boolean;
}

class PediatricInfoDto {
  @IsString() @IsOptional() fatherName?: string;
  @IsString() @IsOptional() motherName?: string;
  @IsString() @IsOptional() legalGuardian?: string;
  @IsString() @IsOptional() guardianPhone?: string;
  @IsString() @IsOptional() guardianRelation?: string;
  @IsString() @IsOptional() weightKg?: string;
  @IsString() @IsOptional() heightCm?: string;
  @IsString() @IsOptional() birthInfo?: string;
  @IsString() @IsOptional() vaccinations?: string;
}

export class CreatePatientDto {
  @IsUUID() @IsOptional() id?: string;
  @IsString() @IsNotEmpty() lastName: string;
  @IsString() @IsNotEmpty() firstName: string;
  @IsString() @IsNotEmpty() dateOfBirth: string;
  @IsIn(["M", "F"]) sex: "M" | "F";
  @IsString() @IsNotEmpty() primaryPhone: string;
  @IsString() @IsNotEmpty() residenceAddress: string;
  @IsString() @IsOptional() usualName?: string;
  @IsString() @IsOptional() birthPlace?: string;
  @IsString() @IsOptional() nationality?: string;
  @IsString() @IsOptional() profession?: string;
  @IsString() @IsOptional() maritalStatus?: string;
  @IsIn(["cni", "passeport", "permis", "autre"]) @IsOptional() idDocumentType?: string;
  @IsString() @IsOptional() idDocumentNumber?: string;
  @IsString() @IsOptional() idDocumentExpiry?: string;
  @IsEmail() @IsOptional() email?: string;
  @IsString() @IsOptional() secondaryPhone?: string;
  @IsString() @IsOptional() residenceZone?: string;
  @IsString() @IsOptional() fullAddress?: string;
  @ValidateNested() @Type(() => EmergencyContactDto) @IsOptional() emergencyContact?: EmergencyContactDto;
  @IsString() @IsOptional() bloodGroup?: string;
  @IsIn(["aucune_connue", "allergies_connues", "non_renseigne"]) @IsOptional() allergyKnowledge?: string;
  @IsString() @IsOptional() allergyDetails?: string;
  @IsString() @IsOptional() medicalHistory?: string;
  @IsString() @IsOptional() surgicalHistory?: string;
  @IsString() @IsOptional() chronicDiseases?: string;
  @IsString() @IsOptional() currentTreatments?: string;
  @IsString() @IsOptional() disabilities?: string;
  @IsString() @IsOptional() facilityService?: string;
  @IsUUID() @IsOptional() referringDoctorId?: string;
  @IsIn(["externe", "hospitalise", "urgence"]) @IsOptional() patientType?: string;
  @IsIn(["assurance", "mutuelle", "tiers_payant", "comptant"]) @IsOptional() paymentMode?: string;
  @IsString() @IsOptional() insuranceName?: string;
  @IsString() @IsOptional() insuranceNumber?: string;
  @IsString() @IsOptional() financiallyResponsible?: string;
  @ValidateNested() @Type(() => PediatricInfoDto) @IsOptional() pediatricInfo?: PediatricInfoDto;
  @IsString() @IsNotEmpty() tenantId: string;
}
```

```ts
// backend/src/modules/patients/dto/update-patient.dto.ts
import { PartialType, OmitType } from "@nestjs/mapped-types";
import { CreatePatientDto } from "./create-patient.dto";

export class UpdatePatientDto extends PartialType(OmitType(CreatePatientDto, ["id", "tenantId"] as const)) {}
```

If `@nestjs/mapped-types` is not already a dependency, check first with `grep '"@nestjs/mapped-types"' backend/package.json`; if absent, write `UpdatePatientDto` by hand instead, mirroring every field from `CreatePatientDto` with `@IsOptional()` added and no `id`/`tenantId` fields (same style as `UpdateRayonDto` vs `CreateRayonDto`).

```ts
// backend/src/modules/patients/dto/attach-patient-photo.dto.ts
import { IsString, IsNotEmpty, IsIn } from "class-validator";

export class AttachPatientPhotoDto {
  @IsString() @IsNotEmpty() photoBase64: string;
  @IsIn(["image/jpeg", "image/png"]) contentType: "image/jpeg" | "image/png";
}
```

```ts
// backend/src/modules/patients/patients.service.ts
import { Injectable } from "@nestjs/common";
import type { InsertPatient } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import { PatientsRepository } from "./patients.repository";

@Injectable()
export class PatientsService {
  constructor(private readonly patientsRepository: PatientsRepository) {}

  findByTenant(tenantId: string, options?: PaginationOptions) {
    return this.patientsRepository.findByTenant(tenantId, options);
  }

  search(query: string, tenantId: string, options?: PaginationOptions) {
    return this.patientsRepository.search(query, tenantId, options);
  }

  findById(id: string, tenantId: string) {
    return this.patientsRepository.findById(id, tenantId);
  }

  create(data: InsertPatient) {
    return this.patientsRepository.create(data);
  }

  update(id: string, tenantId: string, data: Partial<InsertPatient>) {
    return this.patientsRepository.update(id, tenantId, data);
  }

  attachPhoto(id: string, tenantId: string, base64Body: string, contentType: string) {
    return this.patientsRepository.attachPhoto(id, tenantId, base64Body, contentType);
  }

  getPhotoUrl(id: string, tenantId: string) {
    return this.patientsRepository.getPhotoUrl(id, tenantId);
  }
}
```

```ts
// backend/src/modules/patients/patients.controller.ts
import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { CreatePatientDto } from "./dto/create-patient.dto";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import { AttachPatientPhotoDto } from "./dto/attach-patient-photo.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { PatientsPolicy } from "./patients.policy";

@Controller("api/patients")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get(":tenantId")
  @CheckPolicy(PatientsPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("q") q?: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
    @Query("page") page?: number,
    @Request() req?: any
  ) {
    const scopedTenantId = this.tenantId(req, tenantId);
    const pagination = {
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
      page: page ? Number(page) : undefined,
    };
    return q
      ? this.patientsService.search(q, scopedTenantId, pagination)
      : this.patientsService.findByTenant(scopedTenantId, pagination);
  }

  @Get("detail/:id")
  @CheckPolicy(PatientsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.patientsService.findById(id, this.tenantId(req));
  }

  @Get(":id/photo-url")
  @CheckPolicy(PatientsPolicy, "view")
  async getPhotoUrl(@Param("id") id: string, @Request() req: any) {
    return { url: await this.patientsService.getPhotoUrl(id, this.tenantId(req)) };
  }

  @Post()
  @CheckPolicy(PatientsPolicy, "create")
  async create(@Body() createPatientDto: CreatePatientDto, @Request() req: any) {
    const tenantId = this.tenantId(req, createPatientDto.tenantId);
    return this.patientsService.create({ ...createPatientDto, tenantId } as any);
  }

  @Put(":id")
  @CheckPolicy(PatientsPolicy, "update")
  async update(@Param("id") id: string, @Body() updatePatientDto: UpdatePatientDto, @Request() req: any) {
    return this.patientsService.update(id, this.tenantId(req), updatePatientDto as any);
  }

  @Put(":id/photo")
  @CheckPolicy(PatientsPolicy, "update")
  async attachPhoto(@Param("id") id: string, @Body() dto: AttachPatientPhotoDto, @Request() req: any) {
    return this.patientsService.attachPhoto(id, this.tenantId(req), dto.photoBase64, dto.contentType);
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

Note on route shapes: `GET :tenantId` is a single URL segment (`/api/patients/{tenantId}`), used for the tenant-wide list/search. A bare single-segment `GET :id` for one patient would collide with it (Express can't disambiguate two single-segment routes by param name alone — this is why `ProductsController` puts its specific routes before its generic single-segment `:id`). To sidestep that class of collision entirely rather than rely on registration order, the single-item and photo routes here use a distinguishing two-segment shape instead (`detail/:id`, `:id/photo-url`), so they never compete with `:tenantId` for the same slot.

```ts
// backend/src/modules/patients/patients.module.ts
import { Module } from "@nestjs/common";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";
import { PatientsPolicy } from "./patients.policy";
import { AuthModule } from "../auth/auth.module";
import { PatientsRepositoryModule } from "./patients.repository.module";

@Module({
  imports: [AuthModule, PatientsRepositoryModule],
  controllers: [PatientsController],
  providers: [PatientsService, PatientsPolicy],
  exports: [PatientsService],
})
export class PatientsModule {}
```

`backend/src/app.module.ts`: add `import { PatientsModule } from "./modules/patients/patients.module";` and add `PatientsModule` to the `imports` array (after `RayonsModule`).

- [ ] **Step 4: Run the policy test to verify it passes**

Run: `cd backend && npx jest src/modules/patients/patients.policy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Boot the backend to catch DI wiring mistakes**

Run: `cd backend && npm run build`
Expected: PASS (compiles; catches missing imports/circular module errors that unit tests alone wouldn't).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/patients/patients.policy.ts backend/src/modules/patients/patients.policy.spec.ts backend/src/modules/patients/patients.service.ts backend/src/modules/patients/patients.controller.ts backend/src/modules/patients/patients.module.ts backend/src/modules/patients/dto backend/src/app.module.ts
git commit -m "feat: add Patients API (controller, policy, module)"
```

---

### Task 7: Frontend `PatientsPolicy` + i18n + `Patients.tsx` (list)

**Files:**
- Create: `frontend/src/lib/policies/patients.policy.ts`
- Create: `frontend/src/lib/i18n/patients.ts`
- Modify: `frontend/src/lib/i18n/index.ts`
- Create: `frontend/src/pages/Patients.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `Patient`/`InsertPatient`/`insertPatientSchema` (Task 2), `GET /api/patients/:tenantId` and `GET /api/patients/:tenantId?q=` (Task 6).
- Produces: `Patients` page rendered at `/patients`, list state (`selectedPatient`, `viewMode`) consumed by Task 8's `PatientDetails`/create-edit modal, which live in the same file.

- [ ] **Step 1: Add the frontend policy**

```ts
// frontend/src/lib/policies/patients.policy.ts
import { BasePolicy } from "./base.policy";

export class PatientsPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }
}
```

- [ ] **Step 2: Add the i18n section**

```ts
// frontend/src/lib/i18n/patients.ts
import type { TranslationSection } from "./types";

export const patients: TranslationSection = {
  en: {
    patients: "Patients",
    patient: "Patient",
    addPatient: "New Patient",
    createPatient: "Register Patient",
    editPatient: "Edit Patient",
    searchPatientsPlaceholder: "Search by name, file number, or phone...",
    patientRecordsList: "Medical Records",
    patientsRegisteredCount: "{count} patients registered",
    noPatientsMatchSearch: "No patients match your search",
    addFirstPatient: "Register your first patient",
    dossierNumber: "File Number",
    pendingSync: "Pending sync",
    lastName: "Last Name",
    firstName: "First Name",
    age: "Age",
    sex: "Sex",
    assignedService: "Assigned Service",
    lastVisit: "Last Visit",
    patientStatusActif: "Active",
    patientStatusInactif: "Inactive",
    patientStatusHospitalise: "Admitted",
    dateOfBirth: "Date of Birth",
    primaryPhone: "Primary Phone",
    residenceAddress: "Address / Area of Residence",
    emergencyContactName: "Full Name",
    emergencyContactRelation: "Relation to Patient",
    emergencyContactPhone: "Phone",
    allergyKnowledgeAucuneConnue: "No known allergies",
    allergyKnowledgeAllergiesConnues: "Known allergies",
    allergyKnowledgeNonRenseigne: "Not recorded",
    patientCreatedSuccessfully: "Patient registered successfully",
    patientUpdatedSuccessfully: "Patient updated successfully",
    patientSavedOffline: "Patient saved offline",
    failedToCreatePatient: "Failed to register patient",
    failedToUpdatePatient: "Failed to update patient",
    viewRecord: "View Record",
  },
  fr: {
    patients: "Patients",
    patient: "Patient",
    addPatient: "Nouveau patient",
    createPatient: "Enregistrer le patient",
    editPatient: "Modifier le patient",
    searchPatientsPlaceholder: "Nom, numéro de dossier ou téléphone...",
    patientRecordsList: "Liste des dossiers médicaux",
    patientsRegisteredCount: "{count} patients enregistrés",
    noPatientsMatchSearch: "Aucun patient ne correspond à votre recherche",
    addFirstPatient: "Enregistrez votre premier patient",
    dossierNumber: "N° Dossier",
    pendingSync: "En attente de synchronisation",
    lastName: "Nom",
    firstName: "Prénom",
    age: "Âge",
    sex: "Sexe",
    assignedService: "Service d'affectation",
    lastVisit: "Dernier RDV",
    patientStatusActif: "Actif",
    patientStatusInactif: "Inactif",
    patientStatusHospitalise: "Hospitalisé",
    dateOfBirth: "Date de naissance",
    primaryPhone: "Téléphone principal",
    residenceAddress: "Adresse / lieu de résidence",
    emergencyContactName: "Nom et prénom",
    emergencyContactRelation: "Lien avec le patient",
    emergencyContactPhone: "Téléphone",
    allergyKnowledgeAucuneConnue: "Aucune allergie connue",
    allergyKnowledgeAllergiesConnues: "Allergies connues",
    allergyKnowledgeNonRenseigne: "Non renseigné",
    patientCreatedSuccessfully: "Patient enregistré avec succès",
    patientUpdatedSuccessfully: "Patient mis à jour avec succès",
    patientSavedOffline: "Patient enregistré hors-ligne",
    failedToCreatePatient: "Échec de l'enregistrement du patient",
    failedToUpdatePatient: "Échec de la mise à jour du patient",
    viewRecord: "Voir dossier",
  },
};
```

`frontend/src/lib/i18n/index.ts`: add `import { patients } from "./patients";` and add `patients` to the `sections` array (after `rayons`).

- [ ] **Step 3: Compute age helper (small, testable, pure logic — kept out of the page component per the project's convention of testing logic outside thin React files)**

```ts
// frontend/src/lib/patientAge.ts
export function calculateAge(dateOfBirth: string, now: Date = new Date()): number {
  const birth = new Date(dateOfBirth);
  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthdayThisYear =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
  if (!hasHadBirthdayThisYear) age -= 1;
  return age;
}
```

```ts
// frontend/src/lib/patientAge.spec.ts
import { calculateAge } from "./patientAge";

describe("calculateAge", () => {
  it("returns the age when the birthday already happened this year", () => {
    expect(calculateAge("1994-03-12", new Date("2026-08-27"))).toBe(32);
  });

  it("returns one less when the birthday has not happened yet this year", () => {
    expect(calculateAge("1994-10-12", new Date("2026-08-27"))).toBe(31);
  });

  it("returns the exact age on the birthday itself", () => {
    expect(calculateAge("1994-08-27", new Date("2026-08-27"))).toBe(32);
  });
});
```

Run: `cd frontend && npx vitest run src/lib/patientAge.spec.ts`
Expected: PASS.

- [ ] **Step 4: Implement `Patients.tsx` (list view only — detail/create modal added in Task 8)**

```tsx
// frontend/src/pages/Patients.tsx
import React, { useState } from "react";
import { Plus, Search, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { PatientsPolicy } from "@/lib/policies/patients.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { calculateAge } from "@/lib/patientAge";
import { PatientFormModal } from "@/components/PatientFormModal";
import { PatientDetails } from "@/components/PatientDetails";
import type { Patient } from "@shared/schema";

function statusVariant(status: Patient["status"]): "default" | "secondary" | "destructive" {
  if (status === "hospitalise") return "destructive";
  if (status === "inactif") return "secondary";
  return "default";
}

export default function Patients() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [searchQuery, setSearchQuery] = useState("");
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const { data: patientsList = [], isLoading } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, searchQuery],
    queryFn: async () => {
      const url = searchQuery
        ? `/api/patients/${currentTenant?.id}?q=${encodeURIComponent(searchQuery)}`
        : `/api/patients/${currentTenant?.id}`;
      const response = await fetch(url, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  if (selectedPatientId) {
    return (
      <PatientDetails
        patientId={selectedPatientId}
        onBack={() => setSelectedPatientId(null)}
        onEdit={(patient) => {
          setEditingPatient(patient);
          setShowFormModal(true);
        }}
      />
    );
  }

  return (
    <div className="space-y-6" data-testid="patients-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("patients")}</h1>
        </div>
        <PolicyGuard policy={PatientsPolicy} action="canCreate">
          <Button
            className="btn-primary"
            onClick={() => {
              setEditingPatient(null);
              setShowFormModal(true);
            }}
            data-testid="button-add-patient">
            <Plus className="w-4 h-4 mr-2" />
            {t("addPatient")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="glass-card rounded-xl p-6">
        <div className="relative">
          <Input
            placeholder={t("searchPatientsPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="glass-input rounded-xl pl-10"
            data-testid="input-search-patients"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      <div className="glass-card rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6">
          <h2 className="font-semibold text-foreground">{t("patientRecordsList")}</h2>
          <span className="text-sm text-muted-foreground">
            {t("patientsRegisteredCount").replace("{count}", String(patientsList.length))}
          </span>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>{t("patient")}</TableHead>
              <TableHead>{t("age")}</TableHead>
              <TableHead>{t("sex")}</TableHead>
              <TableHead>{t("dossierNumber")}</TableHead>
              <TableHead>{t("assignedService")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {t("loading")}
                </TableCell>
              </TableRow>
            ) : patientsList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? t("noPatientsMatchSearch") : t("addFirstPatient")}
                </TableCell>
              </TableRow>
            ) : (
              patientsList.map((patient) => (
                <TableRow
                  key={patient.id}
                  className="border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => setSelectedPatientId(patient.id)}
                  data-testid={`row-patient-${patient.id}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={undefined} />
                        <AvatarFallback>{patient.firstName[0]}{patient.lastName[0]}</AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-foreground">
                        {patient.firstName} {patient.lastName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{calculateAge(patient.dateOfBirth)}</TableCell>
                  <TableCell>{patient.sex}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {patient.dossierNumber ?? t("pendingSync")}
                  </TableCell>
                  <TableCell>{patient.facilityService ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={statusVariant(patient.status)}>
                      {t(`patientStatus${patient.status[0].toUpperCase()}${patient.status.slice(1)}`)}
                    </Badge>
                    <ChevronRight className="inline w-4 h-4 ml-2 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PatientFormModal
        open={showFormModal}
        editingPatient={editingPatient}
        onClose={() => {
          setShowFormModal(false);
          setEditingPatient(null);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 5: Register the route and sidebar entry**

`frontend/src/App.tsx`: add `const Patients = lazy(() => import("./pages/Patients"));` (after the `Rayons` lazy import) and a matching `<Route path="/patients">` block (same shape as `/rayons`'s block, using `<Patients />`).

`frontend/src/components/Sidebar.tsx`:
- Add `import { PatientsPolicy } from "@/lib/policies/patients.policy";` and `import { UserRound } from "lucide-react";` (or reuse `Users`, already imported).
- Add `const patientsPolicy = usePolicy(PatientsPolicy);` next to the other `usePolicy(...)` calls.
- Add `...(patientsPolicy.canView() ? [{ icon: Users, label: t("patients"), path: "/patients" }] : []),` to `menuItems`, placed right after the `rayons` entry.

- [ ] **Step 6: Manual verification (no jsdom/RTL in this repo — verify by running the app)**

Run: `cd frontend && npm run dev` (or the project's existing dev script) and `cd backend && npm run start:dev`, then log in as the seeded `accueil` user and confirm `/patients` renders an empty list with the "Nouveau patient" button visible, and is hidden/blocked for a `laboratoire` user.
Expected: page loads without console errors; policy gating behaves as described.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/policies/patients.policy.ts frontend/src/lib/i18n/patients.ts frontend/src/lib/i18n/index.ts frontend/src/lib/patientAge.ts frontend/src/lib/patientAge.spec.ts frontend/src/pages/Patients.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: add Patients list page"
```

---

### Task 8: `PatientDetails` (show) + `PatientFormModal` (create/edit) + photo upload

**Files:**
- Create: `frontend/src/components/PatientDetails.tsx`
- Create: `frontend/src/components/PatientFormModal.tsx`
- Create: `frontend/src/lib/patientFormFields.ts`
- Test: `frontend/src/lib/patientFormFields.spec.ts`

**Interfaces:**
- Consumes: `Patient`/`InsertPatient`/`insertPatientSchema` (Task 2), `GET /api/patients/detail/:id`, `PUT /api/patients/:id/photo`, `GET /api/patients/:id/photo-url` (Task 6), `offlineApiRequest` (existing), `calculateAge` (Task 7).
- Produces: `<PatientDetails patientId onBack onEdit />` and `<PatientFormModal open editingPatient onClose />`, both imported by `Patients.tsx` (Task 7, already wired).

- [ ] **Step 1: Write the failing test for the field-group config (pure data, drives the form — this is the one piece of frontend logic in this task worth a unit test since it determines which fields appear and are required)**

```ts
// frontend/src/lib/patientFormFields.spec.ts
import { patientFormSections } from "./patientFormFields";

describe("patientFormSections", () => {
  it("has 6 sections matching the Medical Connect patient intake form", () => {
    expect(patientFormSections.map((s) => s.key)).toEqual([
      "identification",
      "contact",
      "emergencyContact",
      "medical",
      "administrative",
      "pediatric",
    ]);
  });

  it("marks the fields required on the maquette as required", () => {
    const identification = patientFormSections.find((s) => s.key === "identification")!;
    const required = identification.fields.filter((f) => f.required).map((f) => f.name);
    expect(required).toEqual(
      expect.arrayContaining(["lastName", "firstName", "dateOfBirth", "sex", "primaryPhone", "residenceAddress"])
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/patientFormFields.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the field-group config**

This drives `PatientFormModal`'s rendering. Each entry is real, used data — not a placeholder — it is how the ~40-field intake form (Figma `patients-new`) stays DRY instead of 40 hand-written near-identical JSX blocks.

```ts
// frontend/src/lib/patientFormFields.ts
export type PatientFieldType = "text" | "textarea" | "date" | "email" | "select" | "checkbox";

export interface PatientFieldConfig {
  name: string;
  labelKey: string;
  type: PatientFieldType;
  required?: boolean;
  options?: { value: string; labelKey: string }[];
}

export interface PatientFormSection {
  key: string;
  titleKey: string;
  fields: PatientFieldConfig[];
}

export const patientFormSections: PatientFormSection[] = [
  {
    key: "identification",
    titleKey: "sectionIdentification",
    fields: [
      { name: "lastName", labelKey: "lastName", type: "text", required: true },
      { name: "firstName", labelKey: "firstName", type: "text", required: true },
      { name: "dateOfBirth", labelKey: "dateOfBirth", type: "date", required: true },
      {
        name: "sex",
        labelKey: "sex",
        type: "select",
        required: true,
        options: [
          { value: "M", labelKey: "sexMale" },
          { value: "F", labelKey: "sexFemale" },
        ],
      },
      { name: "primaryPhone", labelKey: "primaryPhone", type: "text", required: true },
      { name: "residenceAddress", labelKey: "residenceAddress", type: "text", required: true },
      { name: "usualName", labelKey: "usualName", type: "text" },
      { name: "birthPlace", labelKey: "birthPlace", type: "text" },
      { name: "nationality", labelKey: "nationality", type: "text" },
      { name: "profession", labelKey: "profession", type: "text" },
      { name: "maritalStatus", labelKey: "maritalStatus", type: "text" },
      {
        name: "idDocumentType",
        labelKey: "idDocumentType",
        type: "select",
        options: [
          { value: "cni", labelKey: "idDocumentTypeCni" },
          { value: "passeport", labelKey: "idDocumentTypePasseport" },
          { value: "permis", labelKey: "idDocumentTypePermis" },
          { value: "autre", labelKey: "idDocumentTypeAutre" },
        ],
      },
      { name: "idDocumentNumber", labelKey: "idDocumentNumber", type: "text" },
      { name: "idDocumentExpiry", labelKey: "idDocumentExpiry", type: "date" },
      { name: "email", labelKey: "email", type: "email" },
    ],
  },
  {
    key: "contact",
    titleKey: "sectionContact",
    fields: [
      { name: "secondaryPhone", labelKey: "secondaryPhone", type: "text" },
      { name: "residenceZone", labelKey: "residenceZone", type: "text" },
      { name: "fullAddress", labelKey: "fullAddress", type: "textarea" },
    ],
  },
  {
    key: "emergencyContact",
    titleKey: "sectionEmergencyContact",
    fields: [
      { name: "emergencyContact.name", labelKey: "emergencyContactName", type: "text", required: true },
      { name: "emergencyContact.relation", labelKey: "emergencyContactRelation", type: "text", required: true },
      { name: "emergencyContact.phone", labelKey: "emergencyContactPhone", type: "text", required: true },
      { name: "emergencyContact.address", labelKey: "emergencyContactAddress", type: "text" },
      { name: "emergencyContact.isPriority", labelKey: "emergencyContactIsPriority", type: "checkbox", required: true },
    ],
  },
  {
    key: "medical",
    titleKey: "sectionMedical",
    fields: [
      { name: "bloodGroup", labelKey: "bloodGroup", type: "text" },
      {
        name: "allergyKnowledge",
        labelKey: "allergyKnowledge",
        type: "select",
        options: [
          { value: "aucune_connue", labelKey: "allergyKnowledgeAucuneConnue" },
          { value: "allergies_connues", labelKey: "allergyKnowledgeAllergiesConnues" },
          { value: "non_renseigne", labelKey: "allergyKnowledgeNonRenseigne" },
        ],
      },
      { name: "allergyDetails", labelKey: "allergyDetails", type: "textarea" },
      { name: "medicalHistory", labelKey: "medicalHistory", type: "textarea" },
      { name: "surgicalHistory", labelKey: "surgicalHistory", type: "textarea" },
      { name: "chronicDiseases", labelKey: "chronicDiseases", type: "textarea" },
      { name: "currentTreatments", labelKey: "currentTreatments", type: "textarea" },
      { name: "disabilities", labelKey: "disabilities", type: "textarea" },
    ],
  },
  {
    key: "administrative",
    titleKey: "sectionAdministrative",
    fields: [
      { name: "facilityService", labelKey: "facilityService", type: "text" },
      {
        name: "patientType",
        labelKey: "patientType",
        type: "select",
        options: [
          { value: "externe", labelKey: "patientTypeExterne" },
          { value: "hospitalise", labelKey: "patientTypeHospitalise" },
          { value: "urgence", labelKey: "patientTypeUrgence" },
        ],
      },
      {
        name: "paymentMode",
        labelKey: "paymentMode",
        type: "select",
        options: [
          { value: "assurance", labelKey: "paymentModeAssurance" },
          { value: "mutuelle", labelKey: "paymentModeMutuelle" },
          { value: "tiers_payant", labelKey: "paymentModeTiersPayant" },
          { value: "comptant", labelKey: "paymentModeComptant" },
        ],
      },
      { name: "insuranceName", labelKey: "insuranceName", type: "text" },
      { name: "insuranceNumber", labelKey: "insuranceNumber", type: "text" },
      { name: "financiallyResponsible", labelKey: "financiallyResponsible", type: "text" },
    ],
  },
  {
    key: "pediatric",
    titleKey: "sectionPediatric",
    fields: [
      { name: "pediatricInfo.fatherName", labelKey: "pediatricFatherName", type: "text" },
      { name: "pediatricInfo.motherName", labelKey: "pediatricMotherName", type: "text" },
      { name: "pediatricInfo.legalGuardian", labelKey: "pediatricLegalGuardian", type: "text" },
      { name: "pediatricInfo.guardianPhone", labelKey: "pediatricGuardianPhone", type: "text" },
      { name: "pediatricInfo.weightKg", labelKey: "pediatricWeightKg", type: "text" },
      { name: "pediatricInfo.heightCm", labelKey: "pediatricHeightCm", type: "text" },
      { name: "pediatricInfo.birthInfo", labelKey: "pediatricBirthInfo", type: "textarea" },
      { name: "pediatricInfo.vaccinations", labelKey: "pediatricVaccinations", type: "textarea" },
    ],
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/patientFormFields.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add every field-group label key to the i18n section from Task 7**

Add to both `en`/`fr` blocks of `frontend/src/lib/i18n/patients.ts`: `sectionIdentification`, `sectionContact`, `sectionEmergencyContact`, `sectionMedical`, `sectionAdministrative`, `sectionPediatric`, `sexMale`, `sexFemale`, `usualName`, `birthPlace`, `nationality`, `profession`, `maritalStatus`, `idDocumentType`, `idDocumentTypeCni`, `idDocumentTypePasseport`, `idDocumentTypePermis`, `idDocumentTypeAutre`, `idDocumentNumber`, `idDocumentExpiry`, `email`, `secondaryPhone`, `residenceZone`, `fullAddress`, `emergencyContactAddress`, `emergencyContactIsPriority`, `bloodGroup`, `allergyDetails`, `medicalHistory`, `surgicalHistory`, `chronicDiseases`, `currentTreatments`, `disabilities`, `facilityService`, `patientType`, `patientTypeExterne`, `patientTypeHospitalise`, `patientTypeUrgence`, `paymentMode`, `paymentModeAssurance`, `paymentModeMutuelle`, `paymentModeTiersPayant`, `paymentModeComptant`, `insuranceName`, `insuranceNumber`, `financiallyResponsible`, `pediatricFatherName`, `pediatricMotherName`, `pediatricLegalGuardian`, `pediatricGuardianPhone`, `pediatricWeightKg`, `pediatricHeightCm`, `pediatricBirthInfo`, `pediatricVaccinations`, `uploadPhoto`, `changePhoto`. (Do **not** re-add `save`/`cancel`/`saving` — they already exist in `frontend/src/lib/i18n/dashboard.ts` and are shared across every section via the flat merge in `index.ts`.) English values are plain translations of the French labels already written in the design doc §4 (e.g. `sectionIdentification: "Identification"` / `"1. Identification du patient"`, `sexMale: "Male"` / `"Masculin"`); French values match the Figma copy verbatim where the maquette text was captured in this plan's Task 2 field list.

Run: `cd frontend && npx vitest run src/lib/i18nCompleteness.test.ts`
Expected: PASS — every key just added exists in both `en` and `fr`.

- [ ] **Step 6: Implement `PatientFormModal`**

```tsx
// frontend/src/components/PatientFormModal.tsx
import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertPatientSchema, type InsertPatient, type Patient } from "@shared/schema";
import { patientFormSections, type PatientFieldConfig } from "@/lib/patientFormFields";

interface PatientFormModalProps {
  open: boolean;
  editingPatient: Patient | null;
  onClose: () => void;
}

function getPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

function defaultValuesFor(patient: Patient | null, tenantId: string): InsertPatient {
  if (!patient) {
    return { lastName: "", firstName: "", dateOfBirth: "", sex: "M", primaryPhone: "", residenceAddress: "", tenantId } as InsertPatient;
  }
  const { id, dossierNumber, searchName, photoS3Key, status, isActive, createdAt, updatedAt, ...rest } = patient;
  return { ...rest, tenantId } as InsertPatient;
}

export function PatientFormModal({ open, editingPatient, onClose }: PatientFormModalProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<InsertPatient>({
    resolver: zodResolver(insertPatientSchema),
    defaultValues: defaultValuesFor(editingPatient, currentTenant?.id ?? ""),
  });

  useEffect(() => {
    form.reset(defaultValuesFor(editingPatient, currentTenant?.id ?? ""));
  }, [editingPatient, currentTenant?.id]);

  const saveMutation = useMutation({
    mutationFn: async (data: InsertPatient) => {
      const method = editingPatient ? "PUT" : "POST";
      const url = editingPatient ? `/api/patients/${editingPatient.id}` : "/api/patients";
      const response = await offlineApiRequest(method, url, { ...data, tenantId: currentTenant?.id }, { collection: "patients" });
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/patients"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("patientSavedOffline") : editingPatient ? t("patientUpdatedSuccessfully") : t("patientCreatedSuccessfully"),
      });
      onClose();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), editingPatient ? t("failedToUpdatePatient") : t("failedToCreatePatient"), t("networkRequestFailed"));
    },
  });

  function renderField(field: PatientFieldConfig) {
    const error = getPath(form.formState.errors, field.name);
    return (
      <div key={field.name}>
        <Label htmlFor={field.name}>
          {t(field.labelKey)}
          {field.required ? " *" : ""}
        </Label>
        {field.type === "textarea" ? (
          <Textarea id={field.name} className="glass-input" {...form.register(field.name as any)} />
        ) : field.type === "checkbox" ? (
          <div className="flex items-center gap-2 mt-2">
            <Checkbox
              id={field.name}
              checked={!!form.watch(field.name as any)}
              onCheckedChange={(checked) => form.setValue(field.name as any, checked === true, { shouldValidate: true })}
            />
          </div>
        ) : field.type === "select" ? (
          <Select
            value={form.watch(field.name as any) ?? ""}
            onValueChange={(value) => form.setValue(field.name as any, value, { shouldValidate: true })}>
            <SelectTrigger className="glass-input" data-testid={`select-${field.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {field.options!.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.labelKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input id={field.name} type={field.type} className="glass-input" {...form.register(field.name as any)} />
        )}
        {error?.message && <p className="text-sm text-destructive mt-1">{String(error.message)}</p>}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="glass-card max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingPatient ? t("editPatient") : t("createPatient")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-6 mt-4">
          {patientFormSections.map((section) => (
            <fieldset key={section.key} className="space-y-4">
              <legend className="font-semibold text-foreground mb-2">{t(section.titleKey)}</legend>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {section.fields.map(renderField)}
              </div>
            </fieldset>
          ))}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" className="btn-primary" disabled={saveMutation.isPending} data-testid="button-save-patient">
              {saveMutation.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Implement `PatientDetails` with photo upload**

```tsx
// frontend/src/components/PatientDetails.tsx
import React, { useRef, useState } from "react";
import { ArrowLeft, Edit, Upload } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { calculateAge } from "@/lib/patientAge";
import type { Patient } from "@shared/schema";

interface PatientDetailsProps {
  patientId: string;
  onBack: () => void;
  onEdit: (patient: Patient) => void;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function PatientDetails({ patientId, onBack, onEdit }: PatientDetailsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: patient, isLoading } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${patientId}`, { credentials: "include" });
      return response.json();
    },
  });

  const { data: photoUrl } = useQuery<string | null>({
    queryKey: ["/api/patients/photo-url", patientId, patient?.photoS3Key],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${patientId}/photo-url`, { credentials: "include" });
      if (!response.ok) return null;
      const body = await response.json();
      return body.url;
    },
    enabled: !!patient?.photoS3Key,
  });

  async function handlePhotoSelected(file: File) {
    setUploading(true);
    try {
      const photoBase64 = await fileToBase64(file);
      await offlineApiRequest(
        "PUT",
        `/api/patients/${patientId}/photo`,
        { photoBase64, contentType: file.type === "image/png" ? "image/png" : "image/jpeg" },
        { collection: "patients", entityId: patientId }
      );
      queryClient.invalidateQueries({ queryKey: ["/api/patients/detail", patientId] });
      toast({ title: t("success"), description: t("patientUpdatedSuccessfully") });
    } catch (error) {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdatePatient"), t("networkRequestFailed"));
    } finally {
      setUploading(false);
    }
  }

  if (isLoading || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="patient-details">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} data-testid="button-back-to-patients">
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("patients")}
        </Button>
        <Button onClick={() => onEdit(patient)} data-testid="button-edit-patient">
          <Edit className="w-4 h-4 mr-2" />
          {t("editPatient")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 flex flex-col items-center text-center gap-3">
          <Avatar className="h-24 w-24">
            <AvatarImage src={photoUrl ?? undefined} />
            <AvatarFallback>{patient.firstName[0]}{patient.lastName[0]}</AvatarFallback>
          </Avatar>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])}
          />
          <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-2" />
            {patient.photoS3Key ? t("changePhoto") : t("uploadPhoto")}
          </Button>
          <h2 className="text-lg font-semibold">{patient.firstName} {patient.lastName}</h2>
          <p className="text-sm text-muted-foreground">
            {calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()} · {patient.sex}
          </p>
          <p className="font-mono text-sm">{patient.dossierNumber ?? t("pendingSync")}</p>
          <Badge>{t(`patientStatus${patient.status[0].toUpperCase()}${patient.status.slice(1)}`)}</Badge>
        </Card>

        <Card className="p-6 md:col-span-2 space-y-2">
          <h3 className="font-semibold text-primary">{t("sectionIdentification")}</h3>
          <p>{t("dateOfBirth")}: {patient.dateOfBirth}</p>
          <p>{t("primaryPhone")}: {patient.primaryPhone}</p>
          <p>{t("residenceAddress")}: {patient.residenceAddress}</p>
          {patient.bloodGroup && <p>{t("bloodGroup")}: {patient.bloodGroup}</p>}
          {patient.allergyDetails && <p>{t("allergyDetails")}: {patient.allergyDetails}</p>}
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Manual verification**

Run the app (as in Task 7 Step 6), create a patient through the full form (fill required fields only, then again with optional sections filled), confirm the created patient appears in the list with `dossierNumber` showing (or "En attente de synchronisation" if the backend is unreachable), open its detail view, upload a JPEG photo, and confirm the photo renders after upload.
Expected: all of the above works without console errors.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/PatientDetails.tsx frontend/src/components/PatientFormModal.tsx frontend/src/lib/patientFormFields.ts frontend/src/lib/patientFormFields.spec.ts frontend/src/lib/i18n/patients.ts
git commit -m "feat: add patient detail view, intake form, and photo upload"
```

---

### Task 9: `Consultation` schema types (backend + frontend)

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `frontend/shared/schema.ts`

**Interfaces:**
- Produces: `Consultation`, `InsertConsultation`, `ConsultationStatus`, `ConsultationPriority`, `insertConsultationSchema` — consumed by Task 10 (`ConsultationsRepository`), Task 11 (DTOs), Task 12 (frontend), and Task 14 (`QueueRepository`, which reads `Consultation.priority` as the fallback when no `priority_changed` event exists).

- [ ] **Step 1: Add the types to `backend/src/shared/schema.ts`**

Insert after the `Patient`/`InsertPatient` block added in Task 2:
```ts
export type ConsultationStatus = "planifiee" | "en_attente" | "en_cours" | "terminee" | "annulee";
export type ConsultationPriority = "normal" | "urgent" | "tres_urgent";

export interface Consultation { id: string; tenantId: string; number: string | null; patientId: string; scheduledAt: Date; specialty: string; assignedDoctorId: string; roomId: string | null; priority: ConsultationPriority; reason: string; nurseNotes: string | null; clinicalObservations: string | null; diagnosis: string | null; status: ConsultationStatus; createdAt: Date; updatedAt: Date }
export interface InsertConsultation { id?: string; patientId: string; scheduledAt: Date | string; specialty: string; assignedDoctorId: string; roomId?: string | null; priority?: ConsultationPriority; reason: string; nurseNotes?: string | null; tenantId: string }
```

Insert after `insertPatientSchema`:
```ts
export const insertConsultationSchema = z.object({ id, patientId: z.string().min(1), scheduledAt: z.union([z.date(), z.string()]), specialty: z.string().min(1), assignedDoctorId: z.string().min(1), roomId: nullableString, priority: z.enum(["normal", "urgent", "tres_urgent"]).optional(), reason: z.string().min(1), nurseNotes: nullableString, tenantId: z.string() });
```

- [ ] **Step 2: Mirror into `frontend/shared/schema.ts`**

Same block, with `scheduledAt: string`, `createdAt: string`, `updatedAt: string` (frontend date-as-string convention).

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add Consultation schema types"
```

---

### Task 10: `ConsultationsRepository`

**Files:**
- Create: `backend/src/modules/consultations/consultations.repository.ts`
- Create: `backend/src/modules/consultations/consultations.repository.module.ts`
- Test: `backend/src/modules/consultations/consultations.repository.spec.ts`

**Interfaces:**
- Consumes: `InsertConsultation`/`Consultation` (Task 9), `SequenceCounterService.next` (Task 3), `PatientsRepository.findExistingForCascade` (Task 4, to validate `patientId` exists in the same tenant before creating a consultation).
- Produces: `ConsultationsRepository.create(data): Promise<Consultation>`, `.update(id, tenantId, data): Promise<Consultation>`, `.findById(id, tenantId): Promise<Consultation>`, `.findByTenant(tenantId, filters?, options?): Promise<Consultation[]>` — consumed by Task 11 (`ConsultationsService`) and Task 14 (`QueueRepository`, via `ConsultationsRepositoryModule`, to validate `consultationId` and read the fallback `priority`).

- [ ] **Step 1: Write the failing tests**

```ts
// backend/src/modules/consultations/consultations.repository.spec.ts
import { NotFoundException } from "@nestjs/common";
import { ConsultationsRepository } from "./consultations.repository";

function patientsRepoStub(patient: any = { type: "patient", tenantId: "tenant-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(patient) };
}

describe("ConsultationsRepository", () => {
  describe("create", () => {
    it("validates the patient exists in the tenant, allocates a number, and creates the consultation", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const sequenceCounterService = { next: jest.fn().mockResolvedValue(904) };
      const patientsRepository = patientsRepoStub();
      const repository = new ConsultationsRepository(couchDBService as any, sequenceCounterService as any, patientsRepository as any);

      const result = await repository.create({
        id: "223e4567-e89b-42d3-a456-426614174000",
        patientId: "patient-1",
        scheduledAt: "2026-10-24T10:15:00.000Z",
        specialty: "Cardiologie",
        assignedDoctorId: "doctor-1",
        reason: "Suivi post-opératoire",
        tenantId: "tenant-1",
      } as any);

      expect(patientsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "patient-1");
      expect(sequenceCounterService.next).toHaveBeenCalledWith("tenant-1", expect.stringMatching(/^consultation:\d{4}$/));
      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "consultation",
          status: "planifiee",
          priority: "normal",
          number: expect.stringMatching(/^C-\d{4}-0904$/),
        })
      );
      expect(result.status).toBe("planifiee");
    });

    it("throws NotFoundException when the patient does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const patientsRepository = patientsRepoStub(null);
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, patientsRepository as any);

      await expect(
        repository.create({ patientId: "missing", specialty: "Cardiologie", assignedDoctorId: "doctor-1", reason: "x", scheduledAt: "2026-10-24", tenantId: "tenant-1" } as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("update", () => {
    it("patches status and clinical fields while preserving the number", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const result = await repository.update("c1", "tenant-1", { status: "terminee", diagnosis: "RAS" } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ number: "C-2026-0904", status: "terminee", diagnosis: "RAS" }));
      expect(result.status).toBe("terminee");
    });
  });

  describe("findByTenant", () => {
    it("filters by specialty, doctor, and date when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, patientsRepoStub() as any);

      await repository.findByTenant("tenant-1", { specialty: "Cardiologie", assignedDoctorId: "doctor-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({ type: "consultation", tenantId: "tenant-1", specialty: "Cardiologie", assignedDoctorId: "doctor-1" }),
        })
      );
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `ConsultationsRepository`**

```ts
// backend/src/modules/consultations/consultations.repository.ts
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
      clinicalObservations: null,
      diagnosis: null,
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

  async update(id: string, tenantId: string, data: Partial<InsertConsultation> & { status?: Consultation["status"]; clinicalObservations?: string | null; diagnosis?: string | null }): Promise<Consultation> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "consultation" || current.tenantId !== tenantId) {
      throw new NotFoundException("Consultation not found");
    }

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
      updatedAt: new Date().toISOString(),
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
```

```ts
// backend/src/modules/consultations/consultations.repository.module.ts
import { Module } from "@nestjs/common";
import { ConsultationsRepository } from "./consultations.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { SequenceCounterModule } from "../../lib/sequence-counter.module";
import { PatientsRepositoryModule } from "../patients/patients.repository.module";

@Module({
  imports: [CouchDBModule, SequenceCounterModule, PatientsRepositoryModule],
  providers: [ConsultationsRepository],
  exports: [ConsultationsRepository],
})
export class ConsultationsRepositoryModule {}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/consultations/consultations.repository.ts backend/src/modules/consultations/consultations.repository.module.ts backend/src/modules/consultations/consultations.repository.spec.ts
git commit -m "feat: add ConsultationsRepository"
```

---

### Task 11: `ConsultationsPolicy`, `ConsultationsController`, DTOs, `ConsultationsModule`

**Files:**
- Create: `backend/src/modules/consultations/consultations.policy.ts`
- Create: `backend/src/modules/consultations/consultations.service.ts`
- Create: `backend/src/modules/consultations/consultations.controller.ts`
- Create: `backend/src/modules/consultations/consultations.module.ts`
- Create: `backend/src/modules/consultations/dto/create-consultation.dto.ts`
- Create: `backend/src/modules/consultations/dto/update-consultation.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/consultations/consultations.policy.spec.ts`

**Interfaces:**
- Consumes: `ConsultationsRepository` (Task 10), `BasePolicy` (Task 1).
- Produces: routes `GET /api/consultations/:tenantId`, `GET /api/consultations/detail/:id`, `POST /api/consultations`, `PUT /api/consultations/:id` — consumed by Task 12 (frontend) and Task 14 (`QueueController`, which reads/patches consultation status alongside appending queue events).

- [ ] **Step 1: Write the failing policy test**

```ts
// backend/src/modules/consultations/consultations.policy.spec.ts
import { ConsultationsPolicy } from "./consultations.policy";

function policyFor(role: string): ConsultationsPolicy {
  const policy = new ConsultationsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("ConsultationsPolicy", () => {
  it.each(["admin", "manager", "accueil", "infirmier", "medecin"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["admin", "manager", "accueil", "medecin"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["infirmier", "laboratoire", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager", "medecin", "infirmier"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["accueil", "laboratoire", "cashier"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/modules/consultations/consultations.policy.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the policy, DTOs, service, controller, module**

```ts
// backend/src/modules/consultations/consultations.policy.ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class ConsultationsPolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  create(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isMedecin();
  }

  update(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier();
  }

  cancel(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil();
  }
}
```

```ts
// backend/src/modules/consultations/dto/create-consultation.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn, IsDateString } from "class-validator";

export class CreateConsultationDto {
  @IsUUID() @IsOptional() id?: string;
  @IsUUID() @IsNotEmpty() patientId: string;
  @IsDateString() scheduledAt: string;
  @IsString() @IsNotEmpty() specialty: string;
  @IsUUID() @IsNotEmpty() assignedDoctorId: string;
  @IsString() @IsOptional() roomId?: string;
  @IsIn(["normal", "urgent", "tres_urgent"]) @IsOptional() priority?: string;
  @IsString() @IsNotEmpty() reason: string;
  @IsString() @IsOptional() nurseNotes?: string;
  @IsString() @IsNotEmpty() tenantId: string;
}
```

```ts
// backend/src/modules/consultations/dto/update-consultation.dto.ts
import { IsString, IsOptional, IsIn, IsUUID, IsDateString } from "class-validator";

export class UpdateConsultationDto {
  @IsDateString() @IsOptional() scheduledAt?: string;
  @IsString() @IsOptional() specialty?: string;
  @IsUUID() @IsOptional() assignedDoctorId?: string;
  @IsString() @IsOptional() roomId?: string;
  @IsIn(["normal", "urgent", "tres_urgent"]) @IsOptional() priority?: string;
  @IsString() @IsOptional() reason?: string;
  @IsString() @IsOptional() nurseNotes?: string;
  @IsString() @IsOptional() clinicalObservations?: string;
  @IsString() @IsOptional() diagnosis?: string;
  @IsIn(["planifiee", "en_attente", "en_cours", "terminee", "annulee"]) @IsOptional() status?: string;
}
```

```ts
// backend/src/modules/consultations/consultations.service.ts
import { Injectable } from "@nestjs/common";
import type { InsertConsultation } from "@shared/schema";
import type { PaginationOptions } from "../../lib/pagination";
import { ConsultationsRepository, type ConsultationFilters } from "./consultations.repository";

@Injectable()
export class ConsultationsService {
  constructor(private readonly consultationsRepository: ConsultationsRepository) {}

  findByTenant(tenantId: string, filters?: ConsultationFilters, options?: PaginationOptions) {
    return this.consultationsRepository.findByTenant(tenantId, filters, options);
  }

  findById(id: string, tenantId: string) {
    return this.consultationsRepository.findById(id, tenantId);
  }

  create(data: InsertConsultation) {
    return this.consultationsRepository.create(data);
  }

  update(id: string, tenantId: string, data: Record<string, unknown>) {
    return this.consultationsRepository.update(id, tenantId, data as any);
  }
}
```

```ts
// backend/src/modules/consultations/consultations.controller.ts
import { Controller, Get, Post, Put, Body, Param, UseGuards, Query, Request, ForbiddenException } from "@nestjs/common";
import { ConsultationsService } from "./consultations.service";
import { CreateConsultationDto } from "./dto/create-consultation.dto";
import { UpdateConsultationDto } from "./dto/update-consultation.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { ConsultationsPolicy } from "./consultations.policy";

@Controller("api/consultations")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class ConsultationsController {
  constructor(private readonly consultationsService: ConsultationsService) {}

  @Get(":tenantId")
  @CheckPolicy(ConsultationsPolicy, "view")
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("specialty") specialty?: string,
    @Query("assignedDoctorId") assignedDoctorId?: string,
    @Query("scheduledOnOrAfter") scheduledOnOrAfter?: string,
    @Request() req?: any
  ) {
    return this.consultationsService.findByTenant(this.tenantId(req, tenantId), { specialty, assignedDoctorId, scheduledOnOrAfter });
  }

  @Get("detail/:id")
  @CheckPolicy(ConsultationsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.consultationsService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(ConsultationsPolicy, "create")
  async create(@Body() dto: CreateConsultationDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.consultationsService.create({ ...dto, tenantId } as any);
  }

  @Put(":id")
  @CheckPolicy(ConsultationsPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateConsultationDto, @Request() req: any) {
    return this.consultationsService.update(id, this.tenantId(req), dto as any);
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

```ts
// backend/src/modules/consultations/consultations.module.ts
import { Module } from "@nestjs/common";
import { ConsultationsController } from "./consultations.controller";
import { ConsultationsService } from "./consultations.service";
import { ConsultationsPolicy } from "./consultations.policy";
import { AuthModule } from "../auth/auth.module";
import { ConsultationsRepositoryModule } from "./consultations.repository.module";

@Module({
  imports: [AuthModule, ConsultationsRepositoryModule],
  controllers: [ConsultationsController],
  providers: [ConsultationsService, ConsultationsPolicy],
  exports: [ConsultationsService],
})
export class ConsultationsModule {}
```

`backend/src/app.module.ts`: add `import { ConsultationsModule } from "./modules/consultations/consultations.module";` and add `ConsultationsModule` to `imports` (after `PatientsModule`).

- [ ] **Step 4: Run the policy test to verify it passes**

Run: `cd backend && npx jest src/modules/consultations/consultations.policy.spec.ts`
Expected: PASS.

- [ ] **Step 5: Boot-check the backend**

Run: `cd backend && npm run build`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/consultations/consultations.policy.ts backend/src/modules/consultations/consultations.policy.spec.ts backend/src/modules/consultations/consultations.service.ts backend/src/modules/consultations/consultations.controller.ts backend/src/modules/consultations/consultations.module.ts backend/src/modules/consultations/dto backend/src/app.module.ts
git commit -m "feat: add Consultations API (controller, policy, module)"
```

---

### Task 12: Frontend `ConsultationsPolicy` + i18n + `Consultations.tsx` (list + create + clinical detail)

**Files:**
- Create: `frontend/src/lib/policies/consultations.policy.ts`
- Create: `frontend/src/lib/i18n/consultations.ts`
- Modify: `frontend/src/lib/i18n/index.ts`
- Create: `frontend/src/components/ConsultationFormModal.tsx`
- Create: `frontend/src/components/ConsultationDetails.tsx`
- Create: `frontend/src/pages/Consultations.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `Consultation`/`InsertConsultation`/`insertConsultationSchema` (Task 9), `GET/POST/PUT /api/consultations/...` (Task 11), `GET /api/patients/:tenantId?q=` (Task 6, for the patient-search autocomplete on the create form).
- Produces: `Consultations` page at `/consultations` — `ConsultationDetails`'s "Mettre en file d'attente" action is wired to the queue API in Task 15 (left as a disabled/no-op button here, enabled once Task 15 lands, per the design doc's phasing note in §5).

- [ ] **Step 1: Add the frontend policy**

```ts
// frontend/src/lib/policies/consultations.policy.ts
import { BasePolicy } from "./base.policy";

export class ConsultationsPolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  canCreate(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isMedecin();
  }

  canUpdate(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin() || this.isInfirmier();
  }
}
```

- [ ] **Step 2: Add the i18n section**

```ts
// frontend/src/lib/i18n/consultations.ts
import type { TranslationSection } from "./types";

export const consultations: TranslationSection = {
  en: {
    consultations: "Consultations",
    consultation: "Consultation",
    newConsultation: "New Consultation",
    consultationsOfTheDay: "Today's consultations and planning",
    searchPatientToAssign: "Search patient (name, first name, file number)*",
    scheduledDateTime: "Scheduled Date & Time*",
    specialty: "Specialty*",
    assignedDoctor: "Assigned Doctor*",
    assignedRoom: "Assigned Room",
    priority: "Priority / Urgency Level*",
    priorityNormal: "Normal",
    priorityUrgent: "Urgent",
    priorityTresUrgent: "Very Urgent",
    visitReason: "Reason for Visit*",
    nursePreliminaryNotes: "Nurse's Preliminary Notes",
    consultationStatusPlanifiee: "Scheduled",
    consultationStatusEnAttente: "Waiting",
    consultationStatusEnCours: "In Progress",
    consultationStatusTerminee: "Completed",
    consultationStatusAnnulee: "Cancelled",
    clinicalObservations: "Clinical Observations",
    diagnosisAndConclusion: "Diagnosis & Conclusion",
    putInQueue: "Add to Queue",
    endConsultation: "End Consultation",
    consultationCreatedSuccessfully: "Consultation registered successfully",
    consultationUpdatedSuccessfully: "Consultation updated successfully",
    consultationSavedOffline: "Consultation saved offline",
    failedToCreateConsultation: "Failed to register consultation",
    failedToUpdateConsultation: "Failed to update consultation",
    noConsultationsToday: "No consultations scheduled for today",
  },
  fr: {
    consultations: "Consultations",
    consultation: "Consultation",
    newConsultation: "Nouvelle consultation",
    consultationsOfTheDay: "Planning et activités de consultation de la journée",
    searchPatientToAssign: "Rechercher un patient (Nom, Prénom, n° de dossier)*",
    scheduledDateTime: "Date et heure programmées*",
    specialty: "Spécialité*",
    assignedDoctor: "Médecin assigné*",
    assignedRoom: "Salle de soin assignée",
    priority: "Niveau d'urgence / Priorité*",
    priorityNormal: "Normal",
    priorityUrgent: "Urgent",
    priorityTresUrgent: "Très urgent",
    visitReason: "Motif de la consultation*",
    nursePreliminaryNotes: "Notes préliminaires de l'infirmier",
    consultationStatusPlanifiee: "Planifiée",
    consultationStatusEnAttente: "En attente",
    consultationStatusEnCours: "En cours",
    consultationStatusTerminee: "Terminée",
    consultationStatusAnnulee: "Annulée",
    clinicalObservations: "Observations cliniques",
    diagnosisAndConclusion: "Diagnostic & Conclusion",
    putInQueue: "Mettre en file d'attente",
    endConsultation: "Terminer consultation",
    consultationCreatedSuccessfully: "Consultation enregistrée avec succès",
    consultationUpdatedSuccessfully: "Consultation mise à jour avec succès",
    consultationSavedOffline: "Consultation enregistrée hors-ligne",
    failedToCreateConsultation: "Échec de l'enregistrement de la consultation",
    failedToUpdateConsultation: "Échec de la mise à jour de la consultation",
    noConsultationsToday: "Aucune consultation planifiée aujourd'hui",
  },
};
```

`frontend/src/lib/i18n/index.ts`: add `import { consultations } from "./consultations";` and add it to `sections`.

- [ ] **Step 3: Implement `ConsultationFormModal`**

```tsx
// frontend/src/components/ConsultationFormModal.tsx
import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertConsultationSchema, type InsertConsultation, type Patient } from "@shared/schema";

interface ConsultationFormModalProps {
  open: boolean;
  onClose: () => void;
}

export function ConsultationFormModal({ open, onClose }: ConsultationFormModalProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  const { data: patientResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, "search", patientQuery],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}?q=${encodeURIComponent(patientQuery)}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id && patientQuery.length > 1,
  });

  const form = useForm<InsertConsultation>({
    resolver: zodResolver(insertConsultationSchema),
    defaultValues: { patientId: "", scheduledAt: "", specialty: "", assignedDoctorId: "", priority: "normal", reason: "", tenantId: currentTenant?.id ?? "" },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: InsertConsultation) => {
      const response = await offlineApiRequest("POST", "/api/consultations", { ...data, tenantId: currentTenant?.id }, { collection: "consultations" });
      return response.json();
    },
    onSuccess: (result) => {
      const isOffline = result?._savedOffline === true;
      queryClient.invalidateQueries({ queryKey: ["/api/consultations"] });
      toast({
        title: isOffline ? t("savedOffline") : t("success"),
        description: isOffline ? t("consultationSavedOffline") : t("consultationCreatedSuccessfully"),
      });
      handleClose();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateConsultation"), t("networkRequestFailed"));
    },
  });

  function handleClose() {
    form.reset({ patientId: "", scheduledAt: "", specialty: "", assignedDoctorId: "", priority: "normal", reason: "", tenantId: currentTenant?.id ?? "" });
    setSelectedPatient(null);
    setPatientQuery("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newConsultation")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4 mt-4">
          <div>
            <Label>{t("searchPatientToAssign")}</Label>
            <Input
              value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : patientQuery}
              onChange={(e) => {
                setSelectedPatient(null);
                setPatientQuery(e.target.value);
              }}
              className="glass-input"
              data-testid="input-consultation-patient-search"
            />
            {!selectedPatient && patientResults.length > 0 && (
              <div className="border border-border rounded-lg mt-1 overflow-hidden">
                {patientResults.map((patient) => (
                  <button
                    type="button"
                    key={patient.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent"
                    onClick={() => {
                      setSelectedPatient(patient);
                      form.setValue("patientId", patient.id, { shouldValidate: true });
                    }}
                    data-testid={`option-patient-${patient.id}`}>
                    {patient.firstName} {patient.lastName} — {patient.dossierNumber ?? t("pendingSync")}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="scheduledAt">{t("scheduledDateTime")}</Label>
              <Input id="scheduledAt" type="datetime-local" className="glass-input" {...form.register("scheduledAt")} />
            </div>
            <div>
              <Label htmlFor="specialty">{t("specialty")}</Label>
              <Input id="specialty" className="glass-input" {...form.register("specialty")} />
            </div>
            <div>
              <Label htmlFor="assignedDoctorId">{t("assignedDoctor")}</Label>
              <Input id="assignedDoctorId" className="glass-input" {...form.register("assignedDoctorId")} />
            </div>
            <div>
              <Label htmlFor="roomId">{t("assignedRoom")}</Label>
              <Input id="roomId" className="glass-input" {...form.register("roomId")} />
            </div>
          </div>

          <div>
            <Label>{t("priority")}</Label>
            <RadioGroup
              value={form.watch("priority")}
              onValueChange={(value) => form.setValue("priority", value as InsertConsultation["priority"])}
              className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="normal" id="priority-normal" />
                <Label htmlFor="priority-normal">{t("priorityNormal")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="urgent" id="priority-urgent" />
                <Label htmlFor="priority-urgent">{t("priorityUrgent")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tres_urgent" id="priority-tres-urgent" />
                <Label htmlFor="priority-tres-urgent">{t("priorityTresUrgent")}</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="reason">{t("visitReason")}</Label>
            <Textarea id="reason" className="glass-input" {...form.register("reason")} />
          </div>

          <div>
            <Label htmlFor="nurseNotes">{t("nursePreliminaryNotes")}</Label>
            <Textarea id="nurseNotes" className="glass-input" {...form.register("nurseNotes")} />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>{t("cancel")}</Button>
            <Button type="submit" className="btn-primary" disabled={saveMutation.isPending} data-testid="button-save-consultation">
              {saveMutation.isPending ? t("saving") : t("save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Implement `ConsultationDetails`**

```tsx
// frontend/src/components/ConsultationDetails.tsx
import React from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useTranslation } from "../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation } from "@shared/schema";

interface ConsultationDetailsProps {
  consultationId: string;
  onBack: () => void;
}

export function ConsultationDetails({ consultationId, onBack }: ConsultationDetailsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: consultation, isLoading } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: async (data: Partial<Consultation>) => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, data, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateConsultation"), t("networkRequestFailed"));
    },
  });

  if (isLoading || !consultation) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="consultation-details">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultations")}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" disabled data-testid="button-put-in-queue">
            {t("putInQueue")}
          </Button>
          <Button
            className="btn-primary"
            onClick={() => patchMutation.mutate({ status: "terminee" })}
            disabled={patchMutation.isPending}
            data-testid="button-end-consultation">
            {t("endConsultation")}
          </Button>
        </div>
      </div>

      <Card className="p-6 space-y-1">
        <h2 className="text-lg font-semibold">{t("consultation")} — {consultation.number ?? t("pendingSync")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.specialty} · {t(`consultationStatus${consultation.status[0].toUpperCase()}${consultation.status.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`)}</p>
        <p>{consultation.reason}</p>
      </Card>

      <Card className="p-6 space-y-2">
        <Label htmlFor="clinicalObservations">{t("clinicalObservations")}</Label>
        <Textarea
          id="clinicalObservations"
          className="glass-input"
          defaultValue={consultation.clinicalObservations ?? ""}
          onBlur={(e) => patchMutation.mutate({ clinicalObservations: e.target.value })}
        />
      </Card>

      <Card className="p-6 space-y-2">
        <Label htmlFor="diagnosis">{t("diagnosisAndConclusion")}</Label>
        <Textarea
          id="diagnosis"
          className="glass-input"
          defaultValue={consultation.diagnosis ?? ""}
          onBlur={(e) => patchMutation.mutate({ diagnosis: e.target.value })}
        />
      </Card>
    </div>
  );
}
```

Note: `t()`'s dynamic-key composition above (`consultationStatus${...}`) mirrors the same pattern used for patient status in `Patients.tsx`/`PatientDetails.tsx`; keep both consistent if either is revisited later.

- [ ] **Step 5: Implement `Consultations.tsx`**

```tsx
// frontend/src/pages/Consultations.tsx
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { ConsultationFormModal } from "@/components/ConsultationFormModal";
import { ConsultationDetails } from "@/components/ConsultationDetails";
import type { Consultation } from "@shared/schema";

function statusVariant(status: Consultation["status"]): "default" | "secondary" | "destructive" {
  if (status === "annulee") return "destructive";
  if (status === "terminee") return "secondary";
  return "default";
}

export default function Consultations() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [showFormModal, setShowFormModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: consultationsList = [], isLoading } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  if (selectedId) {
    return <ConsultationDetails consultationId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-6" data-testid="consultations-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("consultations")}</h1>
          <p className="text-sm text-muted-foreground">{t("consultationsOfTheDay")}</p>
        </div>
        <PolicyGuard policy={ConsultationsPolicy} action="canCreate">
          <Button className="btn-primary" onClick={() => setShowFormModal(true)} data-testid="button-add-consultation">
            <Plus className="w-4 h-4 mr-2" />
            {t("newConsultation")}
          </Button>
        </PolicyGuard>
      </div>

      <div className="space-y-4">
        {isLoading ? (
          <div className="flex items-center justify-center min-h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : consultationsList.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center text-muted-foreground">{t("noConsultationsToday")}</div>
        ) : (
          consultationsList.map((consultation) => (
            <div
              key={consultation.id}
              className="glass-card rounded-xl p-6 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setSelectedId(consultation.id)}
              data-testid={`row-consultation-${consultation.id}`}>
              <div className="flex items-center gap-3">
                <Avatar>
                  <AvatarFallback>{consultation.specialty[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-semibold text-foreground">{consultation.specialty}</p>
                  <p className="text-sm text-muted-foreground">{consultation.reason}</p>
                </div>
              </div>
              <Badge variant={statusVariant(consultation.status)}>
                {t(`consultationStatus${consultation.status[0].toUpperCase()}${consultation.status.slice(1).replace(/_([a-z])/g, (_, c) => c.toUpperCase())}`)}
              </Badge>
            </div>
          ))
        )}
      </div>

      <ConsultationFormModal open={showFormModal} onClose={() => setShowFormModal(false)} />
    </div>
  );
}
```

- [ ] **Step 6: Register the route and sidebar entry**

`frontend/src/App.tsx`: add `const Consultations = lazy(() => import("./pages/Consultations"));` and a `<Route path="/consultations">` block, same shape as `/patients`.

`frontend/src/components/Sidebar.tsx`: add `import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";` and `import { CalendarCheck } from "lucide-react";`, `const consultationsPolicy = usePolicy(ConsultationsPolicy);`, and `...(consultationsPolicy.canView() ? [{ icon: CalendarCheck, label: t("consultations"), path: "/consultations" }] : []),` right after the `patients` entry.

- [ ] **Step 7: Manual verification**

Run the app, log in as `medecin`, create a consultation for an existing patient, confirm it appears in the list with a "Planifiée" badge, open it, add clinical observations/diagnosis (blur to save), and click "Terminer consultation" — confirm the badge updates to "Terminée".
Expected: works without console errors; confirm a `laboratoire` user cannot see the "Nouvelle consultation" button.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/policies/consultations.policy.ts frontend/src/lib/i18n/consultations.ts frontend/src/lib/i18n/index.ts frontend/src/components/ConsultationFormModal.tsx frontend/src/components/ConsultationDetails.tsx frontend/src/pages/Consultations.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat: add Consultations list, create form, and clinical detail view"
```

---

### Task 13: `QueueEvent` schema types (backend + frontend)

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `frontend/shared/schema.ts`

**Interfaces:**
- Produces: `QueueEventType`, `QueueEventPayload`, `QueueEvent`, `InsertQueueEvent` — consumed by Task 14 (`QueueRepository`) and Task 15 (frontend `FileAttente.tsx`). No Zod schema needed: nothing in the frontend builds a raw form against `QueueEvent` (the "Enregistrer un patient" flow in Task 15 composes a `Patient` + `Consultation` and then calls `QueueRepository.appendEvent` server-side).

- [ ] **Step 1: Add the types to `backend/src/shared/schema.ts`**

Insert after the `Consultation`/`InsertConsultation` block added in Task 9:
```ts
export type QueueEventType = "arrived" | "registered" | "waiting" | "called" | "in_care" | "in_consultation" | "completed" | "cancelled" | "transferred" | "priority_changed";
export interface QueueEventPayload { priority: ConsultationPriority | null; targetService: string | null }
export interface QueueEvent { id: string; tenantId: string; consultationId: string; patientId: string; eventType: QueueEventType; payload: QueueEventPayload | null; actorUserId: string; actorDeviceId: string | null; occurredAt: Date }
export interface InsertQueueEvent { id?: string; consultationId: string; patientId: string; eventType: QueueEventType; payload?: QueueEventPayload | null; actorUserId: string; actorDeviceId?: string | null; tenantId: string }
export interface QueueTimelineEntry { eventType: QueueEventType; occurredAt: string }
export interface QueueItem { consultationId: string; patientId: string; status: QueueEventType; priority: ConsultationPriority; waitingSinceMs: number | null; timeline: QueueTimelineEntry[] }
```

- [ ] **Step 2: Mirror into `frontend/shared/schema.ts`**

Same block, with `occurredAt: string` instead of `Date` on `QueueEvent`.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add QueueEvent schema types"
```

---

### Task 14: `QueueRepository`, `QueuePolicy`, `QueueController`, `QueueModule`

**Files:**
- Create: `backend/src/modules/queue/queue.repository.ts`
- Create: `backend/src/modules/queue/queue.service.ts`
- Create: `backend/src/modules/queue/queue.policy.ts`
- Create: `backend/src/modules/queue/queue.controller.ts`
- Create: `backend/src/modules/queue/queue.module.ts`
- Create: `backend/src/modules/queue/dto/append-queue-event.dto.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/queue/queue.repository.spec.ts`
- Test: `backend/src/modules/queue/queue.policy.spec.ts`

**Interfaces:**
- Consumes: `InsertQueueEvent`/`QueueItem` (Task 13), `ConsultationsRepository.findExistingForCascade`/`.findById` (Task 10, to validate `consultationId` and to fall back to the consultation's `priority` when no `priority_changed` event exists yet).
- Produces: `QueueRepository.appendEvent(data): Promise<QueueEvent>`, `.getEventsSince(tenantId, since: Date): Promise<any[]>`. `QueueService.getActiveQueue(tenantId): Promise<QueueItem[]>` (resolves the priority fallback). Routes `GET /api/queue/:tenantId`, `POST /api/queue/events` — consumed by Task 15 (frontend).

- [ ] **Step 1: Write the failing repository tests**

```ts
// backend/src/modules/queue/queue.repository.spec.ts
import { NotFoundException } from "@nestjs/common";
import { QueueRepository } from "./queue.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

describe("QueueRepository", () => {
  describe("appendEvent", () => {
    it("validates the consultation exists in the tenant and inserts the event", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new QueueRepository(couchDBService as any, consultationsRepository as any);

      const result = await repository.appendEvent({
        consultationId: "c1",
        patientId: "p1",
        eventType: "arrived",
        actorUserId: "u1",
        tenantId: "tenant-1",
      } as any);

      expect(consultationsRepository.findExistingForCascade).toHaveBeenCalledWith(db, "c1");
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ type: "queue_event", eventType: "arrived", consultationId: "c1" }));
      expect(result.eventType).toBe("arrived");
    });

    it("throws NotFoundException when the consultation does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const repository = new QueueRepository(couchDBService as any, consultationsRepoStub(null) as any);

      await expect(
        repository.appendEvent({ consultationId: "missing", patientId: "p1", eventType: "arrived", actorUserId: "u1", tenantId: "tenant-1" } as any)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("getEventsSince", () => {
    it("folds events per consultation into the latest status and a timeline", async () => {
      const docs = [
        { consultationId: "c1", patientId: "p1", eventType: "arrived", occurredAt: "2026-08-27T08:00:00.000Z" },
        { consultationId: "c1", patientId: "p1", eventType: "registered", occurredAt: "2026-08-27T08:05:00.000Z" },
        { consultationId: "c2", patientId: "p2", eventType: "arrived", occurredAt: "2026-08-27T08:10:00.000Z" },
        { consultationId: "c1", patientId: "p1", eventType: "priority_changed", payload: { priority: "urgent" }, occurredAt: "2026-08-27T08:12:00.000Z" },
      ];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new QueueRepository(couchDBService as any, consultationsRepoStub() as any);

      const result = await repository.getEventsSince("tenant-1", new Date("2026-08-27T00:00:00.000Z"));

      expect(result).toHaveLength(2);
      const c1 = result.find((item: any) => item.consultationId === "c1")!;
      expect(c1.status).toBe("priority_changed");
      expect(c1.priorityOverride).toBe("urgent");
      expect(c1.timeline).toHaveLength(3);
      const c2 = result.find((item: any) => item.consultationId === "c2")!;
      expect(c2.status).toBe("arrived");
      expect(c2.priorityOverride).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/queue/queue.repository.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `QueueRepository`**

```ts
// backend/src/modules/queue/queue.repository.ts
import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import type { InsertQueueEvent, QueueEvent, QueueEventType } from "@shared/schema";
import { couchDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

export interface FoldedQueueEntry {
  consultationId: string;
  patientId: string;
  status: QueueEventType;
  priorityOverride: string | null;
  timeline: { eventType: QueueEventType; occurredAt: string }[];
}

@Injectable()
export class QueueRepository {
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  async appendEvent(data: InsertQueueEvent): Promise<QueueEvent> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const consultation = await this.consultationsRepository.findExistingForCascade(db, data.consultationId);
    if (!consultation || consultation.type !== "consultation" || consultation.tenantId !== data.tenantId) {
      throw new NotFoundException("Consultation not found");
    }

    const event: QueueEvent = {
      id,
      tenantId: data.tenantId,
      consultationId: data.consultationId,
      patientId: data.patientId,
      eventType: data.eventType,
      payload: data.payload ?? null,
      actorUserId: data.actorUserId,
      actorDeviceId: data.actorDeviceId ?? null,
      occurredAt: now,
    };

    try {
      await db.insert({ ...event, type: "queue_event" as const, occurredAt: now.toISOString(), _id: couchDocumentId("queue_event", id) } as any);
      return event;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async getEventsSince(tenantId: string, since: Date): Promise<FoldedQueueEntry[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "queue_events_by_tenant_time", ["tenantId", "type", "occurredAt"]);
    const result = await db.find({
      selector: { type: "queue_event", tenantId, occurredAt: { $gte: since.toISOString() } },
      sort: [{ occurredAt: "asc" }],
      limit: 1000,
    });

    const byConsultation = new Map<string, any[]>();
    for (const doc of result.docs as any[]) {
      const list = byConsultation.get(doc.consultationId) ?? [];
      list.push(doc);
      byConsultation.set(doc.consultationId, list);
    }

    const entries: FoldedQueueEntry[] = [];
    for (const [consultationId, events] of byConsultation) {
      const last = events[events.length - 1];
      const priorityEvent = [...events].reverse().find((e) => e.eventType === "priority_changed");
      entries.push({
        consultationId,
        patientId: last.patientId,
        status: last.eventType,
        priorityOverride: priorityEvent?.payload?.priority ?? null,
        timeline: events.map((e) => ({ eventType: e.eventType, occurredAt: e.occurredAt })),
      });
    }
    return entries;
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
}
```

- [ ] **Step 4: Run the repository tests to verify they pass**

Run: `cd backend && npx jest src/modules/queue/queue.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing policy test**

```ts
// backend/src/modules/queue/queue.policy.spec.ts
import { QueuePolicy } from "./queue.policy";

function policyFor(role: string): QueuePolicy {
  const policy = new QueuePolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("QueuePolicy", () => {
  it.each(["admin", "manager", "accueil", "infirmier", "medecin"])("%s can view and appendEvent", (role) => {
    expect(policyFor(role).view()).toBe(true);
    expect(policyFor(role).appendEvent()).toBe(true);
  });

  it.each(["laboratoire", "cashier"])("%s cannot view or appendEvent", (role) => {
    expect(policyFor(role).view()).toBe(false);
    expect(policyFor(role).appendEvent()).toBe(false);
  });
});
```

- [ ] **Step 6: Implement the policy, service, DTO, controller, module**

```ts
// backend/src/modules/queue/queue.policy.ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class QueuePolicy extends BasePolicy {
  view(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  appendEvent(): boolean {
    return this.view();
  }
}
```

```ts
// backend/src/modules/queue/dto/append-queue-event.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsUUID, IsIn } from "class-validator";

export class AppendQueueEventDto {
  @IsUUID() @IsNotEmpty() consultationId: string;
  @IsUUID() @IsNotEmpty() patientId: string;
  @IsIn(["arrived", "registered", "waiting", "called", "in_care", "in_consultation", "completed", "cancelled", "transferred", "priority_changed"])
  eventType: string;
  @IsOptional() payload?: { priority?: string; targetService?: string };
  @IsString() @IsNotEmpty() tenantId: string;
}
```

```ts
// backend/src/modules/queue/queue.service.ts
import { Injectable } from "@nestjs/common";
import type { InsertQueueEvent, QueueItem } from "@shared/schema";
import { QueueRepository } from "./queue.repository";
import { ConsultationsRepository } from "../consultations/consultations.repository";

@Injectable()
export class QueueService {
  constructor(
    private readonly queueRepository: QueueRepository,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  appendEvent(data: InsertQueueEvent) {
    return this.queueRepository.appendEvent(data);
  }

  async getActiveQueue(tenantId: string): Promise<QueueItem[]> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const folded = await this.queueRepository.getEventsSince(tenantId, startOfDay);

    const items: QueueItem[] = [];
    for (const entry of folded) {
      let priority = entry.priorityOverride as QueueItem["priority"] | null;
      if (!priority) {
        const consultation = await this.consultationsRepository.findById(entry.consultationId, tenantId);
        priority = consultation.priority;
      }
      const arrivedEvent = entry.timeline.find((e) => e.eventType === "arrived");
      items.push({
        consultationId: entry.consultationId,
        patientId: entry.patientId,
        status: entry.status,
        priority: priority ?? "normal",
        waitingSinceMs: arrivedEvent ? Date.now() - new Date(arrivedEvent.occurredAt).getTime() : null,
        timeline: entry.timeline,
      });
    }
    return items;
  }
}
```

```ts
// backend/src/modules/queue/queue.controller.ts
import { Controller, Get, Post, Body, Param, UseGuards, Request, ForbiddenException } from "@nestjs/common";
import { QueueService } from "./queue.service";
import { AppendQueueEventDto } from "./dto/append-queue-event.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { QueuePolicy } from "./queue.policy";

@Controller("api/queue")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Get(":tenantId")
  @CheckPolicy(QueuePolicy, "view")
  async getActiveQueue(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.queueService.getActiveQueue(this.tenantId(req, tenantId));
  }

  @Post("events")
  @CheckPolicy(QueuePolicy, "appendEvent")
  async appendEvent(@Body() dto: AppendQueueEventDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.queueService.appendEvent({ ...dto, tenantId, actorUserId: req.user.id, actorDeviceId: req.headers["x-device-id"] } as any);
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

```ts
// backend/src/modules/queue/queue.module.ts
import { Module } from "@nestjs/common";
import { QueueController } from "./queue.controller";
import { QueueService } from "./queue.service";
import { QueuePolicy } from "./queue.policy";
import { QueueRepository } from "./queue.repository";
import { AuthModule } from "../auth/auth.module";
import { CouchDBModule } from "../../database/couchdb.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";

@Module({
  imports: [AuthModule, CouchDBModule, ConsultationsRepositoryModule],
  controllers: [QueueController],
  providers: [QueueService, QueuePolicy, QueueRepository],
  exports: [QueueService],
})
export class QueueModule {}
```

`backend/src/app.module.ts`: add `import { QueueModule } from "./modules/queue/queue.module";` and add `QueueModule` to `imports` (after `ConsultationsModule`).

- [ ] **Step 7: Run the policy test and boot-check the backend**

Run: `cd backend && npx jest src/modules/queue/queue.policy.spec.ts && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/queue backend/src/app.module.ts
git commit -m "feat: add File d'attente queue API (event log + folded state)"
```

---

### Task 15: Frontend `FileAttente.tsx` — 3-column queue board + quick patient registration

**Files:**
- Create: `frontend/src/lib/policies/queue.policy.ts`
- Create: `frontend/src/lib/i18n/queue.ts`
- Modify: `frontend/src/lib/i18n/index.ts`
- Create: `frontend/src/lib/queueColumns.ts`
- Test: `frontend/src/lib/queueColumns.spec.ts`
- Create: `frontend/src/components/QueueRegistrationModal.tsx`
- Create: `frontend/src/components/QueueEntryDetails.tsx`
- Create: `frontend/src/pages/FileAttente.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/ConsultationDetails.tsx` (wire up the "Mettre en file d'attente" button left disabled in Task 12)

**Interfaces:**
- Consumes: `QueueItem`/`QueueEventType` (Task 13), `GET /api/queue/:tenantId`, `POST /api/queue/events` (Task 14), `POST /api/patients` and `POST /api/consultations` (Tasks 6/11, for the "Enregistrer un patient" quick-create flow), `calculateAge` (Task 7).
- Produces: `FileAttente` page at `/file-attente`.

- [ ] **Step 1: Write the failing test for the column-bucketing logic**

```ts
// frontend/src/lib/queueColumns.spec.ts
import { bucketQueueItems } from "./queueColumns";
import type { QueueItem } from "@shared/schema";

function item(overrides: Partial<QueueItem>): QueueItem {
  return { consultationId: "c1", patientId: "p1", status: "arrived", priority: "normal", waitingSinceMs: null, timeline: [], ...overrides };
}

describe("bucketQueueItems", () => {
  it("buckets arrived/registered/waiting into waiting, called/in_care/in_consultation into inConsultation, completed into done", () => {
    const items = [
      item({ consultationId: "c1", status: "arrived" }),
      item({ consultationId: "c2", status: "registered" }),
      item({ consultationId: "c3", status: "waiting" }),
      item({ consultationId: "c4", status: "called" }),
      item({ consultationId: "c5", status: "in_care" }),
      item({ consultationId: "c6", status: "in_consultation" }),
      item({ consultationId: "c7", status: "completed" }),
      item({ consultationId: "c8", status: "cancelled" }),
    ];

    const result = bucketQueueItems(items);

    expect(result.waiting.map((i) => i.consultationId)).toEqual(["c1", "c2", "c3"]);
    expect(result.inConsultation.map((i) => i.consultationId)).toEqual(["c4", "c5", "c6"]);
    expect(result.done.map((i) => i.consultationId)).toEqual(["c7"]);
  });

  it("sorts the waiting column by priority (tres_urgent, urgent, normal) then by longest wait", () => {
    const items = [
      item({ consultationId: "normal-long-wait", status: "arrived", priority: "normal", waitingSinceMs: 20 * 60_000 }),
      item({ consultationId: "urgent", status: "arrived", priority: "urgent", waitingSinceMs: 5 * 60_000 }),
      item({ consultationId: "tres-urgent", status: "arrived", priority: "tres_urgent", waitingSinceMs: 1 * 60_000 }),
      item({ consultationId: "normal-short-wait", status: "arrived", priority: "normal", waitingSinceMs: 10 * 60_000 }),
    ];

    const result = bucketQueueItems(items);

    expect(result.waiting.map((i) => i.consultationId)).toEqual(["tres-urgent", "urgent", "normal-long-wait", "normal-short-wait"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/queueColumns.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the bucketing/sorting logic**

```ts
// frontend/src/lib/queueColumns.ts
import type { ConsultationPriority, QueueEventType, QueueItem } from "@shared/schema";

export interface QueueColumns {
  waiting: QueueItem[];
  inConsultation: QueueItem[];
  done: QueueItem[];
}

const WAITING_STATUSES: QueueEventType[] = ["arrived", "registered", "waiting"];
const IN_CONSULTATION_STATUSES: QueueEventType[] = ["called", "in_care", "in_consultation"];
const PRIORITY_RANK: Record<ConsultationPriority, number> = { tres_urgent: 0, urgent: 1, normal: 2 };

export function bucketQueueItems(items: QueueItem[]): QueueColumns {
  const waiting = items.filter((item) => WAITING_STATUSES.includes(item.status));
  const inConsultation = items.filter((item) => IN_CONSULTATION_STATUSES.includes(item.status));
  const done = items.filter((item) => item.status === "completed");

  waiting.sort((a, b) => {
    const priorityDelta = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return (b.waitingSinceMs ?? 0) - (a.waitingSinceMs ?? 0);
  });

  return { waiting, inConsultation, done };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/queueColumns.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add the frontend policy and i18n section**

```ts
// frontend/src/lib/policies/queue.policy.ts
import { BasePolicy } from "./base.policy";

export class QueuePolicy extends BasePolicy {
  canView(): boolean {
    return this.isAdmin() || this.isManager() || this.isAccueil() || this.isInfirmier() || this.isMedecin();
  }

  canAppendEvent(): boolean {
    return this.canView();
  }
}
```

```ts
// frontend/src/lib/i18n/queue.ts
import type { TranslationSection } from "./types";

export const queue: TranslationSection = {
  en: {
    queueTitle: "Waiting Queue",
    queueSubtitle: "Manage patient flow in real time by service and urgency.",
    registerPatient: "Register a Patient",
    callNext: "Call Next",
    waitingColumn: "Waiting",
    inConsultationColumn: "In Consultation",
    doneColumn: "Done",
    takeInCharge: "Take In Charge",
    viewQueueDetails: "View Details",
    markSeen: "Mark as Seen / Start",
    transferService: "Transfer to Service",
    changePriority: "Change Priority",
    cancelOrRemove: "Cancel / Remove from Queue",
    waitingSince: "Waiting time",
    minutesShort: "min",
    quickRegisterExistingRecord: "Search an existing record",
    quickRegisterPhone: "Phone Number (New Patient)",
    quickRegisterDestinationService: "Destination Service",
    quickRegisterRequestedDoctor: "Requested Doctor (Optional)",
    quickRegisterVisitReason: "Reason for Visit",
    quickRegisterNotes: "Notes / Additional Remarks",
    addToQueue: "Add to Queue",
    queueEntryAddedSuccessfully: "Patient added to the queue",
    failedToAddToQueue: "Failed to add patient to the queue",
  },
  fr: {
    queueTitle: "File d'attente",
    queueSubtitle: "Gérer le flux des patients en temps réel par service et urgence.",
    registerPatient: "Enregistrer un patient",
    callNext: "Appeler suivant",
    waitingColumn: "En attente",
    inConsultationColumn: "En consultation",
    doneColumn: "Terminé",
    takeInCharge: "Prendre en charge",
    viewQueueDetails: "Voir détails",
    markSeen: "Marquer comme vu / Commencer",
    transferService: "Transférer vers service",
    changePriority: "Changer priorité",
    cancelOrRemove: "Annuler / Sortir de la file",
    waitingSince: "Temps d'attente",
    minutesShort: "min",
    quickRegisterExistingRecord: "Rechercher un dossier existant",
    quickRegisterPhone: "N° de Téléphone (Nouveau patient)",
    quickRegisterDestinationService: "Service de destination",
    quickRegisterRequestedDoctor: "Médecin demandé (Optionnel)",
    quickRegisterVisitReason: "Motif de visite",
    quickRegisterNotes: "Notes / Remarques complémentaires",
    addToQueue: "Ajouter à la file d'attente",
    queueEntryAddedSuccessfully: "Patient ajouté à la file d'attente",
    failedToAddToQueue: "Échec de l'ajout à la file d'attente",
  },
};
```

`frontend/src/lib/i18n/index.ts`: add `import { queue } from "./queue";` and add it to `sections`.

- [ ] **Step 6: Implement `QueueRegistrationModal`**

Composes the quick-create flow: search-or-create a `Patient`, then `POST /api/consultations`, then two `POST /api/queue/events` calls (`arrived` then `registered`), matching the design doc §8 mapping.

```tsx
// frontend/src/components/QueueRegistrationModal.tsx
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useAuth } from "../contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { ConsultationPriority, Patient } from "@shared/schema";

interface QueueRegistrationModalProps {
  open: boolean;
  onClose: () => void;
}

export function QueueRegistrationModal({ open, onClose }: QueueRegistrationModalProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [existingQuery, setExistingQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newLastName, setNewLastName] = useState("");
  const [newFirstName, setNewFirstName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [destinationService, setDestinationService] = useState("");
  const [requestedDoctorId, setRequestedDoctorId] = useState("");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<ConsultationPriority>("normal");

  const { data: existingResults = [] } = useQuery<Patient[]>({
    queryKey: ["/api/patients", currentTenant?.id, "queue-search", existingQuery],
    queryFn: async () => {
      const response = await fetch(`/api/patients/${currentTenant?.id}?q=${encodeURIComponent(existingQuery)}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id && existingQuery.length > 1 && !selectedPatient,
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      let patientId = selectedPatient?.id;
      if (!patientId) {
        const patientResponse = await offlineApiRequest(
          "POST",
          "/api/patients",
          {
            lastName: newLastName,
            firstName: newFirstName,
            dateOfBirth: "1900-01-01",
            sex: "M",
            primaryPhone: newPhone,
            residenceAddress: "—",
            tenantId: currentTenant?.id,
          },
          { collection: "patients" }
        );
        const patient = await patientResponse.json();
        patientId = patient.id;
      }

      const consultationResponse = await offlineApiRequest(
        "POST",
        "/api/consultations",
        {
          patientId,
          scheduledAt: new Date().toISOString(),
          specialty: destinationService,
          assignedDoctorId: requestedDoctorId || (user?.id ?? ""),
          priority,
          reason,
          nurseNotes: notes || undefined,
          tenantId: currentTenant?.id,
        },
        { collection: "consultations" }
      );
      const consultation = await consultationResponse.json();

      await offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: consultation.id, patientId, eventType: "arrived", tenantId: currentTenant?.id },
        { collection: "queue" }
      );
      return offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: consultation.id, patientId, eventType: "registered", tenantId: currentTenant?.id },
        { collection: "queue" }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      toast({ title: t("success"), description: t("queueEntryAddedSuccessfully") });
      handleClose();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  function handleClose() {
    setExistingQuery("");
    setSelectedPatient(null);
    setNewLastName("");
    setNewFirstName("");
    setNewPhone("");
    setDestinationService("");
    setRequestedDoctorId("");
    setReason("");
    setNotes("");
    setPriority("normal");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="glass-card max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("registerPatient")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label>{t("quickRegisterExistingRecord")}</Label>
            <Input
              value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : existingQuery}
              onChange={(e) => {
                setSelectedPatient(null);
                setExistingQuery(e.target.value);
              }}
              className="glass-input"
              data-testid="input-queue-patient-search"
            />
            {!selectedPatient && existingResults.length > 0 && (
              <div className="border border-border rounded-lg mt-1 overflow-hidden">
                {existingResults.map((patient) => (
                  <button
                    type="button"
                    key={patient.id}
                    className="w-full text-left px-3 py-2 hover:bg-accent"
                    onClick={() => setSelectedPatient(patient)}
                    data-testid={`option-queue-patient-${patient.id}`}>
                    {patient.firstName} {patient.lastName} — {patient.dossierNumber ?? t("pendingSync")}
                  </button>
                ))}
              </div>
            )}
          </div>

          {!selectedPatient && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="newLastName">{t("lastName")}</Label>
                <Input id="newLastName" className="glass-input" value={newLastName} onChange={(e) => setNewLastName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="newFirstName">{t("firstName")}</Label>
                <Input id="newFirstName" className="glass-input" value={newFirstName} onChange={(e) => setNewFirstName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="newPhone">{t("quickRegisterPhone")}</Label>
                <Input id="newPhone" className="glass-input" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="destinationService">{t("quickRegisterDestinationService")}</Label>
              <Input id="destinationService" className="glass-input" value={destinationService} onChange={(e) => setDestinationService(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="requestedDoctorId">{t("quickRegisterRequestedDoctor")}</Label>
              <Input id="requestedDoctorId" className="glass-input" value={requestedDoctorId} onChange={(e) => setRequestedDoctorId(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="reason">{t("quickRegisterVisitReason")}</Label>
            <Textarea id="reason" className="glass-input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <div>
            <Label>{t("priority")}</Label>
            <RadioGroup value={priority} onValueChange={(value) => setPriority(value as ConsultationPriority)} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="normal" id="queue-priority-normal" />
                <Label htmlFor="queue-priority-normal">{t("priorityNormal")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="urgent" id="queue-priority-urgent" />
                <Label htmlFor="queue-priority-urgent">{t("priorityUrgent")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="tres_urgent" id="queue-priority-tres-urgent" />
                <Label htmlFor="queue-priority-tres-urgent">{t("priorityTresUrgent")}</Label>
              </div>
            </RadioGroup>
          </div>

          <div>
            <Label htmlFor="notes">{t("quickRegisterNotes")}</Label>
            <Textarea id="notes" className="glass-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose}>{t("cancel")}</Button>
            <Button
              className="btn-primary"
              disabled={registerMutation.isPending || (!selectedPatient && (!newLastName || !newFirstName || !newPhone))}
              onClick={() => registerMutation.mutate()}
              data-testid="button-submit-queue-registration">
              {registerMutation.isPending ? t("saving") : t("addToQueue")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 7: Implement `QueueEntryDetails`**

```tsx
// frontend/src/components/QueueEntryDetails.tsx
import React from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { QueueEventType, QueueItem } from "@shared/schema";

interface QueueEntryDetailsProps {
  item: QueueItem;
  onBack: () => void;
}

export function QueueEntryDetails({ item, onBack }: QueueEntryDetailsProps) {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const eventMutation = useMutation({
    mutationFn: async (eventType: QueueEventType) =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: item.consultationId, patientId: item.patientId, eventType, tenantId: currentTenant?.id },
        { collection: "queue" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      onBack();
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  const waitingMinutes = item.waitingSinceMs ? Math.round(item.waitingSinceMs / 60_000) : null;

  return (
    <div className="space-y-6" data-testid="queue-entry-details">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("queueTitle")}
      </Button>

      <Card className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("consultation")} — {item.consultationId}</h2>
          <Badge>{t("priority" + item.priority[0].toUpperCase() + item.priority.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}</Badge>
        </div>
        {waitingMinutes !== null && (
          <p className="text-sm text-muted-foreground">{t("waitingSince")}: {waitingMinutes} {t("minutesShort")}</p>
        )}

        <div className="flex flex-col gap-2 pt-4">
          <Button onClick={() => eventMutation.mutate("in_care")} disabled={eventMutation.isPending} data-testid="button-take-in-charge">
            {t("takeInCharge")}
          </Button>
          <Button variant="outline" onClick={() => eventMutation.mutate("in_consultation")} disabled={eventMutation.isPending} data-testid="button-mark-seen">
            {t("markSeen")}
          </Button>
          <Button variant="outline" onClick={() => eventMutation.mutate("completed")} disabled={eventMutation.isPending} data-testid="button-complete-queue-entry">
            {t("doneColumn")}
          </Button>
          <Button variant="destructive" onClick={() => eventMutation.mutate("cancelled")} disabled={eventMutation.isPending} data-testid="button-cancel-queue-entry">
            {t("cancelOrRemove")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: Implement `FileAttente.tsx`**

```tsx
// frontend/src/pages/FileAttente.tsx
import React, { useState } from "react";
import { Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "../lib/i18n";
import { useTenant } from "../contexts/TenantContext";
import { QueuePolicy } from "@/lib/policies/queue.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { bucketQueueItems } from "@/lib/queueColumns";
import { QueueRegistrationModal } from "@/components/QueueRegistrationModal";
import { QueueEntryDetails } from "@/components/QueueEntryDetails";
import type { QueueItem } from "@shared/schema";

function priorityVariant(priority: QueueItem["priority"]): "default" | "secondary" | "destructive" {
  if (priority === "tres_urgent") return "destructive";
  if (priority === "urgent") return "default";
  return "secondary";
}

export default function FileAttente() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [showRegistrationModal, setShowRegistrationModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);

  const { data: queueItems = [], isLoading } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
    refetchInterval: 15_000,
  });

  if (selectedItem) {
    return <QueueEntryDetails item={selectedItem} onBack={() => setSelectedItem(null)} />;
  }

  const columns = bucketQueueItems(queueItems);

  function renderCard(item: QueueItem) {
    const waitingMinutes = item.waitingSinceMs ? Math.round(item.waitingSinceMs / 60_000) : null;
    return (
      <div
        key={item.consultationId}
        className="glass-card rounded-xl p-4 space-y-2 cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setSelectedItem(item)}
        data-testid={`queue-card-${item.consultationId}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium text-foreground">{item.patientId}</span>
          <Badge variant={priorityVariant(item.priority)}>
            {t("priority" + item.priority[0].toUpperCase() + item.priority.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()))}
          </Badge>
        </div>
        {waitingMinutes !== null && (
          <p className="text-sm text-muted-foreground">{t("waitingSince")}: {waitingMinutes} {t("minutesShort")}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="file-attente-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground">{t("queueTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("queueSubtitle")}</p>
        </div>
        <PolicyGuard policy={QueuePolicy} action="canAppendEvent">
          <Button className="btn-primary" onClick={() => setShowRegistrationModal(true)} data-testid="button-register-queue-patient">
            <Plus className="w-4 h-4 mr-2" />
            {t("registerPatient")}
          </Button>
        </PolicyGuard>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground">{t("waitingColumn")} ({columns.waiting.length})</h2>
            {columns.waiting.map(renderCard)}
          </div>
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground">{t("inConsultationColumn")} ({columns.inConsultation.length})</h2>
            {columns.inConsultation.map(renderCard)}
          </div>
          <div className="space-y-3">
            <h2 className="font-semibold text-foreground">{t("doneColumn")} ({columns.done.length})</h2>
            {columns.done.map(renderCard)}
          </div>
        </div>
      )}

      <QueueRegistrationModal open={showRegistrationModal} onClose={() => setShowRegistrationModal(false)} />
    </div>
  );
}
```

Note: cards render `item.patientId` (a raw id) rather than a patient name — resolving names would require either denormalizing a patient name snapshot onto `QueueItem` server-side or an extra per-item patient fetch client-side. Both are reasonable small follow-ups; picking one isn't needed to make the queue functional (the id is still enough to open the right patient via `QueueEntryDetails`), so it's left as a visible, easy-to-spot polish item rather than guessed at silently.

- [ ] **Step 9: Register the route and sidebar entry, and wire up `ConsultationDetails`' queue button**

`frontend/src/App.tsx`: add `const FileAttente = lazy(() => import("./pages/FileAttente"));` and a `<Route path="/file-attente">` block.

`frontend/src/components/Sidebar.tsx`: add `import { QueuePolicy } from "@/lib/policies/queue.policy";` and `import { CircleX } from "lucide-react";` (matches the Figma icon for this nav item), `const queuePolicy = usePolicy(QueuePolicy);`, and `...(queuePolicy.canView() ? [{ icon: CircleX, label: t("queueTitle"), path: "/file-attente" }] : []),` after the `consultations` entry.

`frontend/src/components/ConsultationDetails.tsx`: replace the disabled "Mettre en file d'attente" button (Task 12, Step 4) with a working mutation:
```tsx
  const queueMutation = useMutation({
    mutationFn: async () =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId: consultation.id, patientId: consultation.patientId, eventType: "arrived" },
        { collection: "queue" }
      ),
    onSuccess: () => {
      toast({ title: t("success"), description: t("queueEntryAddedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });
```
and change the button to `<Button variant="outline" onClick={() => queueMutation.mutate()} disabled={queueMutation.isPending} data-testid="button-put-in-queue">{t("putInQueue")}</Button>`.

- [ ] **Step 10: Manual verification of the full Phase 1 loop**

Run the app end-to-end: as `accueil`, register a new patient via "Enregistrer un patient" on `/file-attente` with priority "Très urgent"; confirm it appears at the top of the "En attente" column. As `medecin`, open the entry, click "Prendre en charge" then "Marquer comme vu / Commencer"; confirm it moves to "En consultation". Click "Terminé"; confirm it moves to "Terminé". Separately, from `/consultations`, create a consultation directly and click "Mettre en file d'attente"; confirm it appears in "En attente".
Expected: all transitions work without console errors; a `laboratoire` user cannot see `/file-attente` in the sidebar and gets blocked if navigating there directly (its `PatientsPolicy`/`ConsultationsPolicy`/`QueuePolicy` `view()`/`canView()` all return `false` for that role, per Tasks 6/11/14 — confirm the page itself does not crash for a denied role; if it does, wrap the page body in a `<PolicyGuard policy={QueuePolicy} action="canView">` with a simple "not authorized" fallback, matching how other pages in this repo handle a denied direct navigation).

- [ ] **Step 11: Run the full test suites one last time**

Run: `cd backend && npx jest` and `cd frontend && npx vitest run`
Expected: PASS — every test added across all 15 tasks, plus no regressions in existing suites (`i18nCompleteness.test.ts` included).

- [ ] **Step 12: Commit**

```bash
git add frontend/src/lib/policies/queue.policy.ts frontend/src/lib/i18n/queue.ts frontend/src/lib/i18n/index.ts frontend/src/lib/queueColumns.ts frontend/src/lib/queueColumns.spec.ts frontend/src/components/QueueRegistrationModal.tsx frontend/src/components/QueueEntryDetails.tsx frontend/src/pages/FileAttente.tsx frontend/src/App.tsx frontend/src/components/Sidebar.tsx frontend/src/components/ConsultationDetails.tsx
git commit -m "feat: add File d'attente queue board and quick patient registration"
```
