# Medical Connect — Phase 2: Pré-consultation infirmière, Consultation médicale, Consultation-hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real clinical data capture (vitals + structured exam/diagnosis) to `Consultation`, and a cross-phase consultation-hub view, on top of the Phase 1 Patients/Consultations/Queue foundation.

**Architecture:** Extend the existing `Consultation` CouchDB document with new optional nested fields (no new entity, no new database collection); extend `ConsultationsRepository.update()`/`UpdateConsultationDto` to persist them; rewrite the existing routed page `frontend/src/pages/consultations/show.tsx` (`/consultations/:id`) into the consultation hub, and add two new routed pages (`/consultations/:id/pre-consultation`, `/consultations/:id/consultation-medicale`). No new backend routes, no new backend policies.

**Tech Stack:** NestJS, CouchDB (`nano`), class-validator, React 18, Wouter, `@tanstack/react-query`, Tailwind + shadcn `ui/` components (`Tabs`, `Slider`, `Switch`, `Progress`, `RadioGroup`, `Badge`, `Card`).

**Spec:** `docs/superpowers/specs/2026-08-27-medical-connect-preconsultation-consultation-hub-design.md`

## Global Constraints

- **Phase 1 status:** the Phase 1 plan (`docs/superpowers/plans/2026-08-27-medical-connect-patients-consultations-queue.md`) is already implemented and merged to `main` (PR #1, `add_patients`) — this was verified directly against the running codebase before writing the tasks below, not assumed from the plan document. Two things the plan document assumed turned out different in the actual implementation:
  - **Routing is real nested Wouter routes with per-model page folders**, not a single flat page with an internal `viewMode` state switch: `frontend/src/pages/consultations/{index,new,edit,show}.tsx` + `ConsultationFormFields.tsx`, registered in `frontend/src/App.tsx` as `/consultations`, `/consultations/new`, `/consultations/:id/edit`, `/consultations/:id`. Same pattern for `frontend/src/pages/patients/`. Queue pages are top-level: `frontend/src/pages/FileAttente.tsx`, `QueueRegister.tsx`, `QueueEntryDetails.tsx`, routed at `/file-attente`, `/file-attente/new`, `/file-attente/:consultationId`.
  - The shop-management domain (products/sales/customers/etc.) has been removed from the codebase entirely, not left running alongside Medical Connect. This doesn't affect this plan's tasks (none of them touch that domain) but is worth knowing.
  - Everything else — `backend/src/shared/schema.ts`'s `Consultation` interface, `ConsultationsRepository`, `ConsultationsController`, `UpdateConsultationDto`, `frontend/src/lib/i18n/consultations.ts`, `frontend/src/lib/policies/consultations.policy.ts` — matches the Phase 1 plan document exactly, field-for-field. Tasks 1-3 below are unaffected by the routing difference; Tasks 4-6 are written directly against the real `frontend/src/pages/consultations/` structure (confirmed by reading `show.tsx`, `edit.tsx`, `App.tsx` directly).
- CouchDB documents only, no Drizzle/Postgres — same convention as Phase 1.
- Tenant ID always derived from `req.user.tenantId` — no change needed here since no new routes are added; the existing Phase 1 `PUT /api/consultations/:id` already does this.
- Every user-facing string goes through `t("key")`, added to **both** `en` and `fr` in `frontend/src/lib/i18n/consultations.ts`, checked by `frontend/src/lib/i18nCompleteness.test.ts`.
- No `@testing-library/react`/jsdom. Backend logic is unit-tested (repository, plain `new X(mockedDep as any)` construction). Frontend pages/components stay thin and untested, except the pure `computeConsultationJourney` function (Task 3), which gets a dedicated unit test — same convention as Phase 1's `bucketQueueItems`.
- Never hand-roll a raw `<button>`/`<input>`/`<select>`/`<textarea>` when `frontend/src/components/ui/` has the component. Confirmed present and used in this plan: `Tabs`, `Slider`, `Switch`, `Progress`, `RadioGroup`, `Select`, `Badge`, `Card`, `Table`.
- **Deviations from the design spec discovered while planning** (spec stays as written; these are implementation-level corrections, same spirit as the "Deviation" bullet in the Phase 1 plan):
  1. The design spec's §6 says "Valider — Patient prêt" fires a `PUT` *and* a queue event. There is no `QueueEventType` for "pre-consultation done, patient ready for doctor" — the fixed enum (`arrived`/`registered`/`waiting`/`called`/`in_care`/`in_consultation`/`completed`/`cancelled`/`transferred`/`priority_changed`) has nothing that fits, and the consultation is already `in_care` from the earlier "Prendre en charge" step. Adding a new enum value would mean modifying Phase 1's `QueueEventType`, which this plan treats as fixed. **Correction: "Valider — Patient prêt" only does the `PUT` (`vitals`, `symptoms`, `nurseNotes`); no queue event is fired.** This exactly matches how the design's own step-4 derivation (§4) already only reads `Consultation.vitalsRecordedAt`, never a queue event — the spec text was just imprecise about the button's side effect.
  2. The design spec's §6 says "Historique patient" navigates to `/patients/:id`. That's actually realizable as-is now that the real routing is confirmed (`/patients/:id` exists, per `frontend/src/pages/patients/show.tsx`) — **this plan restores the spec's original intent**: "Historique patient" navigates to `/patients/${consultation.patientId}`, the patient's real detail page, not just the list. (The flat-page assumption that made this look impossible was itself a planning-time error, corrected now that the real routes are confirmed.)
  3. The design spec's "routes" `/consultations/:id`, `/consultations/:id/pre-consultation`, `/consultations/:id/consultation-medicale` (§6) map directly onto real Wouter routes, confirmed against `frontend/src/App.tsx`: `/consultations/:id` is the existing `show.tsx` (rewritten by Task 6 to become the hub), and `/consultations/:id/pre-consultation` / `/consultations/:id/consultation-medicale` are two new routes/pages added by Tasks 4-6, following the exact same `useParams<{ id: string }>()` + `useLocation()` pattern already used by `show.tsx`/`edit.tsx`.
  4. The design spec's §3 defines Zod schemas (`updateConsultationClinicalSchema` and friends) for the new fields. Nothing in this plan uses `react-hook-form`/`zodResolver` for the two new forms — like the existing `show.tsx`, they're detail-editing views of an already-created record (plain component state + save button), not creation modals. **No Zod schema is added for these fields**; validation is handled entirely by `UpdateConsultationDto`'s nested class-validator DTOs (Task 2). Introducing an unused Zod schema alongside would be dead code.

---

### Task 1: Extend `Consultation` schema types with Phase 2 clinical fields (backend + frontend)

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `frontend/shared/schema.ts`

**Interfaces:**
- Consumes: `Consultation`/`InsertConsultation` (Phase 1 plan, Task 9).
- Produces: `VitalSigns`, `ExamSystem`, `ExamSystemStatus`, `SystemExamFinding`, `PhysicalExam`, `DiagnosisCertainty`, `DiagnosisPrincipal` types; extended `Consultation` interface — consumed by Task 2 (`ConsultationsRepository`/DTO), Task 3 (`computeConsultationJourney`), Task 4 (`PreConsultationForm`), Task 5 (`ConsultationMedicaleForm`), Task 6 (`ConsultationHub`).

- [ ] **Step 1: Modify the `Consultation` interface in `backend/src/shared/schema.ts`**

Find the `Consultation` interface added by Phase 1 Task 9:
```ts
export interface Consultation { id: string; tenantId: string; number: string | null; patientId: string; scheduledAt: Date; specialty: string; assignedDoctorId: string; roomId: string | null; priority: ConsultationPriority; reason: string; nurseNotes: string | null; clinicalObservations: string | null; diagnosis: string | null; status: ConsultationStatus; createdAt: Date; updatedAt: Date }
```

Insert the new types directly above it, and replace `clinicalObservations: string | null; diagnosis: string | null;` inside it with the Phase 2 fields:

```ts
export interface VitalSigns {
  bloodPressureSystolic: number | null;
  bloodPressureDiastolic: number | null;
  heartRate: number | null;
  temperature: number | null;
  oxygenSaturation: number | null;
  respiratoryRate: number | null;
  weightKg: number | null;
  heightCm: number | null;
  bmi: number | null;
  capillaryGlycemia: number | null;
  painScoreEva: number | null;
  isPregnant: boolean | null;
}

export type ExamSystem = "cardiovasculaire" | "respiratoire" | "neurologique" | "digestif" | "orl" | "dermatologique";
export type ExamSystemStatus = "normal" | "anormal" | "non_examine";

export interface SystemExamFinding {
  system: ExamSystem;
  status: ExamSystemStatus;
  notes: string | null;
}

export interface PhysicalExam {
  generalState: string | null;
  consciousness: string | null;
  hydration: string | null;
  systemFindings: SystemExamFinding[];
}

export type DiagnosisCertainty = "confirme" | "suspecte";
export interface DiagnosisPrincipal {
  label: string;
  certainty: DiagnosisCertainty;
}
```

Resulting `Consultation` interface (replace the whole line):
```ts
export interface Consultation { id: string; tenantId: string; number: string | null; patientId: string; scheduledAt: Date; specialty: string; assignedDoctorId: string; roomId: string | null; priority: ConsultationPriority; reason: string; nurseNotes: string | null; symptoms: string | null; vitals: VitalSigns | null; vitalsRecordedAt: Date | null; relevantHistory: string[]; presentIllnessHistory: string | null; physicalExam: PhysicalExam | null; diagnosisPrincipal: DiagnosisPrincipal | null; diagnosisSecondary: string[]; diagnosisHypothesis: string | null; medicalConsultationSavedAt: Date | null; status: ConsultationStatus; createdAt: Date; updatedAt: Date }
```

- [ ] **Step 2: Mirror into `frontend/shared/schema.ts`**

Same block, with `vitalsRecordedAt: string | null` and `medicalConsultationSavedAt: string | null` (frontend date-as-string convention, matching `scheduledAt`/`createdAt`/`updatedAt` on the same interface). `VitalSigns`/`PhysicalExam`/`SystemExamFinding`/`DiagnosisPrincipal` have no date fields, so they're identical on both sides.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: FAIL initially — `ConsultationsRepository`, `ConsultationDetails.tsx`, and `UpdateConsultationDto` still reference the now-removed `clinicalObservations`/`diagnosis` fields. This is expected; Task 2 fixes the backend side and Task 6 fixes the frontend side. Confirm the *only* errors are about `clinicalObservations`/`diagnosis` being missing — no other unrelated type errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add Phase 2 clinical fields to Consultation (vitals, physical exam, diagnosis)"
```

---

### Task 2: Extend `ConsultationsRepository.update()` and `UpdateConsultationDto` to persist the new clinical fields

**Files:**
- Modify: `backend/src/modules/consultations/consultations.repository.ts`
- Modify: `backend/src/modules/consultations/consultations.repository.spec.ts`
- Modify: `backend/src/modules/consultations/dto/update-consultation.dto.ts`

**Interfaces:**
- Consumes: `VitalSigns`/`PhysicalExam`/`DiagnosisPrincipal` (Task 1).
- Produces: `ConsultationsRepository.update()` now accepts and persists `symptoms`, `vitals`, `relevantHistory`, `presentIllnessHistory`, `physicalExam`, `diagnosisPrincipal`, `diagnosisSecondary`, `diagnosisHypothesis`, and auto-sets `vitalsRecordedAt`/`medicalConsultationSavedAt` — consumed by Task 4 (`PreConsultationForm`) and Task 5 (`ConsultationMedicaleForm`) via the existing `PUT /api/consultations/:id` route (unchanged route, unchanged policy).

- [ ] **Step 1: Write the failing tests**

Add to the `describe("update")` block in `backend/src/modules/consultations/consultations.repository.spec.ts` (alongside the existing "patches status and clinical fields" test from Phase 1):

```ts
    it("sets vitalsRecordedAt when vitals is included in the update payload", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        vitalsRecordedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const vitals = { bloodPressureSystolic: 128, bloodPressureDiastolic: 82, heartRate: 72, temperature: 36.8, oxygenSaturation: 98, respiratoryRate: 16, weightKg: 78, heightCm: 179, bmi: 24.3, capillaryGlycemia: null, painScoreEva: 3, isPregnant: false };
      const result = await repository.update("c1", "tenant-1", { vitals } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ vitals, vitalsRecordedAt: expect.any(String) }));
      expect(result.vitalsRecordedAt).toBeInstanceOf(Date);
    });

    it("sets medicalConsultationSavedAt when physicalExam or diagnosisPrincipal is included", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        medicalConsultationSavedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const diagnosisPrincipal = { label: "Hypertension artérielle", certainty: "confirme" as const };
      const result = await repository.update("c1", "tenant-1", { diagnosisPrincipal } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ diagnosisPrincipal, medicalConsultationSavedAt: expect.any(String) }));
      expect(result.medicalConsultationSavedAt).toBeInstanceOf(Date);
    });

    it("leaves vitalsRecordedAt and medicalConsultationSavedAt untouched when neither vitals, physicalExam, nor diagnosisPrincipal is in the payload", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        vitalsRecordedAt: "2026-08-27T10:25:00.000Z",
        medicalConsultationSavedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      await repository.update("c1", "tenant-1", { roomId: "Salle 3" } as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: null })
      );
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts`
Expected: FAIL — `vitalsRecordedAt`/`medicalConsultationSavedAt` are `undefined` in the inserted document (repository doesn't set them yet), and the existing "patches status and clinical fields" test from Phase 1 now fails to compile/run because it still references the removed `diagnosis` field — fix that test in the same step by changing `{ status: "terminee", diagnosis: "RAS" }` to `{ status: "terminee", diagnosisPrincipal: { label: "RAS", certainty: "confirme" } }` and the corresponding `expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ number: "C-2026-0904", status: "terminee", diagnosisPrincipal: { label: "RAS", certainty: "confirme" } }))`.

- [ ] **Step 3: Update `ConsultationsRepository.update()`**

In `backend/src/modules/consultations/consultations.repository.ts`, replace the `update` method body:

```ts
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
```

(`"vitals" in data` rather than `data.vitals !== undefined` so that an explicit `vitals: null` — not used today, but harmless to support — still counts as "the vitals section was touched".)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Extend `UpdateConsultationDto`**

In `backend/src/modules/consultations/dto/update-consultation.dto.ts`, replace the file:

```ts
// backend/src/modules/consultations/dto/update-consultation.dto.ts
import { IsString, IsOptional, IsIn, IsUUID, IsDateString, IsNumber, IsBoolean, IsArray, IsNotEmpty, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class VitalSignsDto {
  @IsNumber() @IsOptional() bloodPressureSystolic?: number | null;
  @IsNumber() @IsOptional() bloodPressureDiastolic?: number | null;
  @IsNumber() @IsOptional() heartRate?: number | null;
  @IsNumber() @IsOptional() temperature?: number | null;
  @IsNumber() @IsOptional() oxygenSaturation?: number | null;
  @IsNumber() @IsOptional() respiratoryRate?: number | null;
  @IsNumber() @IsOptional() weightKg?: number | null;
  @IsNumber() @IsOptional() heightCm?: number | null;
  @IsNumber() @IsOptional() bmi?: number | null;
  @IsNumber() @IsOptional() capillaryGlycemia?: number | null;
  @IsNumber() @IsOptional() painScoreEva?: number | null;
  @IsBoolean() @IsOptional() isPregnant?: boolean | null;
}

class SystemExamFindingDto {
  @IsIn(["cardiovasculaire", "respiratoire", "neurologique", "digestif", "orl", "dermatologique"]) system: string;
  @IsIn(["normal", "anormal", "non_examine"]) status: string;
  @IsString() @IsOptional() notes?: string | null;
}

class PhysicalExamDto {
  @IsString() @IsOptional() generalState?: string | null;
  @IsString() @IsOptional() consciousness?: string | null;
  @IsString() @IsOptional() hydration?: string | null;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SystemExamFindingDto) systemFindings: SystemExamFindingDto[];
}

class DiagnosisPrincipalDto {
  @IsString() @IsNotEmpty() label: string;
  @IsIn(["confirme", "suspecte"]) certainty: string;
}

export class UpdateConsultationDto {
  @IsDateString() @IsOptional() scheduledAt?: string;
  @IsString() @IsOptional() specialty?: string;
  @IsUUID() @IsOptional() assignedDoctorId?: string;
  @IsString() @IsOptional() roomId?: string;
  @IsIn(["normal", "urgent", "tres_urgent"]) @IsOptional() priority?: string;
  @IsString() @IsOptional() reason?: string;
  @IsString() @IsOptional() nurseNotes?: string;
  @IsString() @IsOptional() symptoms?: string;
  @ValidateNested() @Type(() => VitalSignsDto) @IsOptional() vitals?: VitalSignsDto;
  @IsArray() @IsString({ each: true }) @IsOptional() relevantHistory?: string[];
  @IsString() @IsOptional() presentIllnessHistory?: string;
  @ValidateNested() @Type(() => PhysicalExamDto) @IsOptional() physicalExam?: PhysicalExamDto;
  @ValidateNested() @Type(() => DiagnosisPrincipalDto) @IsOptional() diagnosisPrincipal?: DiagnosisPrincipalDto;
  @IsArray() @IsString({ each: true }) @IsOptional() diagnosisSecondary?: string[];
  @IsString() @IsOptional() diagnosisHypothesis?: string;
  @IsIn(["planifiee", "en_attente", "en_cours", "terminee", "annulee"]) @IsOptional() status?: string;
}
```

(This drops the Phase 1 `clinicalObservations?`/`diagnosis?` fields, matching Task 1's schema change.)

- [ ] **Step 6: Typecheck and boot-check the backend**

Run: `cd backend && npx tsc --noEmit && npm run build`
Expected: PASS — no more references to `clinicalObservations`/`diagnosis` anywhere under `backend/src/modules/consultations/`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/consultations/consultations.repository.ts backend/src/modules/consultations/consultations.repository.spec.ts backend/src/modules/consultations/dto/update-consultation.dto.ts
git commit -m "feat: persist Phase 2 clinical fields on Consultation update"
```

---

### Task 3: `computeConsultationJourney` — pure step-progress derivation (frontend)

**Files:**
- Create: `frontend/src/lib/consultationJourney.ts`
- Test: `frontend/src/lib/consultationJourney.spec.ts`

**Interfaces:**
- Consumes: `Patient`, `Consultation` (`@shared/schema`), `QueueItem`/`QueueTimelineEntry` (Phase 1 plan, Task 13).
- Produces: `JourneyStepState`, `JourneyStep`, `computeConsultationJourney(patient, consultation, queueItem): JourneyStep[]` — consumed by Task 6 (`ConsultationHub`).

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/consultationJourney.spec.ts
import { computeConsultationJourney } from "./consultationJourney";
import type { Consultation, Patient, QueueItem } from "@shared/schema";

function patient(overrides: Partial<Patient> = {}): Patient {
  return { id: "p1", tenantId: "t1", dossierNumber: "MC-2026-0001", lastName: "Diallo", firstName: "Aïssatou", dateOfBirth: "1994-03-12", sex: "F", primaryPhone: "+237600000000", residenceAddress: "Yaoundé", allergyKnowledge: "non_renseigne", patientType: "externe", status: "actif", isActive: true, createdAt: "2026-08-27T08:00:00.000Z", updatedAt: "2026-08-27T08:00:00.000Z", ...overrides } as Patient;
}

function consultation(overrides: Partial<Consultation> = {}): Consultation {
  return { id: "c1", tenantId: "t1", number: "C-2026-0904", patientId: "p1", scheduledAt: "2026-08-27T08:05:00.000Z", specialty: "Cardiologie", assignedDoctorId: "doctor-1", roomId: null, priority: "normal", reason: "Suivi", nurseNotes: null, symptoms: null, vitals: null, vitalsRecordedAt: null, relevantHistory: [], presentIllnessHistory: null, physicalExam: null, diagnosisPrincipal: null, diagnosisSecondary: [], diagnosisHypothesis: null, medicalConsultationSavedAt: null, status: "en_cours", createdAt: "2026-08-27T08:05:00.000Z", updatedAt: "2026-08-27T08:05:00.000Z", ...overrides } as Consultation;
}

describe("computeConsultationJourney", () => {
  it("marks only steps 1-2 completed and step 3 current when there is no queue item yet", () => {
    const steps = computeConsultationJourney(patient(), consultation(), undefined);

    expect(steps[0]).toMatchObject({ key: "patientIdentified", state: "completed" });
    expect(steps[1]).toMatchObject({ key: "consultationRegistered", state: "completed" });
    expect(steps[2]).toMatchObject({ key: "queue", state: "current" });
    expect(steps[3]).toMatchObject({ key: "preConsultation", state: "not_started" });
    expect(steps.slice(4)).toSatisfy((rest: any[]) => rest.every((s) => s.state === "not_started"));
  });

  it("marks step 3 completed and step 4 current once a queue item with an arrived timeline entry exists", () => {
    const queueItem: QueueItem = {
      consultationId: "c1",
      patientId: "p1",
      status: "in_care",
      priority: "normal",
      waitingSinceMs: 600_000,
      timeline: [
        { eventType: "arrived", occurredAt: "2026-08-27T08:10:00.000Z" },
        { eventType: "registered", occurredAt: "2026-08-27T08:11:00.000Z" },
        { eventType: "in_care", occurredAt: "2026-08-27T08:15:00.000Z" },
      ],
    };

    const steps = computeConsultationJourney(patient(), consultation(), queueItem);

    expect(steps[2]).toMatchObject({ key: "queue", state: "completed", occurredAt: new Date("2026-08-27T08:10:00.000Z") });
    expect(steps[3]).toMatchObject({ key: "preConsultation", state: "current" });
  });

  it("marks steps 1-5 completed and step 6 current once vitals and the medical consultation are both saved", () => {
    const queueItem: QueueItem = {
      consultationId: "c1",
      patientId: "p1",
      status: "in_consultation",
      priority: "normal",
      waitingSinceMs: null,
      timeline: [{ eventType: "arrived", occurredAt: "2026-08-27T08:10:00.000Z" }],
    };
    const c = consultation({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z" });

    const steps = computeConsultationJourney(patient(), c, queueItem);

    expect(steps[3]).toMatchObject({ key: "preConsultation", state: "completed" });
    expect(steps[4]).toMatchObject({ key: "medicalConsultation", state: "completed" });
    expect(steps[5]).toMatchObject({ key: "exams", state: "not_started" });
    expect(steps.slice(5)).toSatisfy((rest: any[]) => rest.every((s) => s.state === "not_started"));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/consultationJourney.spec.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `computeConsultationJourney`**

```ts
// frontend/src/lib/consultationJourney.ts
import type { Consultation, Patient, QueueItem } from "@shared/schema";

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

export function computeConsultationJourney(patient: Patient, consultation: Consultation, queueItem: QueueItem | undefined): JourneyStep[] {
  const arrivalEvent = queueItem?.timeline.find((e) => e.eventType === "arrived" || e.eventType === "registered");

  const occurredAtByKey: Record<(typeof STEP_KEYS)[number], Date | null> = {
    patientIdentified: new Date(patient.createdAt),
    consultationRegistered: new Date(consultation.createdAt),
    queue: arrivalEvent ? new Date(arrivalEvent.occurredAt) : null,
    preConsultation: consultation.vitalsRecordedAt ? new Date(consultation.vitalsRecordedAt) : null,
    medicalConsultation: consultation.medicalConsultationSavedAt ? new Date(consultation.medicalConsultationSavedAt) : null,
    exams: null,
    prescription: null,
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/consultationJourney.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/consultationJourney.ts frontend/src/lib/consultationJourney.spec.ts
git commit -m "feat: add computeConsultationJourney step-progress derivation"
```

---

### Task 4: `frontend/src/pages/consultations/pre-consultation.tsx` — nurse vitals & clinical-info page

**Files:**
- Modify: `frontend/src/lib/i18n/consultations.ts`
- Create: `frontend/src/pages/consultations/pre-consultation.tsx`

**Interfaces:**
- Consumes: `Consultation`, `Patient`, `VitalSigns` (`@shared/schema`), `GET /api/consultations/detail/:id`, `GET /api/patients/detail/:id` (Phase 1, confirmed present in `patients.controller.ts`/`consultations.controller.ts`), `PUT /api/consultations/:id` (extended by Task 2). Follows the exact `useParams<{ id: string }>()` + `useLocation()` pattern already used by `frontend/src/pages/consultations/show.tsx`.
- Produces: default-exported `PreConsultationForm` page component, routed at `/consultations/:id/pre-consultation` (route registered in Task 6) — consumed from Task 6's rewritten `show.tsx` hub via `setLocation`.

- [ ] **Step 1: Add the i18n keys**

Add to both `en`/`fr` blocks of `frontend/src/lib/i18n/consultations.ts`:

```ts
    preConsultationTitle: "Pre-consultation — Patient Care",
    preConsultationSubtitle: "Recording vitals and preparing the patient before the medical visit",
    vitalSignsSection: "Vital Signs",
    bloodPressureSystolic: "Blood Pressure (Systolic)",
    bloodPressureDiastolic: "Blood Pressure (Diastolic)",
    heartRateField: "Heart Rate",
    temperatureField: "Temperature",
    oxygenSaturationField: "Oxygen Saturation",
    respiratoryRateField: "Respiratory Rate",
    weightKgField: "Weight",
    heightCmField: "Height",
    bmiCalculatedField: "BMI (Calculated)",
    capillaryGlycemiaField: "Capillary Glycemia (Optional)",
    painScaleField: "Pain Assessment (VAS)",
    clinicalInfoSection: "Clinical Information",
    symptomsComplaints: "Symptoms / Patient Complaints",
    knownAllergiesFromRecord: "Known Allergies (Patient Record)",
    currentTreatmentsFromRecord: "Current Treatments",
    nurseNotesObservations: "Nurse Notes / Observations",
    pregnancyInProgress: "Pregnancy in Progress",
    pregnancyHint: "If applicable for future prescriptions",
    pregnancyNo: "No",
    pregnancyYes: "Yes",
    validatePatientReady: "Validate — Patient Ready",
    validatePatientReadyHint: "The doctor will be notified that the patient is ready",
    vitalsSavedSuccessfully: "Vitals saved successfully",
    failedToSaveVitals: "Failed to save vitals",
```

```ts
    preConsultationTitle: "Pré-consultation — Prise en charge",
    preConsultationSubtitle: "Enregistrement des constantes et préparation du patient avant la visite médicale",
    vitalSignsSection: "Constantes vitales",
    bloodPressureSystolic: "Tension artérielle (Systolique)",
    bloodPressureDiastolic: "Tension artérielle (Diastolique)",
    heartRateField: "Fréquence cardiaque",
    temperatureField: "Température",
    oxygenSaturationField: "Saturation O₂",
    respiratoryRateField: "Fréquence respiratoire",
    weightKgField: "Poids",
    heightCmField: "Taille",
    bmiCalculatedField: "IMC (Calculé)",
    capillaryGlycemiaField: "Glycémie capillaire (Optionnel)",
    painScaleField: "Évaluation de la douleur (EVA)",
    clinicalInfoSection: "Informations cliniques",
    symptomsComplaints: "Symptômes / Plaintes du patient",
    knownAllergiesFromRecord: "Allergies connues (Dossier patient)",
    currentTreatmentsFromRecord: "Traitements en cours",
    nurseNotesObservations: "Notes infirmières / Observations",
    pregnancyInProgress: "Grossesse en cours",
    pregnancyHint: "Si applicable pour les prescriptions ultérieures",
    pregnancyNo: "Non",
    pregnancyYes: "Oui",
    validatePatientReady: "Valider — Patient prêt",
    validatePatientReadyHint: "Le médecin sera immédiatement notifié que le patient est prêt",
    vitalsSavedSuccessfully: "Constantes enregistrées avec succès",
    failedToSaveVitals: "Échec de l'enregistrement des constantes",
```

- [ ] **Step 2: Implement the `PreConsultationForm` page**

```tsx
// frontend/src/pages/consultations/pre-consultation.tsx
import React, { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation, Patient, VitalSigns } from "@shared/schema";

const EMPTY_VITALS: VitalSigns = {
  bloodPressureSystolic: null,
  bloodPressureDiastolic: null,
  heartRate: null,
  temperature: null,
  oxygenSaturation: null,
  respiratoryRate: null,
  weightKg: null,
  heightCm: null,
  bmi: null,
  capillaryGlycemia: null,
  painScoreEva: null,
  isPregnant: null,
};

function computeBmi(weightKg: number | null, heightCm: number | null): number | null {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export default function PreConsultationForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();
  const [vitals, setVitals] = useState<VitalSigns>(EMPTY_VITALS);
  const [symptoms, setSymptoms] = useState("");
  const [nurseNotes, setNurseNotes] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", consultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${consultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultation?.patientId,
  });

  if (consultation && !initialized) {
    setVitals(consultation.vitals ?? EMPTY_VITALS);
    setSymptoms(consultation.symptoms ?? "");
    setNurseNotes(consultation.nurseNotes ?? "");
    setInitialized(true);
  }

  const bmi = useMemo(() => computeBmi(vitals.weightKg, vitals.heightCm), [vitals.weightKg, vitals.heightCm]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest(
        "PUT",
        `/api/consultations/${consultationId}`,
        { vitals: { ...vitals, bmi }, symptoms, nurseNotes },
        { collection: "consultations", entityId: consultationId }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("vitalsSavedSuccessfully") });
      setLocation(`/consultations/${consultationId}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveVitals"), t("networkRequestFailed"));
    },
  });

  function numberField(label: string, unit: string, key: keyof VitalSigns) {
    const value = vitals[key] as number | null;
    return (
      <div>
        <Label htmlFor={`vital-${key}`}>{label}</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`vital-${key}`}
            type="number"
            className="glass-input"
            value={value ?? ""}
            onChange={(e) => setVitals((prev) => ({ ...prev, [key]: e.target.value === "" ? null : Number(e.target.value) }))}
            data-testid={`input-vital-${key}`}
          />
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      </div>
    );
  }

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="pre-consultation-form">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultations")}
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("preConsultationTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("preConsultationSubtitle")}</p>
      </div>

      <Card className="p-6 space-y-1">
        <p className="font-semibold text-foreground">{patient.firstName} {patient.lastName}</p>
        <p className="text-sm text-muted-foreground">{patient.dossierNumber ?? t("pendingSync")} · {consultation.specialty}</p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("vitalSignsSection")}</h2>
          <div className="grid grid-cols-2 gap-4">
            {numberField(t("bloodPressureSystolic"), "mmHg", "bloodPressureSystolic")}
            {numberField(t("bloodPressureDiastolic"), "mmHg", "bloodPressureDiastolic")}
            {numberField(t("heartRateField"), "bpm", "heartRate")}
            {numberField(t("temperatureField"), "°C", "temperature")}
            {numberField(t("oxygenSaturationField"), "%", "oxygenSaturation")}
            {numberField(t("respiratoryRateField"), "/min", "respiratoryRate")}
            {numberField(t("weightKgField"), "kg", "weightKg")}
            {numberField(t("heightCmField"), "cm", "heightCm")}
          </div>
          <div>
            <Label>{t("bmiCalculatedField")}</Label>
            <Input value={bmi ?? ""} disabled className="glass-input" data-testid="input-vital-bmi" />
          </div>
          {numberField(t("capillaryGlycemiaField"), "g/L", "capillaryGlycemia")}
          <div>
            <div className="flex items-center justify-between">
              <Label>{t("painScaleField")}</Label>
              <span className="text-sm text-muted-foreground">{vitals.painScoreEva ?? 0} / 10</span>
            </div>
            <Slider
              value={[vitals.painScoreEva ?? 0]}
              min={0}
              max={10}
              step={1}
              onValueChange={([v]) => setVitals((prev) => ({ ...prev, painScoreEva: v }))}
              data-testid="slider-pain-score"
            />
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("clinicalInfoSection")}</h2>
          <div>
            <Label htmlFor="symptoms">{t("symptomsComplaints")}</Label>
            <Textarea id="symptoms" className="glass-input" value={symptoms} onChange={(e) => setSymptoms(e.target.value)} data-testid="textarea-symptoms" />
          </div>
          <div>
            <Label>{t("knownAllergiesFromRecord")}</Label>
            <p className="text-sm text-muted-foreground">{patient.allergyDetails || "—"}</p>
          </div>
          <div>
            <Label>{t("currentTreatmentsFromRecord")}</Label>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{patient.currentTreatments || "—"}</p>
          </div>
          <div>
            <Label htmlFor="nurseNotes">{t("nurseNotesObservations")}</Label>
            <Textarea id="nurseNotes" className="glass-input" value={nurseNotes} onChange={(e) => setNurseNotes(e.target.value)} data-testid="textarea-nurse-notes" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label>{t("pregnancyInProgress")}</Label>
              <p className="text-xs text-muted-foreground">{t("pregnancyHint")}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm">{vitals.isPregnant ? t("pregnancyYes") : t("pregnancyNo")}</span>
              <Switch
                checked={vitals.isPregnant ?? false}
                onCheckedChange={(checked) => setVitals((prev) => ({ ...prev, isPregnant: checked }))}
                data-testid="switch-pregnancy"
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}`)}>{t("cancel")}</Button>
        <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-validate-patient-ready">
          <CheckCircle className="w-4 h-4 mr-2" />
          {saveMutation.isPending ? t("saving") : t("validatePatientReady")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/i18n/consultations.ts frontend/src/pages/consultations/pre-consultation.tsx
git commit -m "feat: add PreConsultationForm (nurse vitals and clinical info)"
```

---

### Task 5: `frontend/src/pages/consultations/consultation-medicale.tsx` — doctor exam & diagnosis page

**Files:**
- Modify: `frontend/src/lib/i18n/consultations.ts`
- Create: `frontend/src/pages/consultations/consultation-medicale.tsx`

**Interfaces:**
- Consumes: `Consultation`, `Patient`, `PhysicalExam`, `SystemExamFinding`, `ExamSystem`, `DiagnosisPrincipal` (`@shared/schema`), `GET /api/consultations/detail/:id`, `GET /api/patients/detail/:id`, `PUT /api/consultations/:id` (Task 2). Follows the same `useParams<{ id: string }>()` + `useLocation()` pattern as `show.tsx`/Task 4.
- Produces: default-exported `ConsultationMedicaleForm` page component, routed at `/consultations/:id/consultation-medicale` (route registered in Task 6) — consumed from Task 6's rewritten hub via `setLocation`.

- [ ] **Step 1: Add the i18n keys**

Add to both `en`/`fr` blocks of `frontend/src/lib/i18n/consultations.ts`:

```ts
    consultationMedicaleTitle: "Medical Consultation",
    clinicalSummaryCardTitle: "Patient Clinical Summary",
    antecedentsLabel: "Medical History",
    allergiesLabel: "Allergies",
    currentTreatmentsLabel: "Current Treatments",
    anamneseSection: "History of Present Illness",
    presentIllnessHistoryField: "History of Present Illness",
    relevantHistoryTags: "Relevant History",
    addHistoryEntry: "Add",
    newHistoryEntryPlaceholder: "e.g. Hypertension since 2019",
    physicalExamSection: "Physical Exam",
    generalExamSection: "General Exam",
    generalStateField: "General State",
    consciousnessField: "Consciousness",
    hydrationField: "Hydration",
    examBySystemSection: "Exam by System",
    examSystemCardiovasculaire: "Cardiovascular",
    examSystemRespiratoire: "Respiratory",
    examSystemNeurologique: "Neurological",
    examSystemDigestif: "Digestive",
    examSystemOrl: "ENT",
    examSystemDermatologique: "Dermatological",
    examStatusNormal: "Normal",
    examStatusAnormal: "Abnormal",
    examStatusNonExamine: "Not examined",
    examSystemNotesPlaceholder: "Exam notes...",
    medicalEvaluationSection: "Medical Evaluation",
    diagnosisPrincipalLabel: "Primary Diagnosis (required)",
    diagnosisCertaintyConfirme: "Confirmed",
    diagnosisCertaintySuspecte: "Suspected",
    diagnosisSecondaryLabel: "Secondary Diagnoses",
    diagnosisHypothesisLabel: "Diagnostic Hypothesis",
    saveDraft: "Save Draft",
    markCompleted: "Mark as Completed",
    requestExams: "Request Exams",
    prescribeAction: "Prescribe",
    closeConsultationAction: "Close Consultation",
    availableInFuturePhase: "Available in a future phase",
    draftSavedSuccessfully: "Draft saved",
    consultationMarkedCompleted: "Consultation marked as completed",
    failedToSaveConsultation: "Failed to save the consultation",
```

```ts
    consultationMedicaleTitle: "Consultation médicale",
    clinicalSummaryCardTitle: "Résumé clinique du patient",
    antecedentsLabel: "Antécédents",
    allergiesLabel: "Allergies",
    currentTreatmentsLabel: "Traitements actuels",
    anamneseSection: "Histoire de la maladie",
    presentIllnessHistoryField: "Histoire de la maladie",
    relevantHistoryTags: "Antécédents pertinents",
    addHistoryEntry: "Ajouter",
    newHistoryEntryPlaceholder: "ex. HTA depuis 2019",
    physicalExamSection: "Examen clinique",
    generalExamSection: "Examen général",
    generalStateField: "État général",
    consciousnessField: "Conscience",
    hydrationField: "Hydratation",
    examBySystemSection: "Examen par système",
    examSystemCardiovasculaire: "Cardiovasculaire",
    examSystemRespiratoire: "Respiratoire",
    examSystemNeurologique: "Neurologique",
    examSystemDigestif: "Digestif",
    examSystemOrl: "ORL",
    examSystemDermatologique: "Dermatologique",
    examStatusNormal: "Normal",
    examStatusAnormal: "Anormal",
    examStatusNonExamine: "Non examiné",
    examSystemNotesPlaceholder: "Notes d'examen...",
    medicalEvaluationSection: "Évaluation médicale",
    diagnosisPrincipalLabel: "Diagnostic principal (requis)",
    diagnosisCertaintyConfirme: "Confirmé",
    diagnosisCertaintySuspecte: "Suspecté",
    diagnosisSecondaryLabel: "Diagnostics secondaires",
    diagnosisHypothesisLabel: "Hypothèse diagnostique",
    saveDraft: "Sauvegarder brouillon",
    markCompleted: "Marquer terminée",
    requestExams: "Demander examens",
    prescribeAction: "Prescrire",
    closeConsultationAction: "Clôturer la consultation",
    availableInFuturePhase: "Disponible dans une prochaine phase",
    draftSavedSuccessfully: "Brouillon enregistré",
    consultationMarkedCompleted: "Consultation marquée comme terminée",
    failedToSaveConsultation: "Échec de l'enregistrement de la consultation",
```

- [ ] **Step 2: Implement the `ConsultationMedicaleForm` page**

```tsx
// frontend/src/pages/consultations/consultation-medicale.tsx
import React, { useState } from "react";
import { ArrowLeft, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation, DiagnosisPrincipal, ExamSystem, Patient, PhysicalExam } from "@shared/schema";

const EXAM_SYSTEMS: ExamSystem[] = ["cardiovasculaire", "respiratoire", "neurologique", "digestif", "orl", "dermatologique"];

const EMPTY_PHYSICAL_EXAM: PhysicalExam = {
  generalState: null,
  consciousness: null,
  hydration: null,
  systemFindings: EXAM_SYSTEMS.map((system) => ({ system, status: "non_examine", notes: null })),
};

export default function ConsultationMedicaleForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

  const [relevantHistory, setRelevantHistory] = useState<string[]>([]);
  const [newHistoryEntry, setNewHistoryEntry] = useState("");
  const [presentIllnessHistory, setPresentIllnessHistory] = useState("");
  const [physicalExam, setPhysicalExam] = useState<PhysicalExam>(EMPTY_PHYSICAL_EXAM);
  const [diagnosisPrincipal, setDiagnosisPrincipal] = useState<DiagnosisPrincipal | null>(null);
  const [diagnosisSecondary, setDiagnosisSecondary] = useState<string[]>([]);
  const [newSecondaryDiagnosis, setNewSecondaryDiagnosis] = useState("");
  const [diagnosisHypothesis, setDiagnosisHypothesis] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", consultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${consultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultation?.patientId,
  });

  if (consultation && !initialized) {
    setRelevantHistory(consultation.relevantHistory ?? []);
    setPresentIllnessHistory(consultation.presentIllnessHistory ?? "");
    setPhysicalExam(consultation.physicalExam ?? EMPTY_PHYSICAL_EXAM);
    setDiagnosisPrincipal(consultation.diagnosisPrincipal ?? null);
    setDiagnosisSecondary(consultation.diagnosisSecondary ?? []);
    setDiagnosisHypothesis(consultation.diagnosisHypothesis ?? "");
    setInitialized(true);
  }

  function payload() {
    return { relevantHistory, presentIllnessHistory, physicalExam, diagnosisPrincipal, diagnosisSecondary, diagnosisHypothesis };
  }

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, payload(), { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("draftSavedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveConsultation"), t("networkRequestFailed"));
    },
  });

  const markCompletedMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { ...payload(), status: "terminee" }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationMarkedCompleted") });
      setLocation(`/consultations/${consultationId}`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveConsultation"), t("networkRequestFailed"));
    },
  });

  function updateFinding(system: ExamSystem, patch: Partial<{ status: "normal" | "anormal" | "non_examine"; notes: string }>) {
    setPhysicalExam((prev) => ({
      ...prev,
      systemFindings: prev.systemFindings.map((f) => (f.system === system ? { ...f, ...patch } : f)),
    }));
  }

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isPending = saveDraftMutation.isPending || markCompletedMutation.isPending;

  return (
    <div className="space-y-6 pb-24" data-testid="consultation-medicale-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("consultationMedicaleTitle")} — {consultation.number ?? t("pendingSync")}</h1>
      </div>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("clinicalSummaryCardTitle")}</h2>
        <p className="text-sm"><span className="text-muted-foreground">{t("antecedentsLabel")}: </span>{[patient.medicalHistory, patient.surgicalHistory, patient.chronicDiseases].filter(Boolean).join(" · ") || "—"}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("allergiesLabel")}: </span>{patient.allergyDetails || "—"}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("currentTreatmentsLabel")}: </span>{patient.currentTreatments || "—"}</p>
      </Card>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("visitReason")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.reason}</p>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("anamneseSection")}</h2>
        <div>
          <Label htmlFor="presentIllnessHistory">{t("presentIllnessHistoryField")}</Label>
          <Textarea id="presentIllnessHistory" className="glass-input" value={presentIllnessHistory} onChange={(e) => setPresentIllnessHistory(e.target.value)} data-testid="textarea-present-illness-history" />
        </div>
        <div>
          <Label>{t("relevantHistoryTags")}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {relevantHistory.map((entry, index) => (
              <Badge key={`${entry}-${index}`} variant="secondary" className="gap-1">
                {entry}
                <button type="button" onClick={() => setRelevantHistory((prev) => prev.filter((_, i) => i !== index))} aria-label={t("cancel")}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input
              value={newHistoryEntry}
              onChange={(e) => setNewHistoryEntry(e.target.value)}
              placeholder={t("newHistoryEntryPlaceholder")}
              className="glass-input"
              data-testid="input-new-history-entry"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!newHistoryEntry.trim()) return;
                setRelevantHistory((prev) => [...prev, newHistoryEntry.trim()]);
                setNewHistoryEntry("");
              }}
              data-testid="button-add-history-entry">
              <Plus className="w-4 h-4 mr-1" />
              {t("addHistoryEntry")}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("physicalExamSection")}</h2>
        <div>
          <h3 className="text-sm font-medium text-foreground">{t("generalExamSection")}</h3>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <div>
              <Label htmlFor="generalState">{t("generalStateField")}</Label>
              <Input id="generalState" className="glass-input" value={physicalExam.generalState ?? ""} onChange={(e) => setPhysicalExam((prev) => ({ ...prev, generalState: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="consciousness">{t("consciousnessField")}</Label>
              <Input id="consciousness" className="glass-input" value={physicalExam.consciousness ?? ""} onChange={(e) => setPhysicalExam((prev) => ({ ...prev, consciousness: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="hydration">{t("hydrationField")}</Label>
              <Input id="hydration" className="glass-input" value={physicalExam.hydration ?? ""} onChange={(e) => setPhysicalExam((prev) => ({ ...prev, hydration: e.target.value }))} />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium text-foreground">{t("examBySystemSection")}</h3>
          <Tabs defaultValue={EXAM_SYSTEMS[0]} className="mt-2">
            <TabsList>
              {EXAM_SYSTEMS.map((system) => (
                <TabsTrigger key={system} value={system} data-testid={`tab-exam-system-${system}`}>
                  {t(`examSystem${system[0].toUpperCase()}${system.slice(1)}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {EXAM_SYSTEMS.map((system) => {
              const finding = physicalExam.systemFindings.find((f) => f.system === system)!;
              return (
                <TabsContent key={system} value={system} className="space-y-3">
                  <RadioGroup
                    value={finding.status}
                    onValueChange={(value) => updateFinding(system, { status: value as "normal" | "anormal" | "non_examine" })}
                    className="flex gap-4">
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="normal" id={`${system}-normal`} />
                      <Label htmlFor={`${system}-normal`}>{t("examStatusNormal")}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="anormal" id={`${system}-anormal`} />
                      <Label htmlFor={`${system}-anormal`}>{t("examStatusAnormal")}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="non_examine" id={`${system}-non-examine`} />
                      <Label htmlFor={`${system}-non-examine`}>{t("examStatusNonExamine")}</Label>
                    </div>
                  </RadioGroup>
                  <Textarea
                    className="glass-input"
                    placeholder={t("examSystemNotesPlaceholder")}
                    value={finding.notes ?? ""}
                    onChange={(e) => updateFinding(system, { notes: e.target.value })}
                    data-testid={`textarea-exam-notes-${system}`}
                  />
                </TabsContent>
              );
            })}
          </Tabs>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("medicalEvaluationSection")}</h2>
        <div>
          <Label htmlFor="diagnosisPrincipalLabel">{t("diagnosisPrincipalLabel")}</Label>
          <div className="flex gap-2">
            <Input
              id="diagnosisPrincipalLabel"
              className="glass-input"
              value={diagnosisPrincipal?.label ?? ""}
              onChange={(e) => setDiagnosisPrincipal({ label: e.target.value, certainty: diagnosisPrincipal?.certainty ?? "suspecte" })}
              data-testid="input-diagnosis-principal-label"
            />
            <RadioGroup
              value={diagnosisPrincipal?.certainty ?? "suspecte"}
              onValueChange={(value) => setDiagnosisPrincipal({ label: diagnosisPrincipal?.label ?? "", certainty: value as "confirme" | "suspecte" })}
              className="flex gap-4 items-center">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="confirme" id="diagnosis-confirme" />
                <Label htmlFor="diagnosis-confirme">{t("diagnosisCertaintyConfirme")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="suspecte" id="diagnosis-suspecte" />
                <Label htmlFor="diagnosis-suspecte">{t("diagnosisCertaintySuspecte")}</Label>
              </div>
            </RadioGroup>
          </div>
        </div>
        <div>
          <Label>{t("diagnosisSecondaryLabel")}</Label>
          <div className="flex flex-wrap gap-2 mt-2">
            {diagnosisSecondary.map((entry, index) => (
              <Badge key={`${entry}-${index}`} variant="secondary" className="gap-1">
                {entry}
                <button type="button" onClick={() => setDiagnosisSecondary((prev) => prev.filter((_, i) => i !== index))} aria-label={t("cancel")}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <Input value={newSecondaryDiagnosis} onChange={(e) => setNewSecondaryDiagnosis(e.target.value)} className="glass-input" data-testid="input-new-secondary-diagnosis" />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!newSecondaryDiagnosis.trim()) return;
                setDiagnosisSecondary((prev) => [...prev, newSecondaryDiagnosis.trim()]);
                setNewSecondaryDiagnosis("");
              }}
              data-testid="button-add-secondary-diagnosis">
              <Plus className="w-4 h-4 mr-1" />
              {t("addHistoryEntry")}
            </Button>
          </div>
        </div>
        <div>
          <Label htmlFor="diagnosisHypothesis">{t("diagnosisHypothesisLabel")}</Label>
          <Textarea id="diagnosisHypothesis" className="glass-input" value={diagnosisHypothesis} onChange={(e) => setDiagnosisHypothesis(e.target.value)} data-testid="textarea-diagnosis-hypothesis" />
        </div>
      </Card>

      <Card className="p-6 space-y-2 opacity-60" data-testid="card-future-phase-sections">
        <h2 className="font-semibold text-foreground">{t("requestExams")} · {t("prescribeAction")} · {t("closeConsultationAction")}</h2>
        <p className="text-sm text-muted-foreground">{t("availableInFuturePhase")}</p>
      </Card>

      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-background border-t border-border p-4 flex items-center justify-end gap-2">
        <Button variant="outline" disabled data-testid="button-request-exams">{t("requestExams")}</Button>
        <Button variant="outline" disabled data-testid="button-prescribe">{t("prescribeAction")}</Button>
        <Button variant="outline" onClick={() => saveDraftMutation.mutate()} disabled={isPending} data-testid="button-save-draft">
          {saveDraftMutation.isPending ? t("saving") : t("saveDraft")}
        </Button>
        <Button variant="outline" disabled data-testid="button-close-consultation">{t("closeConsultationAction")}</Button>
        <Button className="btn-primary" onClick={() => markCompletedMutation.mutate()} disabled={isPending} data-testid="button-mark-completed">
          {markCompletedMutation.isPending ? t("saving") : t("markCompleted")}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/i18n/consultations.ts frontend/src/pages/consultations/consultation-medicale.tsx
git commit -m "feat: add ConsultationMedicaleForm (anamnesis, physical exam, diagnosis)"
```

---

### Task 6: Rewrite `frontend/src/pages/consultations/show.tsx` into the consultation hub, and register the two new routes

**Files:**
- Modify: `frontend/src/pages/consultations/show.tsx` (full rewrite — replaces its current `clinicalObservations`/`diagnosis` `Card`s with the stepper + summary cards; the existing "Modifier" action stays as a persistent top-bar button, and "Mettre en file d'attente" — same mutation, same endpoint — becomes the step-3 current-step CTA instead of a persistent button, since it's only ever actionable while the consultation hasn't been queued yet)
- Modify: `frontend/src/App.tsx` (register `/consultations/:id/pre-consultation` and `/consultations/:id/consultation-medicale`)
- Modify: `frontend/src/lib/i18n/consultations.ts`

**Interfaces:**
- Consumes: `computeConsultationJourney` (Task 3), the `PreConsultationForm`/`ConsultationMedicaleForm` pages (Tasks 4-5, reached via `setLocation`, not imported directly), `GET /api/consultations/detail/:id`, `GET /api/patients/detail/:id`, `GET /api/queue/:tenantId` (Phase 1), `ConsultationsPolicy.canUpdate` (Phase 1).
- Produces: the rewritten `show.tsx` at the existing `/consultations/:id` route now renders the hub instead of the old `clinicalObservations`/`diagnosis` editor.

- [ ] **Step 1: Add the i18n keys**

Add to both `en`/`fr` blocks of `frontend/src/lib/i18n/consultations.ts`:

```ts
    modifyLabel: "Modify",
    journeyPanelTitle: "Consultation Journey",
    journeyStepPatientIdentified: "Patient Identified",
    journeyStepConsultationRegistered: "Consultation Registered",
    journeyStepQueue: "Queue",
    journeyStepPreConsultation: "Pre-consultation",
    journeyStepMedicalConsultation: "Medical Consultation",
    journeyStepExams: "Additional Exams",
    journeyStepPrescription: "Prescription",
    journeyStepCarePlan: "Care Plan",
    journeyStepClosure: "Summary & Closure",
    quickViewTitle: "Consultation Quick View",
    quickViewSubtitle: "Summary of information collected at each step of the journey",
    motifCardTitle: "Reason",
    vitalsCardTitle: "Vitals",
    diagnosisCardTitle: "Diagnosis",
    examsCardTitle: "Exams",
    prescriptionCardTitle: "Prescription",
    carePlanCardTitle: "Care Plan",
    notStartedYet: "Not started",
    currentStepCta: "Current Step",
    continueToStep: "Continue",
    printConsultation: "Print",
    patientHistory: "Patient History",
    addNote: "Add a Note",
    cancelConsultationAction: "Cancel Consultation",
    consultationCancelledSuccessfully: "Consultation cancelled",
    failedToCancelConsultation: "Failed to cancel the consultation",
```

```ts
    modifyLabel: "Modifier",
    journeyPanelTitle: "Parcours de consultation",
    journeyStepPatientIdentified: "Patient identifié",
    journeyStepConsultationRegistered: "Consultation enregistrée",
    journeyStepQueue: "File d'attente",
    journeyStepPreConsultation: "Pré-consultation",
    journeyStepMedicalConsultation: "Consultation médicale",
    journeyStepExams: "Examens complémentaires",
    journeyStepPrescription: "Prescription",
    journeyStepCarePlan: "Plan de prise en charge",
    journeyStepClosure: "Résumé et clôture",
    quickViewTitle: "Vue rapide de la consultation",
    quickViewSubtitle: "Résumé des informations collectées à chaque étape du parcours",
    motifCardTitle: "Motif",
    vitalsCardTitle: "Constantes",
    diagnosisCardTitle: "Diagnostic",
    examsCardTitle: "Examens",
    prescriptionCardTitle: "Prescription",
    carePlanCardTitle: "Plan de prise en charge",
    notStartedYet: "Non démarré",
    currentStepCta: "Étape en cours",
    continueToStep: "Continuer",
    printConsultation: "Imprimer",
    patientHistory: "Historique patient",
    addNote: "Ajouter une note",
    cancelConsultationAction: "Annuler la consultation",
    consultationCancelledSuccessfully: "Consultation annulée",
    failedToCancelConsultation: "Échec de l'annulation de la consultation",
```

- [ ] **Step 2: Rewrite `show.tsx` into the consultation hub**

```tsx
// frontend/src/pages/consultations/show.tsx
import React from "react";
import { ArrowLeft, ArrowRight, Edit, Printer, User, StickyNote, Ban } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { ConsultationsPolicy } from "@/lib/policies/consultations.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import { computeConsultationJourney, type JourneyStep } from "@/lib/consultationJourney";
import type { Consultation, Patient, QueueItem } from "@shared/schema";

const STEP_LABEL_KEYS: Record<string, string> = {
  patientIdentified: "journeyStepPatientIdentified",
  consultationRegistered: "journeyStepConsultationRegistered",
  queue: "journeyStepQueue",
  preConsultation: "journeyStepPreConsultation",
  medicalConsultation: "journeyStepMedicalConsultation",
  exams: "journeyStepExams",
  prescription: "journeyStepPrescription",
  carePlan: "journeyStepCarePlan",
  closure: "journeyStepClosure",
};

export default function ConsultationHub() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

  const { data: consultation } = useQuery<Consultation>({
    queryKey: ["/api/consultations/detail", consultationId],
    queryFn: async () => {
      const response = await fetch(`/api/consultations/detail/${consultationId}`, { credentials: "include" });
      return response.json();
    },
  });

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", consultation?.patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${consultation?.patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!consultation?.patientId,
  });

  const { data: queueItems = [] } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { status: "annulee" }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationCancelledSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCancelConsultation"), t("networkRequestFailed"));
    },
  });

  const queueMutation = useMutation({
    mutationFn: async () =>
      offlineApiRequest(
        "POST",
        "/api/queue/events",
        { consultationId, patientId: consultation?.patientId, eventType: "arrived", tenantId: currentTenant?.id },
        { collection: "queue" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
      toast({ title: t("success"), description: t("queueEntryAddedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToAddToQueue"), t("networkRequestFailed"));
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const queueItem = queueItems.find((item) => item.consultationId === consultationId);
  const steps = computeConsultationJourney(patient, consultation, queueItem);
  const currentStep = steps.find((s) => s.state === "current");
  const completedCount = steps.filter((s) => s.state === "completed").length;

  function stepLabel(step: JourneyStep): string {
    return t(STEP_LABEL_KEYS[step.key]);
  }

  function currentStepAction() {
    if (!currentStep) return null;
    switch (currentStep.key) {
      case "queue":
        return (
          <Button className="btn-primary" onClick={() => queueMutation.mutate()} disabled={queueMutation.isPending} data-testid="button-hub-add-to-queue">
            {t("putInQueue")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "preConsultation":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/pre-consultation`)} data-testid="button-hub-continue-pre-consultation">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "medicalConsultation":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)} data-testid="button-hub-continue-medical-consultation">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      default:
        return <Badge variant="secondary">{t("availableInFuturePhase")}</Badge>;
    }
  }

  return (
    <div className="space-y-6" data-testid="consultation-hub">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setLocation("/consultations")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          {t("consultations")}
        </Button>
        <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
          <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/edit`)} data-testid="button-edit-consultation">
            <Edit className="w-4 h-4 mr-2" />
            {t("editConsultation")}
          </Button>
        </PolicyGuard>
      </div>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("consultation")} — {consultation.number ?? t("pendingSync")}</h1>
        <p className="text-sm text-muted-foreground">{patient.firstName} {patient.lastName} · {consultation.specialty}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("journeyPanelTitle")}</h2>
          <ol className="space-y-3">
            {steps.map((step) => (
              <li key={step.key} className="flex items-center gap-2 text-sm" data-testid={`journey-step-${step.key}`}>
                <span
                  className={
                    step.state === "completed"
                      ? "w-2 h-2 rounded-full bg-primary"
                      : step.state === "current"
                        ? "w-2 h-2 rounded-full border-2 border-primary"
                        : "w-2 h-2 rounded-full bg-muted"
                  }
                />
                <span className={step.state === "not_started" ? "text-muted-foreground" : "text-foreground"}>{stepLabel(step)}</span>
              </li>
            ))}
          </ol>
          <Progress value={(completedCount / steps.length) * 100} />
          <p className="text-xs text-muted-foreground">{completedCount} / {steps.length}</p>
        </Card>

        <div className="space-y-6">
          <div>
            <h2 className="font-semibold text-foreground">{t("quickViewTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("quickViewSubtitle")}</p>
          </div>

          <Card className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("motifCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">{consultation.reason}</p>
          </Card>

          <Card className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("vitalsCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/pre-consultation`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">
              {consultation.vitals
                ? `TA ${consultation.vitals.bloodPressureSystolic ?? "—"}/${consultation.vitals.bloodPressureDiastolic ?? "—"} | FC ${consultation.vitals.heartRate ?? "—"} | SpO₂ ${consultation.vitals.oxygenSaturation ?? "—"}%`
                : t("notStartedYet")}
            </p>
          </Card>

          <Card className="p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("diagnosisCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">{consultation.diagnosisPrincipal?.label ?? t("notStartedYet")}</p>
          </Card>

          <Card className="p-4 space-y-1 opacity-60" data-testid="card-hub-exams">
            <span className="text-sm font-medium">{t("examsCardTitle")}</span>
            <p className="text-sm text-muted-foreground">{t("notStartedYet")}</p>
          </Card>
          <Card className="p-4 space-y-1 opacity-60" data-testid="card-hub-prescription">
            <span className="text-sm font-medium">{t("prescriptionCardTitle")}</span>
            <p className="text-sm text-muted-foreground">{t("notStartedYet")}</p>
          </Card>
          <Card className="p-4 space-y-1 opacity-60" data-testid="card-hub-care-plan">
            <span className="text-sm font-medium">{t("carePlanCardTitle")}</span>
            <p className="text-sm text-muted-foreground">{t("notStartedYet")}</p>
          </Card>

          <Card className="p-6 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">{t("currentStepCta")}</h3>
              {currentStep && <p className="text-sm text-muted-foreground">{stepLabel(currentStep)}</p>}
            </div>
            {currentStepAction()}
          </Card>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <div className="flex gap-2">
          <Button variant="outline" disabled data-testid="button-add-note">
            <StickyNote className="w-4 h-4 mr-2" />
            {t("addNote")}
          </Button>
          <Button variant="outline" onClick={() => window.print()} data-testid="button-print-consultation">
            <Printer className="w-4 h-4 mr-2" />
            {t("printConsultation")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}`)} data-testid="button-patient-history">
            <User className="w-4 h-4 mr-2" />
            {t("patientHistory")}
          </Button>
        </div>
        <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
          <Button variant="destructive" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending} data-testid="button-cancel-consultation">
            <Ban className="w-4 h-4 mr-2" />
            {t("cancelConsultationAction")}
          </Button>
        </PolicyGuard>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Register the two new routes in `App.tsx`**

In `frontend/src/App.tsx`:
- Add two lazy imports, right after `const ConsultationDetails = lazy(() => import("./pages/consultations/show"));`:
```tsx
const PreConsultationForm = lazy(() => import("./pages/consultations/pre-consultation"));
const ConsultationMedicaleForm = lazy(() => import("./pages/consultations/consultation-medicale"));
```
- Add two new `<Route>` blocks, right after the existing `<Route path="/consultations/:id/edit">` block and before `<Route path="/consultations/:id">` (more specific paths must come before the less specific `/consultations/:id` in a Wouter `<Switch>`):
```tsx
        <Route path="/consultations/:id/pre-consultation">
          <ProtectedRoute>
            <Layout>
              <PreConsultationForm />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/consultation-medicale">
          <ProtectedRoute>
            <Layout>
              <ConsultationMedicaleForm />
            </Layout>
          </ProtectedRoute>
        </Route>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — no remaining references to the removed `clinicalObservations`/`diagnosis` fields anywhere in `frontend/src/`.

- [ ] **Step 5: Run the full test suites**

Run: `cd backend && npx jest` and `cd frontend && npx vitest run`
Expected: PASS — including `i18nCompleteness.test.ts` (every key added in Tasks 4-6 must exist in both `en` and `fr`) and no regressions in Phase 1's suites.

- [ ] **Step 6: Manual verification of the full Phase 2 loop**

Run the app. As `accueil`, register a patient via File d'attente (Phase 1 flow) so a `Consultation` exists and is `in_care`. As `medecin` or `infirmier`, open `/consultations`, click the consultation to open `/consultations/:id` (now the hub) — confirm the stepper shows steps 1-3 completed and step 4 ("Pré-consultation") current, with a "Continuer" CTA. Click it (navigates to `/consultations/:id/pre-consultation`), fill in vitals (confirm BMI auto-computes from weight/height), symptoms, and pregnancy toggle, click "Valider — Patient prêt" — confirm it navigates back to `/consultations/:id` with step 4 now completed and step 5 current. Click "Continuer" again (navigates to `/consultations/:id/consultation-medicale`), fill in anamnèse/antécédents tags/exam-by-system tabs/diagnostic principal, click "Sauvegarder brouillon" — confirm a toast appears and the hub's "Diagnostic" card updates after returning. Re-open, click "Marquer terminée" — confirm the consultation completes and the hub's stepper still shows 5/9. Confirm the Examens/Prescription/Plan de prise en charge cards and the "Demander examens"/"Prescrire"/"Clôturer la consultation" buttons are visibly present but disabled throughout. Confirm the "Modifier" button (logistics edit, `/consultations/:id/edit`) still works, and that a consultation not yet queued shows "Mettre en file d'attente" as its step-3 CTA and adding it to the queue works. Confirm `accueil` can view the hub but not the "Annuler la consultation" button, the "Modifier" button, or the form save actions (only `admin`/`manager`/`medecin`/`infirmier` should). Confirm "Historique patient" navigates to the correct patient's own `/patients/:id` page.
Expected: the full loop works without console errors; no `laboratoire`/`pharmacien`/`cashier` user can reach `/consultations` at all (unchanged from Phase 1's `ConsultationsPolicy.view()`).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/consultations/show.tsx frontend/src/App.tsx frontend/src/lib/i18n/consultations.ts
git commit -m "feat: add consultation hub and wire pre-consultation/consultation-medicale flow"
```
