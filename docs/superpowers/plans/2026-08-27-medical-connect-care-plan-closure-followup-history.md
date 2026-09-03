# Medical Connect — Phase 4: Care Plan, Closure, Post-Consultation Follow-up, Patient History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give real behavior to the consultation hub's last two steps ("Plan de prise en charge", "Résumé et clôture"), still hard-coded to `null` since Phase 2, and add three screens that don't exist yet in any phase's stepper: the post-closure follow-up dashboard, the async lab-result review screen, and the patient's cross-consultation history (a lightweight timeline tab plus a richer clinical dossier view).

**Architecture:** No new CouchDB document types — `Consultation` and `LabOrder` (both already-shipped Phase 1-3 documents) each gain a small set of additive, nullable fields (`carePlan`/`carePlanSavedAt`/`closedAt` on `Consultation`; `followUpAction`/`followUpNote`/`followUpRecordedAt` on `LabOrder`). `CarePlan` is a discriminated union keyed by `orientation`, validated conditionally in `UpdateConsultationDto`. Six new frontend pages under `frontend/src/pages/consultations/` and one under `frontend/src/pages/patients/`, plus a new "Historique" tab on the existing patient detail page, all built on a small new pure-function library (`patientTimeline.ts`) shared between the two history views.

**Tech Stack:** NestJS, CouchDB (`nano`), class-validator, React 18, Wouter, `@tanstack/react-query`, Tailwind + shadcn `ui/` components (`RadioGroup`, `Select`, `AlertDialog`, `Tabs`, `Table`, `Badge`, `Card`, `Checkbox`).

**Spec:** `docs/superpowers/specs/2026-08-27-medical-connect-care-plan-closure-followup-history-design.md`

## Global Constraints

- **Prerequisite:** Phases 1-3 are implemented on this branch (`feature/medical-connect-phase3-exams-prescriptions` at the time of writing) — this plan builds directly on the real `Consultation`/`LabOrder`/`Prescription` schema and the real `consultation-medicale.tsx`/`show.tsx` (hub)/`patients/show.tsx` code, verified by reading the actual files, not the Phase 2/3 spec documents' descriptions of them (one of those descriptions turned out stale — see Task 16).
- CouchDB documents only, no Drizzle/Postgres — same convention as Phases 1-3. No document-generation/PDF infrastructure anywhere in this repo, and none is introduced here — the "Actions et synthèses générées automatiquement" panel and the specialist-referral "courrier" are composed text at render time, never stored or exported (design spec §3/§6/§7).
- No structured lab-parameter model (paramètre/valeur/plage de référence) — `LabOrderExamLine.resultText` stays free text, exactly as shipped in Phase 3 (design spec §7).
- Tenant ID always derived from `req.user.tenantId` via the existing private `tenantId(req, legacyTenantId?)` helper already used by every controller touched here. Actor ids always derived from `req.user.id`, never the request body.
- Every user-facing string goes through `t("key")`, added to **both** `en`/`fr`, checked by `frontend/src/lib/i18nCompleteness.test.ts`. `t(key: string): string` takes no interpolation parameters (verified in `frontend/src/lib/i18n/index.ts`) — any string with a dynamic count/value is built by concatenating a translated fragment with the raw value in JSX, the same way `show.tsx`'s `{completedCount} / {steps.length}` already does; never invent a template-style key.
- No `@testing-library/react`/jsdom. Backend logic and extracted frontend `lib/` functions are unit-tested; thin page components are not, matching Phases 1-3.
- Never hand-roll a raw `<button>`/`<input>`/`<select>`/`<table>`/`<dialog>`/checkbox/radio when `frontend/src/components/ui/` has the component. Confirmed present and used in this plan: `RadioGroup`, `Select`, `Checkbox`, `AlertDialog`, `Tabs`, `Table`, `Badge`, `Card`, `Button`, `Input`, `Textarea`, `Label`. `recharts`/`ui/chart.tsx` exist in the repo (shadcn scaffold) but are unused anywhere in the app — the vitals trend in Task 14 stays a small hand-rolled inline `<svg>` rather than adopting an otherwise-unused charting library for one screen.
- Wouter matches routes by exact path, and more specific routes must be declared **before** less specific ones sharing a prefix (`/consultations/:id/edit` before `/consultations/:id`, `/patients/:id/edit` before `/patients/:id` — verified in the current `App.tsx`). Every new route here follows the same ordering rule (Task 15).
- **Deviation from the design spec, discovered while planning:** the design spec (§2, §6) describes `consultation-medicale.tsx` as still carrying disabled "Plan de prise en charge"/"Documents" placeholder cards left over from the Phase 2 mockup. Reading the actual shipped file shows Phase 3 never kept those cards — only a single disabled `button-close-consultation` remains in the bottom action bar, next to the already-active `button-mark-completed`. The spec has been corrected in place; Task 16 below adds a brand-new "Plan de prise en charge" card (no card to "re-enable") and activates the existing disabled button.

---

### Task 1: `CarePlan` union, `LabOrderFollowUpAction`, and schema field extensions

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `frontend/shared/schema.ts`

**Interfaces:**
- Consumes: `Consultation`, `LabOrder` (existing, Phases 1/3).
- Produces: `CarePlanOrientation`, `CarePlanRetourDomicile`, `CarePlanControleSuivi`, `CarePlanHospitalisation`, `CarePlanOrientationSpecialiste`, `CarePlanTransfertUrgent`, `CarePlanAutre`, `CarePlan`, `LabOrderFollowUpAction`, and the extended `Consultation`/`LabOrder` interfaces — consumed by every later task.

- [ ] **Step 1: Add the new types to `backend/src/shared/schema.ts`**

Insert directly after the `InsertConsultation` line (before the `LabOrderStatus` block):

```ts
export type CarePlanOrientation = "retour_domicile" | "controle_suivi" | "hospitalisation" | "orientation_specialiste" | "transfert_urgent" | "autre";

export interface CarePlanRetourDomicile {
  orientation: "retour_domicile";
  medicalRecommendations: string;
  patientInstructions: string;
}

export interface CarePlanControleSuivi {
  orientation: "controle_suivi";
  medicalRecommendations: string;
  patientInstructions: string;
  appointmentDate: string;
  specialty: string;
  doctor: string;
  followUpReason: string;
}

export interface CarePlanHospitalisation {
  orientation: "hospitalisation";
  targetService: string;
  estimatedStayDuration: string;
  admissionReason: string;
  bedUrgentlyRequired: boolean;
  familyNotified: boolean;
  preAdmissionInstructions: string;
}

export interface CarePlanOrientationSpecialiste {
  orientation: "orientation_specialiste";
  recommendedSpecialty: string;
  recommendedDoctorOrFacility: string;
  clinicalReason: string;
  urgencyLevel: "routine" | "semi_urgent" | "urgent";
  generateReferralLetter: boolean;
  attachedDocuments: string[];
}

export interface CarePlanTransfertUrgent {
  orientation: "transfert_urgent";
  destinationFacility: string;
  vitalUrgencyLevel: string;
  medicalReason: string;
  transportType: "ambulance_simple" | "ambulance_medicalisee" | "samu_smur";
  onCallDoctorContacted: boolean;
  estimatedDepartureTime: string;
}

export interface CarePlanAutre {
  orientation: "autre";
  decisionType: string;
  reevaluationFrequency: string;
  description: string;
  followUpNeeded: boolean;
  involvedParties: string[];
}

export type CarePlan =
  | CarePlanRetourDomicile
  | CarePlanControleSuivi
  | CarePlanHospitalisation
  | CarePlanOrientationSpecialiste
  | CarePlanTransfertUrgent
  | CarePlanAutre;

export type LabOrderFollowUpAction = "aucune_action" | "contacter_patient" | "modifier_traitement" | "programmer_rdv" | "nouvel_examen";
```

- [ ] **Step 2: Extend `Consultation` in `backend/src/shared/schema.ts`**

Replace:

```ts
export interface Consultation { id: string; tenantId: string; number: string | null; patientId: string; scheduledAt: Date; specialty: string; assignedDoctorId: string; roomId: string | null; priority: ConsultationPriority; reason: string; nurseNotes: string | null; symptoms: string | null; vitals: VitalSigns | null; vitalsRecordedAt: Date | null; relevantHistory: string[]; presentIllnessHistory: string | null; physicalExam: PhysicalExam | null; diagnosisPrincipal: DiagnosisPrincipal | null; diagnosisSecondary: string[]; diagnosisHypothesis: string | null; medicalConsultationSavedAt: Date | null; status: ConsultationStatus; createdAt: Date; updatedAt: Date }
```

with:

```ts
export interface Consultation { id: string; tenantId: string; number: string | null; patientId: string; scheduledAt: Date; specialty: string; assignedDoctorId: string; roomId: string | null; priority: ConsultationPriority; reason: string; nurseNotes: string | null; symptoms: string | null; vitals: VitalSigns | null; vitalsRecordedAt: Date | null; relevantHistory: string[]; presentIllnessHistory: string | null; physicalExam: PhysicalExam | null; diagnosisPrincipal: DiagnosisPrincipal | null; diagnosisSecondary: string[]; diagnosisHypothesis: string | null; medicalConsultationSavedAt: Date | null; carePlan: CarePlan | null; carePlanSavedAt: Date | null; closedAt: Date | null; status: ConsultationStatus; createdAt: Date; updatedAt: Date }
```

- [ ] **Step 3: Extend `LabOrder` in `backend/src/shared/schema.ts`**

Replace:

```ts
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
```

with:

```ts
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
  followUpAction: LabOrderFollowUpAction | null;
  followUpNote: string | null;
  followUpRecordedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

- [ ] **Step 4: Mirror all of it into `frontend/shared/schema.ts`**

Identical `CarePlan*`/`LabOrderFollowUpAction` block (types are date-free, so this part is byte-for-byte identical). For `Consultation` and `LabOrder`, apply the same field insertions as Steps 2-3 but keep the frontend mirror's existing `string`-typed dates convention — `carePlanSavedAt`/`closedAt`/`followUpRecordedAt` are `string | null`, not `Date | null`, matching how `vitalsRecordedAt`/`medicalConsultationSavedAt` are already mirrored.

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: PASS (pure additions, nothing references them yet).

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add CarePlan union and LabOrder follow-up schema types"
```

---

### Task 2: Backend — persist `carePlan`/`closedAt` on `Consultation`

**Files:**
- Modify: `backend/src/modules/consultations/dto/update-consultation.dto.ts`
- Modify: `backend/src/modules/consultations/consultations.repository.ts`
- Modify: `backend/src/modules/consultations/consultations.repository.spec.ts`

**Interfaces:**
- Consumes: `CarePlan` (Task 1).
- Produces: `PUT /api/consultations/:id` now accepts an optional `carePlan`; sets `carePlanSavedAt` on any write that includes `carePlan`, and `closedAt` on the first transition to `status: "terminee"` — consumed by Task 5 (`computeConsultationJourney`), Task 9 (`plan-prise-en-charge.tsx`), Task 10 (`resume-cloture.tsx`).

- [ ] **Step 1: Write the failing repository tests**

Add to the `describe("update")` block in `backend/src/modules/consultations/consultations.repository.spec.ts`, alongside the existing `vitalsRecordedAt`/`medicalConsultationSavedAt` tests:

```ts
    it("sets carePlanSavedAt when carePlan is included in the update payload", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        carePlanSavedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const carePlan = { orientation: "retour_domicile" as const, medicalRecommendations: "Repos 48h", patientInstructions: "Consulter si fièvre" };
      const result = await repository.update("c1", "tenant-1", { carePlan } as any);

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ carePlan, carePlanSavedAt: expect.any(String) }));
      expect(result.carePlanSavedAt).toBeInstanceOf(Date);
    });

    it("sets closedAt on the first transition to terminee but not on a later one", async () => {
      const existing = {
        _id: "consultation:c1",
        _rev: "2-a",
        id: "c1",
        type: "consultation",
        tenantId: "tenant-1",
        number: "C-2026-0904",
        status: "en_cours",
        closedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new ConsultationsRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        { next: jest.fn() } as any,
        patientsRepoStub() as any
      );

      const first = await repository.update("c1", "tenant-1", { status: "terminee" } as any);
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "terminee", closedAt: expect.any(String) }));
      expect(first.closedAt).toBeInstanceOf(Date);

      const alreadyClosed = { ...existing, status: "terminee", closedAt: "2026-08-27T09:00:00.000Z" };
      db.get.mockResolvedValue(alreadyClosed);
      const second = await repository.update("c1", "tenant-1", { status: "terminee" } as any);
      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ closedAt: "2026-08-27T09:00:00.000Z" }));
      expect(second.closedAt).toEqual(new Date("2026-08-27T09:00:00.000Z"));
    });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts`
Expected: FAIL — `carePlanSavedAt`/`closedAt` are `undefined` on the inserted document (repository doesn't set them yet).

- [ ] **Step 3: Extend `ConsultationsRepository.create`/`update`/`hydrate`**

In `backend/src/modules/consultations/consultations.repository.ts`, inside `create()`, add the three new fields to the initial `consultation` object, right before `status: "planifiee",`:

```ts
      carePlan: null,
      carePlanSavedAt: null,
      closedAt: null,
      status: "planifiee",
```

Replace the `update()` method body with:

```ts
  async update(id: string, tenantId: string, data: Partial<InsertConsultation> & Record<string, unknown>): Promise<Consultation> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "consultation" || current.tenantId !== tenantId) {
      throw new NotFoundException("Consultation not found");
    }

    const now = new Date().toISOString();
    const enteringTerminee = data.status === "terminee" && current.status !== "terminee";
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
      carePlanSavedAt: "carePlan" in data ? now : (current.carePlanSavedAt ?? null),
      closedAt: enteringTerminee ? now : (current.closedAt ?? null),
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }
```

In `hydrate()`, add to the returned object, alongside `medicalConsultationSavedAt`:

```ts
      carePlanSavedAt: doc.carePlanSavedAt ? new Date(doc.carePlanSavedAt) : null,
      closedAt: doc.closedAt ? new Date(doc.closedAt) : null,
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add `CarePlanDto` and wire it into `UpdateConsultationDto`**

In `backend/src/modules/consultations/dto/update-consultation.dto.ts`, add after the existing `DiagnosisPrincipalDto` class:

```ts
class CarePlanDto {
  @IsIn(["retour_domicile", "controle_suivi", "hospitalisation", "orientation_specialiste", "transfert_urgent", "autre"])
  orientation: string;

  @ValidateIf((o) => o.orientation === "retour_domicile" || o.orientation === "controle_suivi")
  @IsString() @IsNotEmpty() medicalRecommendations?: string;
  @ValidateIf((o) => o.orientation === "retour_domicile" || o.orientation === "controle_suivi")
  @IsString() @IsNotEmpty() patientInstructions?: string;

  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() appointmentDate?: string;
  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() specialty?: string;
  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() doctor?: string;
  @ValidateIf((o) => o.orientation === "controle_suivi") @IsString() @IsNotEmpty() followUpReason?: string;

  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() targetService?: string;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() estimatedStayDuration?: string;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() admissionReason?: string;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsBoolean() bedUrgentlyRequired?: boolean;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsBoolean() familyNotified?: boolean;
  @ValidateIf((o) => o.orientation === "hospitalisation") @IsString() @IsNotEmpty() preAdmissionInstructions?: string;

  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsString() @IsNotEmpty() recommendedSpecialty?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsString() @IsNotEmpty() recommendedDoctorOrFacility?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsString() @IsNotEmpty() clinicalReason?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsIn(["routine", "semi_urgent", "urgent"]) urgencyLevel?: string;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsBoolean() generateReferralLetter?: boolean;
  @ValidateIf((o) => o.orientation === "orientation_specialiste") @IsArray() @IsString({ each: true }) attachedDocuments?: string[];

  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() destinationFacility?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() vitalUrgencyLevel?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() medicalReason?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsIn(["ambulance_simple", "ambulance_medicalisee", "samu_smur"]) transportType?: string;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsBoolean() onCallDoctorContacted?: boolean;
  @ValidateIf((o) => o.orientation === "transfert_urgent") @IsString() @IsNotEmpty() estimatedDepartureTime?: string;

  @ValidateIf((o) => o.orientation === "autre") @IsString() @IsNotEmpty() decisionType?: string;
  @ValidateIf((o) => o.orientation === "autre") @IsString() @IsNotEmpty() reevaluationFrequency?: string;
  @ValidateIf((o) => o.orientation === "autre") @IsString() @IsNotEmpty() description?: string;
  @ValidateIf((o) => o.orientation === "autre") @IsBoolean() followUpNeeded?: boolean;
  @ValidateIf((o) => o.orientation === "autre") @IsArray() @IsString({ each: true }) involvedParties?: string[];
}
```

Add `ValidateIf` and `IsArray` to the existing `class-validator` import line at the top of the file (currently `IsString, IsOptional, IsIn, IsUUID, IsDateString, IsNumber, IsBoolean, IsArray, IsNotEmpty, ValidateNested`) — `IsArray` is already imported, only `ValidateIf` needs adding.

Add to `UpdateConsultationDto`, after the `diagnosisHypothesis` field:

```ts
  @ValidateNested() @Type(() => CarePlanDto) @IsOptional() carePlan?: CarePlanDto;
```

- [ ] **Step 6: Add a DTO validation test**

Add to `backend/src/modules/consultations/dto/` a new spec if none covers DTO validation directly today; otherwise add to the existing DTO validation spec (`backend/src/modules/consultations/consultations.dto.spec.ts` if present — check with `ls backend/src/modules/consultations/*.spec.ts` first; if absent, create `backend/src/modules/consultations/dto/update-consultation.dto.spec.ts`):

```ts
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { UpdateConsultationDto } from "./update-consultation.dto";

describe("UpdateConsultationDto — carePlan", () => {
  it("rejects a carePlan whose fields don't match its declared orientation", async () => {
    const dto = plainToInstance(UpdateConsultationDto, {
      carePlan: { orientation: "retour_domicile", appointmentDate: "2026-11-10" },
    });
    const errors = await validate(dto);
    const carePlanError = errors.find((e) => e.property === "carePlan");
    expect(carePlanError).toBeDefined();
  });

  it("accepts a carePlan whose fields match its declared orientation", async () => {
    const dto = plainToInstance(UpdateConsultationDto, {
      carePlan: { orientation: "retour_domicile", medicalRecommendations: "Repos 48h", patientInstructions: "Consulter si fièvre" },
    });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === "carePlan")).toBeUndefined();
  });
});
```

Run: `cd backend && npx jest src/modules/consultations/dto/update-consultation.dto.spec.ts`
Expected: PASS once Step 5 is in place (write this test after Step 5, or expect it to FAIL first if you want the strict red/green order — either is fine here since Step 5's DTO is a small, low-risk addition already covered by the repository tests above).

- [ ] **Step 7: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/consultations
git commit -m "feat: persist carePlan and closedAt on Consultation"
```

---

### Task 3: Backend — lab order follow-up endpoint

**Files:**
- Create: `backend/src/modules/lab-orders/dto/record-lab-order-follow-up.dto.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.repository.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.repository.spec.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.policy.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.policy.spec.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.service.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.controller.ts`

**Interfaces:**
- Consumes: `LabOrderFollowUpAction` (Task 1).
- Produces: `PATCH /api/lab-orders/:id/follow-up` — consumed by Task 12 (`suivi-resultat.tsx`).

- [ ] **Step 1: Write the failing repository test**

Add to `backend/src/modules/lab-orders/lab-orders.repository.spec.ts`, as a new `describe` block alongside `describe("update")`:

```ts
  describe("recordFollowUp", () => {
    it("sets followUpAction/Note/RecordedAt on the existing lab order", async () => {
      const existing = {
        _id: "lab_order:lo1",
        _rev: "2-a",
        id: "lo1",
        type: "lab_order",
        tenantId: "tenant-1",
        consultationId: "c1",
        patientId: "patient-1",
        examLines: [{ examName: "Ionogramme", resultText: "Na+ 139 mmol/L" }],
        status: "termine",
        followUpAction: null,
        followUpNote: null,
        followUpRecordedAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      const result = await repository.recordFollowUp("lo1", "tenant-1", { followUpAction: "contacter_patient", followUpNote: "Rappeler demain" });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ followUpAction: "contacter_patient", followUpNote: "Rappeler demain", followUpRecordedAt: expect.any(String) })
      );
      expect(result.followUpRecordedAt).toBeInstanceOf(Date);
    });

    it("throws NotFoundException when the lab order does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any);

      await expect(repository.recordFollowUp("missing", "tenant-1", { followUpAction: "aucune_action" })).rejects.toThrow(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/modules/lab-orders/lab-orders.repository.spec.ts`
Expected: FAIL — `repository.recordFollowUp is not a function`.

- [ ] **Step 3: Implement `LabOrdersRepository.recordFollowUp`**

Add to `backend/src/modules/lab-orders/lab-orders.repository.ts`, alongside `update()`:

```ts
  async recordFollowUp(id: string, tenantId: string, data: { followUpAction: LabOrderFollowUpAction; followUpNote?: string | null }): Promise<LabOrder> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "lab_order" || current.tenantId !== tenantId) {
      throw new NotFoundException("Lab order not found");
    }

    const now = new Date().toISOString();
    const updated = {
      ...current,
      followUpAction: data.followUpAction,
      followUpNote: data.followUpNote ?? null,
      followUpRecordedAt: now,
      updatedAt: now,
    };

    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }
```

Add `LabOrderFollowUpAction` to the `@shared/schema` type import at the top of the file. In `create()`, add the three new fields to the initial `labOrder` object, right before `createdAt: now,`:

```ts
      followUpAction: null,
      followUpNote: null,
      followUpRecordedAt: null,
```

In `hydrate()`, add alongside `validatedAt`:

```ts
      followUpRecordedAt: doc.followUpRecordedAt ? new Date(doc.followUpRecordedAt) : null,
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest src/modules/lab-orders/lab-orders.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing policy test**

Add to `backend/src/modules/lab-orders/lab-orders.policy.spec.ts`:

```ts
  it.each(["admin", "manager", "medecin"])("%s can recordFollowUp", (role) => {
    expect(policyFor(role).recordFollowUp()).toBe(true);
  });

  it.each(["laboratoire", "infirmier", "pharmacien"])("%s cannot recordFollowUp", (role) => {
    expect(policyFor(role).recordFollowUp()).toBe(false);
  });
```

- [ ] **Step 6: Run the test to verify it fails, then implement**

Run: `cd backend && npx jest src/modules/lab-orders/lab-orders.policy.spec.ts` → FAIL (`recordFollowUp is not a function`).

Add to `backend/src/modules/lab-orders/lab-orders.policy.ts`:

```ts
  recordFollowUp(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }
```

Run again: PASS.

- [ ] **Step 7: DTO**

```ts
// backend/src/modules/lab-orders/dto/record-lab-order-follow-up.dto.ts
import { IsIn, IsString, IsOptional } from "class-validator";

export class RecordLabOrderFollowUpDto {
  @IsIn(["aucune_action", "contacter_patient", "modifier_traitement", "programmer_rdv", "nouvel_examen"])
  followUpAction: string;

  @IsString() @IsOptional() followUpNote?: string;
}
```

- [ ] **Step 8: Service method**

Add to `backend/src/modules/lab-orders/lab-orders.service.ts`:

```ts
  recordFollowUp(id: string, tenantId: string, data: { followUpAction: string; followUpNote?: string }) {
    return this.labOrdersRepository.recordFollowUp(id, tenantId, data as any);
  }
```

- [ ] **Step 9: Controller route**

In `backend/src/modules/lab-orders/lab-orders.controller.ts`, add `Patch` to the `@nestjs/common` import and `RecordLabOrderFollowUpDto` to the DTO imports, then add:

```ts
  @Patch(":id/follow-up")
  @CheckPolicy(LabOrdersPolicy, "recordFollowUp")
  async recordFollowUp(@Param("id") id: string, @Body() dto: RecordLabOrderFollowUpDto, @Request() req: any) {
    return this.labOrdersService.recordFollowUp(id, this.tenantId(req), dto as any);
  }
```

- [ ] **Step 10: Typecheck and boot-check**

Run: `cd backend && npx tsc --noEmit && npm run build`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add backend/src/modules/lab-orders
git commit -m "feat: add lab order follow-up endpoint"
```

---

### Task 4: Backend — `patientId` filter on consultations/lab-orders/prescriptions

**Files:**
- Modify: `backend/src/modules/consultations/consultations.repository.ts`
- Modify: `backend/src/modules/consultations/consultations.repository.spec.ts`
- Modify: `backend/src/modules/consultations/consultations.controller.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.repository.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.repository.spec.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.controller.ts`
- Modify: `backend/src/modules/prescriptions/prescriptions.repository.ts`
- Modify: `backend/src/modules/prescriptions/prescriptions.repository.spec.ts`
- Modify: `backend/src/modules/prescriptions/prescriptions.controller.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `?patientId=` query parameter on all three `GET .../:tenantId` listing endpoints — consumed by Task 7 (`patientTimeline.ts`), Task 13 (Historique tab), Task 14 (`dossier-medical.tsx`).

The same three-line change repeated identically across three modules — one task, one commit, since a reviewer would approve or reject this uniform mechanical change as a whole, not module by module.

- [ ] **Step 1: Write the failing tests**

Add to each repository's `describe("findByTenant")` block:

`backend/src/modules/consultations/consultations.repository.spec.ts`:

```ts
    it("filters by patientId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, patientsRepoStub() as any);

      await repository.findByTenant("tenant-1", { patientId: "patient-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "consultation", tenantId: "tenant-1", patientId: "patient-1" }) })
      );
    });
```

`backend/src/modules/lab-orders/lab-orders.repository.spec.ts`:

```ts
    it("filters by patientId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { patientId: "patient-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "lab_order", tenantId: "tenant-1", patientId: "patient-1" }) })
      );
    });
```

`backend/src/modules/prescriptions/prescriptions.repository.spec.ts` (mirror the existing `findByTenant` test there):

```ts
    it("filters by patientId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new PrescriptionsRepository(couchDBService as any, consultationsRepoStub() as any);

      await repository.findByTenant("tenant-1", { patientId: "patient-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "prescription", tenantId: "tenant-1", patientId: "patient-1" }) })
      );
    });
```

(Check the exact stub helper name at the top of `prescriptions.repository.spec.ts` — it mirrors `consultationsRepoStub` from the lab-orders spec; use whatever name is already defined there.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts src/modules/lab-orders/lab-orders.repository.spec.ts src/modules/prescriptions/prescriptions.repository.spec.ts`
Expected: FAIL — `patientId` is silently ignored by all three selectors today.

- [ ] **Step 3: Add the filter to all three repositories**

`backend/src/modules/consultations/consultations.repository.ts` — add to `ConsultationFilters`:

```ts
export interface ConsultationFilters {
  specialty?: string;
  assignedDoctorId?: string;
  scheduledOnOrAfter?: string;
  patientId?: string;
}
```

and in `findByTenant`, add alongside the other selector conditions:

```ts
    if (filters?.patientId) selector.patientId = filters.patientId;
```

`backend/src/modules/lab-orders/lab-orders.repository.ts` — add to `LabOrderFilters`:

```ts
export interface LabOrderFilters {
  consultationId?: string;
  status?: string;
  priority?: string;
  patientId?: string;
}
```

and in `findByTenant`:

```ts
    if (filters?.patientId) selector.patientId = filters.patientId;
```

`backend/src/modules/prescriptions/prescriptions.repository.ts` — add to `PrescriptionFilters`:

```ts
export interface PrescriptionFilters {
  consultationId?: string;
  status?: string;
  patientId?: string;
}
```

and in `findByTenant`:

```ts
    if (filters?.patientId) selector.patientId = filters.patientId;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest src/modules/consultations/consultations.repository.spec.ts src/modules/lab-orders/lab-orders.repository.spec.ts src/modules/prescriptions/prescriptions.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Wire the query param through each controller**

`backend/src/modules/consultations/consultations.controller.ts` — `findByTenant` gains a parameter:

```ts
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("specialty") specialty?: string,
    @Query("assignedDoctorId") assignedDoctorId?: string,
    @Query("scheduledOnOrAfter") scheduledOnOrAfter?: string,
    @Query("patientId") patientId?: string,
    @Request() req?: any
  ) {
    return this.consultationsService.findByTenant(this.tenantId(req, tenantId), { specialty, assignedDoctorId, scheduledOnOrAfter, patientId });
  }
```

`backend/src/modules/lab-orders/lab-orders.controller.ts` — same pattern:

```ts
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("consultationId") consultationId?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("patientId") patientId?: string,
    @Request() req?: any
  ) {
    return this.labOrdersService.findByTenant(this.tenantId(req, tenantId), { consultationId, status, priority, patientId });
  }
```

`backend/src/modules/prescriptions/prescriptions.controller.ts` — same pattern:

```ts
  async findByTenant(
    @Param("tenantId") tenantId: string,
    @Query("consultationId") consultationId?: string,
    @Query("status") status?: string,
    @Query("patientId") patientId?: string,
    @Request() req?: any
  ) {
    return this.prescriptionsService.findByTenant(this.tenantId(req, tenantId), { consultationId, status, patientId });
  }
```

- [ ] **Step 6: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/consultations backend/src/modules/lab-orders backend/src/modules/prescriptions
git commit -m "feat: add patientId filter to consultations/lab-orders/prescriptions listing"
```

---

### Task 5: Extend `computeConsultationJourney` for `carePlan`/`closure` steps

**Files:**
- Modify: `frontend/src/lib/consultationJourney.ts`
- Modify: `frontend/src/lib/consultationJourney.spec.ts`

**Interfaces:**
- Consumes: `Consultation.carePlan`/`carePlanSavedAt`/`closedAt` (Task 1).
- Produces: real `carePlan`/`closure` step derivation — consumed by Task 17 (`ConsultationHub`). Signature unchanged.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/lib/consultationJourney.spec.ts`:

```ts
  it("marks step 8 completed once carePlan is set, occurredAt from carePlanSavedAt", () => {
    const c = consultation({
      vitalsRecordedAt: "2026-08-27T10:25:00.000Z",
      medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z",
      status: "terminee",
      carePlan: { orientation: "retour_domicile", medicalRecommendations: "Repos", patientInstructions: "RAS" },
      carePlanSavedAt: "2026-08-27T11:00:00.000Z",
    } as any);

    const steps = computeConsultationJourney(patient(), c, undefined, [], []);

    expect(steps[7]).toMatchObject({ key: "carePlan", state: "completed", occurredAt: new Date("2026-08-27T11:00:00.000Z") });
  });

  it("marks step 8 current while carePlan is still null", () => {
    const c = consultation({ vitalsRecordedAt: "2026-08-27T10:25:00.000Z", medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z" });

    const steps = computeConsultationJourney(patient(), c, undefined, [], []);

    expect(steps[7]).toMatchObject({ key: "carePlan", state: "current" });
    expect(steps[8]).toMatchObject({ key: "closure", state: "not_started" });
  });

  it("marks step 9 completed only once status is terminee and closedAt is set", () => {
    const c = consultation({
      vitalsRecordedAt: "2026-08-27T10:25:00.000Z",
      medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z",
      carePlan: { orientation: "autre", decisionType: "x", reevaluationFrequency: "1 semaine", description: "y", followUpNeeded: false, involvedParties: [] },
      carePlanSavedAt: "2026-08-27T11:00:00.000Z",
      status: "terminee",
      closedAt: "2026-08-27T11:05:00.000Z",
    } as any);

    const steps = computeConsultationJourney(patient(), c, undefined, [], []);

    expect(steps[8]).toMatchObject({ key: "closure", state: "completed", occurredAt: new Date("2026-08-27T11:05:00.000Z") });
  });

  it("does not mark step 9 completed when status is terminee but closedAt was never set (legacy Marquer terminée path)", () => {
    const c = consultation({
      vitalsRecordedAt: "2026-08-27T10:25:00.000Z",
      medicalConsultationSavedAt: "2026-08-27T10:35:00.000Z",
      carePlan: { orientation: "autre", decisionType: "x", reevaluationFrequency: "1 semaine", description: "y", followUpNeeded: false, involvedParties: [] },
      carePlanSavedAt: "2026-08-27T11:00:00.000Z",
      status: "terminee",
      closedAt: null,
    } as any);

    const steps = computeConsultationJourney(patient(), c, undefined, [], []);

    expect(steps[8]).toMatchObject({ key: "closure", state: "current" });
  });
```

Check the file's existing `consultation(...)` test helper — it almost certainly spreads `overrides` onto a base object (matching the `patient()` helper pattern used elsewhere in this spec file); if `carePlan`/`carePlanSavedAt`/`closedAt` aren't already part of its base fixture, add them there as `null` defaults so the new tests' overrides work without touching every other test.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/consultationJourney.spec.ts`
Expected: FAIL — steps 8/9 are always `not_started`/never `completed`.

- [ ] **Step 3: Update `computeConsultationJourney`**

In `frontend/src/lib/consultationJourney.ts`, replace the `occurredAtByKey` object's last two entries:

```ts
    carePlan: null,
    closure: null,
```

with:

```ts
    carePlan: consultation.carePlan ? new Date(consultation.carePlanSavedAt ?? consultation.updatedAt) : null,
    closure: consultationClosed && consultation.closedAt ? new Date(consultation.closedAt) : null,
```

(`consultationClosed` is already computed at the top of the function as `consultation.status === "terminee"` — reused, not redefined.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/consultationJourney.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/consultationJourney.ts frontend/src/lib/consultationJourney.spec.ts
git commit -m "feat: derive care-plan/closure hub steps from Consultation.carePlan/closedAt"
```

---

### Task 6: Frontend `LabOrdersPolicy.canRecordFollowUp`

**Files:**
- Modify: `frontend/src/lib/policies/labOrders.policy.ts`

**Interfaces:**
- Consumes: `BasePolicy` (existing).
- Produces: `LabOrdersPolicy.canRecordFollowUp()` — consumed by Task 12 (`suivi-resultat.tsx`).

- [ ] **Step 1: Add the method**

Add to `frontend/src/lib/policies/labOrders.policy.ts`, alongside `canView`/`canCreate`/`canUpdate`:

```ts
  canRecordFollowUp(): boolean {
    return this.isAdmin() || this.isManager() || this.isMedecin();
  }
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/policies/labOrders.policy.ts
git commit -m "feat: add LabOrdersPolicy.canRecordFollowUp"
```

---

### Task 7: `patientTimeline.ts` — shared cross-consultation timeline builder

**Files:**
- Create: `frontend/src/lib/patientTimeline.ts`
- Create: `frontend/src/lib/patientTimeline.spec.ts`

**Interfaces:**
- Consumes: `Consultation`, `LabOrder`, `Prescription` (`@shared/schema`).
- Produces: `PatientTimelineEventType`, `PatientTimelineEntry`, `buildPatientTimeline(consultations, labOrders, prescriptions): PatientTimelineEntry[]` — consumed by Task 13 (Historique tab) and Task 14 (`dossier-medical.tsx`).

`PatientTimelineEntry.detail` intentionally carries only raw, non-translated payload (a specialty name, a joined list of exam/drug names) — the page components translate `entry.type` into a label via `t()` and append `entry.detail`, keeping this file free of hard-coded French/English strings per the i18n rule in Global Constraints.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/src/lib/patientTimeline.spec.ts
import { describe, expect, it } from "vitest";
import { buildPatientTimeline } from "./patientTimeline";
import type { Consultation, LabOrder, Prescription } from "@shared/schema";

function consultation(overrides: Partial<Consultation> = {}): Consultation {
  return {
    id: "c1", tenantId: "t1", number: "C-2026-0001", patientId: "p1", scheduledAt: "2026-08-01T09:00:00.000Z",
    specialty: "Cardiologie", assignedDoctorId: "doctor-1", roomId: null, priority: "normal", reason: "Suivi",
    nurseNotes: null, symptoms: null, vitals: null, vitalsRecordedAt: null, relevantHistory: [], presentIllnessHistory: null,
    physicalExam: null, diagnosisPrincipal: null, diagnosisSecondary: [], diagnosisHypothesis: null,
    medicalConsultationSavedAt: null, carePlan: null, carePlanSavedAt: null, closedAt: null, status: "planifiee",
    createdAt: "2026-08-01T09:00:00.000Z", updatedAt: "2026-08-01T09:00:00.000Z",
    ...overrides,
  } as Consultation;
}

function labOrder(overrides: Partial<LabOrder> = {}): LabOrder {
  return {
    id: "lo1", tenantId: "t1", consultationId: "c1", patientId: "p1", examLines: [{ examName: "NFS", resultText: "RAS" }],
    requestedByUserId: "doctor-1", requestedAt: "2026-08-02T09:00:00.000Z", priority: "normal", clinicalContext: null,
    specialInstructions: null, status: "termine", takenInChargeByUserId: null, takenInChargeAt: null,
    validatedByUserId: null, validatedAt: null, problemReport: null, followUpAction: null, followUpNote: null,
    followUpRecordedAt: null, createdAt: "2026-08-02T09:00:00.000Z", updatedAt: "2026-08-02T10:00:00.000Z",
    ...overrides,
  } as LabOrder;
}

function prescription(overrides: Partial<Prescription> = {}): Prescription {
  return {
    id: "pr1", tenantId: "t1", consultationId: "c1", patientId: "p1", lines: [{ drugName: "Bisoprolol", dosage: "5mg", frequency: "1/jour", durationDays: 30, quantity: "1 boîte", dispenseStatus: "delivre" }],
    prescribedByUserId: "doctor-1", prescribedAt: "2026-08-02T09:00:00.000Z", status: "delivre",
    dispensedByUserId: "pharmacist-1", dispensedAt: "2026-08-02T11:00:00.000Z",
    createdAt: "2026-08-02T09:00:00.000Z", updatedAt: "2026-08-02T11:00:00.000Z",
    ...overrides,
  } as Prescription;
}

describe("buildPatientTimeline", () => {
  it("includes a consultation_created entry for every consultation", () => {
    const entries = buildPatientTimeline([consultation()], [], []);
    expect(entries).toContainEqual(expect.objectContaining({ type: "consultation_created", detail: "Cardiologie" }));
  });

  it("includes a consultation_closed entry only when status is terminee and closedAt is set", () => {
    const closed = consultation({ status: "terminee", closedAt: "2026-08-01T12:00:00.000Z" });
    const open = consultation({ id: "c2", status: "en_cours", closedAt: null });

    const entries = buildPatientTimeline([closed, open], [], []);

    expect(entries.filter((e) => e.type === "consultation_closed")).toHaveLength(1);
  });

  it("includes a lab_result entry only for termine lab orders, with joined exam names", () => {
    const entries = buildPatientTimeline([], [labOrder({ status: "termine" }), labOrder({ id: "lo2", status: "en_cours" })], []);

    const results = entries.filter((e) => e.type === "lab_result");
    expect(results).toHaveLength(1);
    expect(results[0].detail).toBe("NFS");
  });

  it("includes a prescription_delivered entry for delivre and delivre_partiel, not for others", () => {
    const entries = buildPatientTimeline(
      [],
      [],
      [prescription({ status: "delivre" }), prescription({ id: "pr2", status: "delivre_partiel" }), prescription({ id: "pr3", status: "en_attente" })]
    );

    expect(entries.filter((e) => e.type === "prescription_delivered")).toHaveLength(2);
  });

  it("sorts entries by occurredAt descending, most recent first", () => {
    const older = consultation({ createdAt: "2026-08-01T09:00:00.000Z" });
    const newer = consultation({ id: "c2", createdAt: "2026-08-10T09:00:00.000Z" });

    const entries = buildPatientTimeline([older, newer], [], []);

    expect(entries[0].occurredAt.getTime()).toBeGreaterThan(entries[1].occurredAt.getTime());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/patientTimeline.spec.ts`
Expected: FAIL — `./patientTimeline` does not exist.

- [ ] **Step 3: Implement `patientTimeline.ts`**

```ts
// frontend/src/lib/patientTimeline.ts
import type { Consultation, LabOrder, Prescription } from "@shared/schema";

export type PatientTimelineEventType = "consultation_created" | "consultation_closed" | "lab_result" | "prescription_delivered";

export interface PatientTimelineEntry {
  type: PatientTimelineEventType;
  occurredAt: Date;
  detail: string;
}

const RESOLVED_LAB_ORDER_STATUSES = new Set(["termine"]);
const DELIVERED_PRESCRIPTION_STATUSES = new Set(["delivre", "delivre_partiel"]);

export function buildPatientTimeline(consultations: Consultation[], labOrders: LabOrder[], prescriptions: Prescription[]): PatientTimelineEntry[] {
  const entries: PatientTimelineEntry[] = [];

  for (const c of consultations) {
    entries.push({ type: "consultation_created", occurredAt: new Date(c.createdAt), detail: c.specialty });
    if (c.status === "terminee" && c.closedAt) {
      entries.push({ type: "consultation_closed", occurredAt: new Date(c.closedAt), detail: c.specialty });
    }
  }

  for (const order of labOrders) {
    if (RESOLVED_LAB_ORDER_STATUSES.has(order.status)) {
      entries.push({ type: "lab_result", occurredAt: new Date(order.updatedAt), detail: order.examLines.map((l) => l.examName).join(", ") });
    }
  }

  for (const prescription of prescriptions) {
    if (DELIVERED_PRESCRIPTION_STATUSES.has(prescription.status)) {
      entries.push({ type: "prescription_delivered", occurredAt: new Date(prescription.updatedAt), detail: prescription.lines.map((l) => l.drugName).join(", ") });
    }
  }

  return entries.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/patientTimeline.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/patientTimeline.ts frontend/src/lib/patientTimeline.spec.ts
git commit -m "feat: add buildPatientTimeline shared history helper"
```

---

### Task 8: i18n — `carePlan.ts`

**Files:**
- Create: `frontend/src/lib/i18n/carePlan.ts`
- Modify: `frontend/src/lib/i18n/index.ts`

**Interfaces:**
- Consumes: `TranslationSection` (existing).
- Produces: every `t("...")` key used by Tasks 9-14, 16-17.

- [ ] **Step 1: `carePlan.ts`**

```ts
// frontend/src/lib/i18n/carePlan.ts
import type { TranslationSection } from "./types";

export const carePlan: TranslationSection = {
  en: {
    carePlanTitle: "Care Plan",
    carePlanSubtitle: "Choose the medical orientation and decision for this consultation",
    orientationSectionTitle: "Medical Orientation & Decision",
    carePlanOrientationRetourDomicile: "Home Return",
    carePlanOrientationControleSuivi: "Follow-up / Check-up Appointment",
    carePlanOrientationHospitalisation: "Hospitalization",
    carePlanOrientationOrientationSpecialiste: "Specialist Referral",
    carePlanOrientationTransfertUrgent: "Urgent Transfer",
    carePlanOrientationAutre: "Other",
    medicalRecommendationsField: "Medical Recommendations",
    patientInstructionsField: "Patient Instructions",
    appointmentDateField: "Appointment Date",
    specialtyField: "Specialty",
    doctorField: "Doctor",
    followUpReasonField: "Follow-up Reason",
    targetServiceField: "Target Service",
    estimatedStayDurationField: "Estimated Stay Duration",
    admissionReasonField: "Admission Reason",
    bedUrgentlyRequiredField: "Bed Urgently Required",
    familyNotifiedField: "Family Notified",
    preAdmissionInstructionsField: "Pre-Admission Instructions",
    recommendedSpecialtyField: "Recommended Specialty",
    recommendedDoctorOrFacilityField: "Recommended Doctor / Facility",
    clinicalReasonField: "Clinical Reason",
    urgencyLevelField: "Urgency Level",
    urgencyLevelRoutine: "Routine",
    urgencyLevelSemiUrgent: "Semi-urgent",
    urgencyLevelUrgent: "Urgent",
    generateReferralLetterField: "Generate Automatic Referral Letter",
    destinationFacilityField: "Destination Facility",
    vitalUrgencyLevelField: "Vital Urgency Level",
    medicalReasonField: "Medical Reason",
    transportTypeField: "Transport Type",
    transportTypeAmbulanceSimple: "Standard Ambulance",
    transportTypeAmbulanceMedicalisee: "Medicalized Ambulance",
    transportTypeSamuSmur: "SAMU-SMUR",
    onCallDoctorContactedField: "On-Call Doctor Contacted",
    estimatedDepartureTimeField: "Estimated Departure Time",
    decisionTypeField: "Decision Type",
    reevaluationFrequencyField: "Reevaluation Frequency",
    descriptionField: "Description",
    followUpNeededField: "Follow-up Needed",
    autoGeneratedActionsTitle: "Automatically Generated Actions & Summaries",
    generatedPrescriptionsLabel: "Generated Prescriptions",
    consultationSummaryLabel: "Consultation Summary",
    referralLetterLabel: "Accompanying Letter",
    saveCarePlanAction: "Save and Continue",
    carePlanSavedSuccessfully: "Care plan saved successfully",
    failedToSaveCarePlan: "Failed to save the care plan",
    noDataAvailable: "No data available",
    defineCarePlanAction: "Define the care plan",
    resumeClotureTitle: "Consultation Summary",
    resumeClotureSubtitle: "Review consultation information before closing",
    closeConsultationConfirmTitle: "Close this consultation?",
    closeConsultationPendingExamsWarning: "exam(s) still pending",
    closeConsultationArchiveNotice: "Once closed, this record will be securely archived in the patient's permanent medical history.",
    confirmCloseConsultationAction: "Close Consultation",
    consultationClosedSuccessfully: "Consultation closed successfully",
    failedToCloseConsultation: "Failed to close the consultation",
    closureSuccessTitle: "Consultation Completed",
    closureSuccessSubtitle: "The clinical record has been closed and saved successfully.",
    backToConsultationsAction: "Back to my consultations",
    viewPatientRecordAction: "View patient record",
    statusBeforeClosure: "In consultation",
    statusAfterClosure: "Completed",
    suiviTitle: "Post-Consultation Follow-up",
    suiviSubtitle: "Tracking area for actions decided during the consultation",
    urgentActionsLabel: "urgent action(s)",
    pendingActionsLabel: "pending action(s)",
    completedActionsLabel: "completed action(s)",
    followUpActionsTableTitle: "Ongoing Actions",
    followUpFilterAll: "All",
    followUpFilterPending: "Pending",
    followUpFilterDone: "Done",
    followUpFilterScheduled: "Scheduled",
    followUpServiceLab: "Laboratory",
    followUpServicePharmacy: "Pharmacy",
    followUpServiceAppointment: "Front Desk",
    timelineTitle: "Journey Timeline",
    resultDetailTitle: "Laboratory Result Detail",
    actionToTakeTitle: "Action to Take",
    followUpActionAucuneAction: "No action needed",
    followUpActionContacterPatient: "Contact patient",
    followUpActionModifierTraitement: "Modify treatment",
    followUpActionProgrammerRdv: "Schedule appointment",
    followUpActionNouvelExamen: "Request new exam",
    followUpNoteField: "Follow-up Note (optional)",
    validateAction: "Validate",
    followUpSavedSuccessfully: "Follow-up recorded successfully",
    failedToSaveFollowUp: "Failed to save the follow-up",
    informationsTab: "Information",
    historiqueTab: "History",
    periodLabel: "Period",
    startDateLabel: "Start date",
    endDateLabel: "End date",
    applyFilterAction: "Apply",
    resetFilterAction: "Reset",
    patientTimelineConsultationCreated: "Consultation created",
    patientTimelineConsultationClosed: "Consultation closed",
    patientTimelineLabResult: "Lab result available",
    patientTimelinePrescriptionDelivered: "Prescription delivered",
    noHistoryEvents: "No events in this period",
    dossierMedicalTitle: "Medical Record",
    clinicalSummaryAutoTitle: "Clinical Summary (auto-generated)",
    activeDiagnosesTitle: "Active Diagnoses",
    activeTreatmentsTitle: "Active Treatments",
    latestResultsTitle: "Latest Results",
    vitalsEvolutionTitle: "Vitals Evolution",
    diagnosisStatusActive: "Active",
    diagnosisStatusMonitoring: "Monitoring",
    tabConstantes: "Constants",
    tabTraitements: "Treatments",
    tabExamens: "Exams",
    tabDocuments: "Documents",
    tabHospitalisations: "Hospitalizations",
    hospitalisationsEmptyState: "No hospitalizations recorded",
    viewDossierMedicalAction: "View medical record",
  },
  fr: {
    carePlanTitle: "Plan de prise en charge",
    carePlanSubtitle: "Choisissez l'orientation et la décision médicale de cette consultation",
    orientationSectionTitle: "Orientation & Décision Médicale",
    carePlanOrientationRetourDomicile: "Retour à domicile",
    carePlanOrientationControleSuivi: "Contrôle / Rendez-vous de suivi",
    carePlanOrientationHospitalisation: "Hospitalisation",
    carePlanOrientationOrientationSpecialiste: "Orientation vers un spécialiste",
    carePlanOrientationTransfertUrgent: "Transfert urgent",
    carePlanOrientationAutre: "Autre",
    medicalRecommendationsField: "Recommandations médicales",
    patientInstructionsField: "Consignes au patient",
    appointmentDateField: "Date du rendez-vous",
    specialtyField: "Spécialité",
    doctorField: "Médecin",
    followUpReasonField: "Motif du suivi",
    targetServiceField: "Service cible",
    estimatedStayDurationField: "Durée estimée du séjour",
    admissionReasonField: "Motif de l'admission",
    bedUrgentlyRequiredField: "Lit requis en urgence",
    familyNotifiedField: "Famille prévenue",
    preAdmissionInstructionsField: "Instructions de pré-admission",
    recommendedSpecialtyField: "Spécialité recommandée",
    recommendedDoctorOrFacilityField: "Médecin / structure recommandé",
    clinicalReasonField: "Motif clinique",
    urgencyLevelField: "Degré d'urgence",
    urgencyLevelRoutine: "Routine",
    urgencyLevelSemiUrgent: "Semi-urgent",
    urgencyLevelUrgent: "Urgent",
    generateReferralLetterField: "Générer un courrier d'orientation automatique",
    destinationFacilityField: "Établissement de destination",
    vitalUrgencyLevelField: "Niveau d'urgence vital",
    medicalReasonField: "Motif médical",
    transportTypeField: "Type de transport",
    transportTypeAmbulanceSimple: "Ambulance simple",
    transportTypeAmbulanceMedicalisee: "Ambulance médicalisée",
    transportTypeSamuSmur: "SAMU-SMUR",
    onCallDoctorContactedField: "Médecin de garde contacté",
    estimatedDepartureTimeField: "Heure de départ estimée",
    decisionTypeField: "Type de décision",
    reevaluationFrequencyField: "Fréquence de réévaluation",
    descriptionField: "Description",
    followUpNeededField: "Suivi nécessaire",
    autoGeneratedActionsTitle: "Actions et synthèses générées automatiquement",
    generatedPrescriptionsLabel: "Ordonnances générées",
    consultationSummaryLabel: "Synthèse de consultation",
    referralLetterLabel: "Courrier d'accompagnement",
    saveCarePlanAction: "Enregistrer et continuer",
    carePlanSavedSuccessfully: "Plan de prise en charge enregistré avec succès",
    failedToSaveCarePlan: "Échec de l'enregistrement du plan de prise en charge",
    noDataAvailable: "Aucune donnée disponible",
    defineCarePlanAction: "Définir le plan de prise en charge",
    resumeClotureTitle: "Résumé de la consultation",
    resumeClotureSubtitle: "Vérifiez les informations de la consultation avant de clôturer",
    closeConsultationConfirmTitle: "Clôturer cette consultation ?",
    closeConsultationPendingExamsWarning: "examen(s) toujours en attente",
    closeConsultationArchiveNotice: "Une fois clôturée, cette fiche sera archivée de manière sécurisée dans l'historique médical permanent du patient.",
    confirmCloseConsultationAction: "Clôturer la consultation",
    consultationClosedSuccessfully: "Consultation clôturée avec succès",
    failedToCloseConsultation: "Échec de la clôture de la consultation",
    closureSuccessTitle: "Consultation terminée",
    closureSuccessSubtitle: "La fiche clinique a été clôturée et enregistrée avec succès.",
    backToConsultationsAction: "Retour à mes consultations",
    viewPatientRecordAction: "Voir le dossier patient",
    statusBeforeClosure: "En consultation",
    statusAfterClosure: "Terminée",
    suiviTitle: "Suivi post-consultation",
    suiviSubtitle: "Espace de suivi des actions décidées pendant la consultation",
    urgentActionsLabel: "action(s) urgente(s)",
    pendingActionsLabel: "action(s) en attente",
    completedActionsLabel: "action(s) terminée(s)",
    followUpActionsTableTitle: "Actions en cours",
    followUpFilterAll: "Tout",
    followUpFilterPending: "En attente",
    followUpFilterDone: "Terminé",
    followUpFilterScheduled: "Programmé",
    followUpServiceLab: "Laboratoire",
    followUpServicePharmacy: "Pharmacie",
    followUpServiceAppointment: "Accueil",
    timelineTitle: "Chronologie du parcours",
    resultDetailTitle: "Détail du résultat de laboratoire",
    actionToTakeTitle: "Action à effectuer",
    followUpActionAucuneAction: "Aucune action nécessaire",
    followUpActionContacterPatient: "Contacter le patient",
    followUpActionModifierTraitement: "Modifier le traitement",
    followUpActionProgrammerRdv: "Programmer un rendez-vous",
    followUpActionNouvelExamen: "Demander un nouvel examen",
    followUpNoteField: "Note de suivi (optionnel)",
    validateAction: "Valider",
    followUpSavedSuccessfully: "Suivi enregistré avec succès",
    failedToSaveFollowUp: "Échec de l'enregistrement du suivi",
    informationsTab: "Informations",
    historiqueTab: "Historique",
    periodLabel: "Période",
    startDateLabel: "Date de début",
    endDateLabel: "Date de fin",
    applyFilterAction: "Appliquer",
    resetFilterAction: "Réinitialiser",
    patientTimelineConsultationCreated: "Consultation créée",
    patientTimelineConsultationClosed: "Consultation clôturée",
    patientTimelineLabResult: "Résultat labo disponible",
    patientTimelinePrescriptionDelivered: "Prescription délivrée",
    noHistoryEvents: "Aucun événement sur cette période",
    dossierMedicalTitle: "Dossier médical",
    clinicalSummaryAutoTitle: "Résumé clinique (auto-généré)",
    activeDiagnosesTitle: "Diagnostics actifs",
    activeTreatmentsTitle: "Traitements actifs",
    latestResultsTitle: "Derniers résultats",
    vitalsEvolutionTitle: "Évolution des constantes",
    diagnosisStatusActive: "Actif",
    diagnosisStatusMonitoring: "En surveillance",
    tabConstantes: "Constantes",
    tabTraitements: "Traitements",
    tabExamens: "Examens",
    tabDocuments: "Documents",
    tabHospitalisations: "Hospitalisations",
    hospitalisationsEmptyState: "Aucune hospitalisation enregistrée",
    viewDossierMedicalAction: "Voir le dossier médical",
  },
};
```

- [ ] **Step 2: Register in `frontend/src/lib/i18n/index.ts`**

Add the import alongside the existing domain imports:

```ts
import { carePlan } from "./carePlan";
```

Add `carePlan` to the `sections` array, after `prescriptions`.

- [ ] **Step 3: Run the i18n completeness test**

Run: `cd frontend && npx vitest run src/lib/i18nCompleteness.test.ts`
Expected: PASS (every key defined in both `en` and `fr` above).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/i18n/carePlan.ts frontend/src/lib/i18n/index.ts
git commit -m "feat: add carePlan i18n domain"
```

---

### Task 9: `/consultations/:id/plan-prise-en-charge` — care plan form

**Files:**
- Create: `frontend/src/pages/consultations/plan-prise-en-charge.tsx`

**Interfaces:**
- Consumes: `Consultation`, `CarePlan`, `Patient`, `Prescription` (`@shared/schema`), `GET /api/consultations/detail/:id`, `GET /api/patients/detail/:id`, `GET /api/prescriptions/:tenantId?consultationId=`, `PUT /api/consultations/:id` (Task 2).
- Produces: the page rendered at `/consultations/:id/plan-prise-en-charge` (route added in Task 15).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/consultations/plan-prise-en-charge.tsx
import React, { useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { CarePlan, CarePlanOrientation, Consultation, Patient, Prescription } from "@shared/schema";

const ORIENTATIONS: CarePlanOrientation[] = ["retour_domicile", "controle_suivi", "hospitalisation", "orientation_specialiste", "transfert_urgent", "autre"];

const ORIENTATION_LABEL_KEYS: Record<CarePlanOrientation, string> = {
  retour_domicile: "carePlanOrientationRetourDomicile",
  controle_suivi: "carePlanOrientationControleSuivi",
  hospitalisation: "carePlanOrientationHospitalisation",
  orientation_specialiste: "carePlanOrientationOrientationSpecialiste",
  transfert_urgent: "carePlanOrientationTransfertUrgent",
  autre: "carePlanOrientationAutre",
};

export default function PlanPriseEnCharge() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();

  const [orientation, setOrientation] = useState<CarePlanOrientation | null>(null);
  const [retourDomicile, setRetourDomicile] = useState({ medicalRecommendations: "", patientInstructions: "" });
  const [controleSuivi, setControleSuivi] = useState({ medicalRecommendations: "", patientInstructions: "", appointmentDate: "", specialty: "", doctor: "", followUpReason: "" });
  const [hospitalisation, setHospitalisation] = useState({ targetService: "", estimatedStayDuration: "", admissionReason: "", bedUrgentlyRequired: false, familyNotified: false, preAdmissionInstructions: "" });
  const [orientationSpecialiste, setOrientationSpecialiste] = useState({ recommendedSpecialty: "", recommendedDoctorOrFacility: "", clinicalReason: "", urgencyLevel: "routine" as "routine" | "semi_urgent" | "urgent", generateReferralLetter: false });
  const [transfertUrgent, setTransfertUrgent] = useState({ destinationFacility: "", vitalUrgencyLevel: "", medicalReason: "", transportType: "ambulance_simple" as "ambulance_simple" | "ambulance_medicalisee" | "samu_smur", onCallDoctorContacted: false, estimatedDepartureTime: "" });
  const [autre, setAutre] = useState({ decisionType: "", reevaluationFrequency: "", description: "", followUpNeeded: false });
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

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  if (consultation?.carePlan && !initialized) {
    const cp = consultation.carePlan;
    setOrientation(cp.orientation);
    if (cp.orientation === "retour_domicile") setRetourDomicile({ medicalRecommendations: cp.medicalRecommendations, patientInstructions: cp.patientInstructions });
    if (cp.orientation === "controle_suivi") setControleSuivi(cp);
    if (cp.orientation === "hospitalisation") setHospitalisation(cp);
    if (cp.orientation === "orientation_specialiste") setOrientationSpecialiste({ recommendedSpecialty: cp.recommendedSpecialty, recommendedDoctorOrFacility: cp.recommendedDoctorOrFacility, clinicalReason: cp.clinicalReason, urgencyLevel: cp.urgencyLevel, generateReferralLetter: cp.generateReferralLetter });
    if (cp.orientation === "transfert_urgent") setTransfertUrgent(cp);
    if (cp.orientation === "autre") setAutre({ decisionType: cp.decisionType, reevaluationFrequency: cp.reevaluationFrequency, description: cp.description, followUpNeeded: cp.followUpNeeded });
    setInitialized(true);
  }

  function buildCarePlan(): CarePlan | null {
    if (!orientation) return null;
    if (orientation === "retour_domicile") return { orientation, ...retourDomicile };
    if (orientation === "controle_suivi") return { orientation, ...controleSuivi };
    if (orientation === "hospitalisation") return { orientation, ...hospitalisation };
    if (orientation === "orientation_specialiste") return { orientation, ...orientationSpecialiste, attachedDocuments: [] };
    if (orientation === "transfert_urgent") return { orientation, ...transfertUrgent };
    return { orientation, ...autre, involvedParties: [] };
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const carePlan = buildCarePlan();
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { carePlan }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("carePlanSavedSuccessfully") });
      setLocation(`/consultations/${consultationId}/resume-cloture`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveCarePlan"), t("networkRequestFailed"));
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  function synthese(): string {
    const parts = [consultation!.reason, consultation!.diagnosisPrincipal?.label, consultation!.physicalExam?.generalState].filter(Boolean);
    return parts.length > 0 ? parts.join(" — ") : t("noDataAvailable");
  }

  function courrier(): string {
    if (orientation === "orientation_specialiste") {
      const parts = [orientationSpecialiste.recommendedSpecialty, orientationSpecialiste.clinicalReason].filter(Boolean);
      return parts.length > 0 ? parts.join(" — ") : t("noDataAvailable");
    }
    if (orientation === "transfert_urgent") {
      const parts = [transfertUrgent.destinationFacility, transfertUrgent.medicalReason].filter(Boolean);
      return parts.length > 0 ? parts.join(" — ") : t("noDataAvailable");
    }
    return t("noDataAvailable");
  }

  return (
    <div className="space-y-6 pb-24" data-testid="plan-prise-en-charge-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultationMedicaleTitle")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("carePlanTitle")} — {consultation.number ?? t("pendingSync")}</h1>
        <p className="text-sm text-muted-foreground">{t("carePlanSubtitle")}</p>
      </div>

      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-foreground">{t("orientationSectionTitle")}</h2>
        <RadioGroup value={orientation ?? ""} onValueChange={(value) => setOrientation(value as CarePlanOrientation)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ORIENTATIONS.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`orientation-${value}`} data-testid={`radio-orientation-${value}`} />
              <Label htmlFor={`orientation-${value}`}>{t(ORIENTATION_LABEL_KEYS[value])}</Label>
            </div>
          ))}
        </RadioGroup>
      </Card>

      {orientation === "retour_domicile" && (
        <Card className="p-6 space-y-4" data-testid="card-retour-domicile">
          <div>
            <Label htmlFor="rd-recommendations">{t("medicalRecommendationsField")}</Label>
            <Textarea id="rd-recommendations" className="glass-input" value={retourDomicile.medicalRecommendations} onChange={(e) => setRetourDomicile((p) => ({ ...p, medicalRecommendations: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="rd-instructions">{t("patientInstructionsField")}</Label>
            <Textarea id="rd-instructions" className="glass-input" value={retourDomicile.patientInstructions} onChange={(e) => setRetourDomicile((p) => ({ ...p, patientInstructions: e.target.value }))} />
          </div>
        </Card>
      )}

      {orientation === "controle_suivi" && (
        <Card className="p-6 space-y-4" data-testid="card-controle-suivi">
          <div>
            <Label htmlFor="cs-recommendations">{t("medicalRecommendationsField")}</Label>
            <Textarea id="cs-recommendations" className="glass-input" value={controleSuivi.medicalRecommendations} onChange={(e) => setControleSuivi((p) => ({ ...p, medicalRecommendations: e.target.value }))} />
          </div>
          <div>
            <Label htmlFor="cs-instructions">{t("patientInstructionsField")}</Label>
            <Textarea id="cs-instructions" className="glass-input" value={controleSuivi.patientInstructions} onChange={(e) => setControleSuivi((p) => ({ ...p, patientInstructions: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cs-date">{t("appointmentDateField")}</Label>
              <Input id="cs-date" type="date" className="glass-input" value={controleSuivi.appointmentDate} onChange={(e) => setControleSuivi((p) => ({ ...p, appointmentDate: e.target.value }))} data-testid="input-appointment-date" />
            </div>
            <div>
              <Label htmlFor="cs-specialty">{t("specialtyField")}</Label>
              <Input id="cs-specialty" className="glass-input" value={controleSuivi.specialty} onChange={(e) => setControleSuivi((p) => ({ ...p, specialty: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cs-doctor">{t("doctorField")}</Label>
              <Input id="cs-doctor" className="glass-input" value={controleSuivi.doctor} onChange={(e) => setControleSuivi((p) => ({ ...p, doctor: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="cs-reason">{t("followUpReasonField")}</Label>
              <Input id="cs-reason" className="glass-input" value={controleSuivi.followUpReason} onChange={(e) => setControleSuivi((p) => ({ ...p, followUpReason: e.target.value }))} />
            </div>
          </div>
        </Card>
      )}

      {orientation === "hospitalisation" && (
        <Card className="p-6 space-y-4" data-testid="card-hospitalisation">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="h-service">{t("targetServiceField")}</Label>
              <Input id="h-service" className="glass-input" value={hospitalisation.targetService} onChange={(e) => setHospitalisation((p) => ({ ...p, targetService: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="h-duration">{t("estimatedStayDurationField")}</Label>
              <Input id="h-duration" className="glass-input" value={hospitalisation.estimatedStayDuration} onChange={(e) => setHospitalisation((p) => ({ ...p, estimatedStayDuration: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="h-reason">{t("admissionReasonField")}</Label>
            <Textarea id="h-reason" className="glass-input" value={hospitalisation.admissionReason} onChange={(e) => setHospitalisation((p) => ({ ...p, admissionReason: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="h-bed" checked={hospitalisation.bedUrgentlyRequired} onCheckedChange={(v) => setHospitalisation((p) => ({ ...p, bedUrgentlyRequired: v === true }))} />
            <Label htmlFor="h-bed">{t("bedUrgentlyRequiredField")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="h-family" checked={hospitalisation.familyNotified} onCheckedChange={(v) => setHospitalisation((p) => ({ ...p, familyNotified: v === true }))} />
            <Label htmlFor="h-family">{t("familyNotifiedField")}</Label>
          </div>
          <div>
            <Label htmlFor="h-instructions">{t("preAdmissionInstructionsField")}</Label>
            <Textarea id="h-instructions" className="glass-input" value={hospitalisation.preAdmissionInstructions} onChange={(e) => setHospitalisation((p) => ({ ...p, preAdmissionInstructions: e.target.value }))} />
          </div>
        </Card>
      )}

      {orientation === "orientation_specialiste" && (
        <Card className="p-6 space-y-4" data-testid="card-orientation-specialiste">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="os-specialty">{t("recommendedSpecialtyField")}</Label>
              <Input id="os-specialty" className="glass-input" value={orientationSpecialiste.recommendedSpecialty} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, recommendedSpecialty: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="os-doctor">{t("recommendedDoctorOrFacilityField")}</Label>
              <Input id="os-doctor" className="glass-input" value={orientationSpecialiste.recommendedDoctorOrFacility} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, recommendedDoctorOrFacility: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="os-reason">{t("clinicalReasonField")}</Label>
            <Textarea id="os-reason" className="glass-input" value={orientationSpecialiste.clinicalReason} onChange={(e) => setOrientationSpecialiste((p) => ({ ...p, clinicalReason: e.target.value }))} />
          </div>
          <div>
            <Label>{t("urgencyLevelField")}</Label>
            <RadioGroup value={orientationSpecialiste.urgencyLevel} onValueChange={(value) => setOrientationSpecialiste((p) => ({ ...p, urgencyLevel: value as "routine" | "semi_urgent" | "urgent" }))} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="routine" id="urgency-routine" />
                <Label htmlFor="urgency-routine">{t("urgencyLevelRoutine")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="semi_urgent" id="urgency-semi-urgent" />
                <Label htmlFor="urgency-semi-urgent">{t("urgencyLevelSemiUrgent")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="urgent" id="urgency-urgent" />
                <Label htmlFor="urgency-urgent">{t("urgencyLevelUrgent")}</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="os-letter" checked={orientationSpecialiste.generateReferralLetter} onCheckedChange={(v) => setOrientationSpecialiste((p) => ({ ...p, generateReferralLetter: v === true }))} />
            <Label htmlFor="os-letter">{t("generateReferralLetterField")}</Label>
          </div>
        </Card>
      )}

      {orientation === "transfert_urgent" && (
        <Card className="p-6 space-y-4" data-testid="card-transfert-urgent">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="tu-destination">{t("destinationFacilityField")}</Label>
              <Input id="tu-destination" className="glass-input" value={transfertUrgent.destinationFacility} onChange={(e) => setTransfertUrgent((p) => ({ ...p, destinationFacility: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="tu-vital">{t("vitalUrgencyLevelField")}</Label>
              <Input id="tu-vital" className="glass-input" value={transfertUrgent.vitalUrgencyLevel} onChange={(e) => setTransfertUrgent((p) => ({ ...p, vitalUrgencyLevel: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="tu-reason">{t("medicalReasonField")}</Label>
            <Textarea id="tu-reason" className="glass-input" value={transfertUrgent.medicalReason} onChange={(e) => setTransfertUrgent((p) => ({ ...p, medicalReason: e.target.value }))} />
          </div>
          <div>
            <Label>{t("transportTypeField")}</Label>
            <RadioGroup value={transfertUrgent.transportType} onValueChange={(value) => setTransfertUrgent((p) => ({ ...p, transportType: value as "ambulance_simple" | "ambulance_medicalisee" | "samu_smur" }))} className="flex gap-4 mt-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ambulance_simple" id="transport-simple" />
                <Label htmlFor="transport-simple">{t("transportTypeAmbulanceSimple")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="ambulance_medicalisee" id="transport-medicalisee" />
                <Label htmlFor="transport-medicalisee">{t("transportTypeAmbulanceMedicalisee")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="samu_smur" id="transport-samu" />
                <Label htmlFor="transport-samu">{t("transportTypeSamuSmur")}</Label>
              </div>
            </RadioGroup>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="tu-contacted" checked={transfertUrgent.onCallDoctorContacted} onCheckedChange={(v) => setTransfertUrgent((p) => ({ ...p, onCallDoctorContacted: v === true }))} />
            <Label htmlFor="tu-contacted">{t("onCallDoctorContactedField")}</Label>
          </div>
          <div>
            <Label htmlFor="tu-departure">{t("estimatedDepartureTimeField")}</Label>
            <Input id="tu-departure" className="glass-input" value={transfertUrgent.estimatedDepartureTime} onChange={(e) => setTransfertUrgent((p) => ({ ...p, estimatedDepartureTime: e.target.value }))} />
          </div>
        </Card>
      )}

      {orientation === "autre" && (
        <Card className="p-6 space-y-4" data-testid="card-autre">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="a-type">{t("decisionTypeField")}</Label>
              <Input id="a-type" className="glass-input" value={autre.decisionType} onChange={(e) => setAutre((p) => ({ ...p, decisionType: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="a-frequency">{t("reevaluationFrequencyField")}</Label>
              <Input id="a-frequency" className="glass-input" value={autre.reevaluationFrequency} onChange={(e) => setAutre((p) => ({ ...p, reevaluationFrequency: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="a-description">{t("descriptionField")}</Label>
            <Textarea id="a-description" className="glass-input" value={autre.description} onChange={(e) => setAutre((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="a-followup" checked={autre.followUpNeeded} onCheckedChange={(v) => setAutre((p) => ({ ...p, followUpNeeded: v === true }))} />
            <Label htmlFor="a-followup">{t("followUpNeededField")}</Label>
          </div>
        </Card>
      )}

      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-foreground">{t("autoGeneratedActionsTitle")}</h2>
        <p className="text-sm"><span className="text-muted-foreground">{t("generatedPrescriptionsLabel")}: </span>{prescriptions.length}</p>
        <p className="text-sm"><span className="text-muted-foreground">{t("consultationSummaryLabel")}: </span>{synthese()}</p>
        {(orientation === "orientation_specialiste" || orientation === "transfert_urgent") && (
          <p className="text-sm"><span className="text-muted-foreground">{t("referralLetterLabel")}: </span>{courrier()}</p>
        )}
      </Card>

      <div className="fixed bottom-0 left-0 right-0 md:left-64 bg-background border-t border-border p-4 flex items-center justify-end gap-2">
        <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
          {t("cancel")}
        </Button>
        <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={!orientation || saveMutation.isPending} data-testid="button-save-care-plan">
          {t("saveCarePlanAction")}
          <ArrowRight className="w-4 h-4 ml-2" />
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
git add frontend/src/pages/consultations/plan-prise-en-charge.tsx
git commit -m "feat: add /consultations/:id/plan-prise-en-charge care plan form"
```

---

### Task 10: `/consultations/:id/resume-cloture` — recap, closure confirmation, success

**Files:**
- Create: `frontend/src/pages/consultations/resume-cloture.tsx`

**Interfaces:**
- Consumes: `Consultation`, `Patient`, `LabOrder`, `Prescription` (`@shared/schema`), `PUT /api/consultations/:id` (Task 2), `AlertDialog` (existing `ui/`).
- Produces: the page rendered at `/consultations/:id/resume-cloture` (route added in Task 15).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/consultations/resume-cloture.tsx
import React, { useState } from "react";
import { ArrowLeft, Ban, CheckCircle2, FileText, Folder, Pill } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { Consultation, LabOrder, Patient, Prescription } from "@shared/schema";

const RESOLVED_LAB_ORDER_STATUSES = new Set(["termine", "annule"]);

export default function ResumeCloture() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PUT", `/api/consultations/${consultationId}`, { status: "terminee" }, { collection: "consultations", entityId: consultationId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/consultations/detail", consultationId] });
      toast({ title: t("success"), description: t("consultationClosedSuccessfully") });
      setConfirmOpen(false);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCloseConsultation"), t("networkRequestFailed"));
      setConfirmOpen(false);
    },
  });

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pendingLabOrders = labOrders.filter((o) => !RESOLVED_LAB_ORDER_STATUSES.has(o.status));

  if (consultation.status === "terminee" && consultation.closedAt) {
    return (
      <div className="space-y-6" data-testid="resume-cloture-success">
        <div className="flex flex-col items-center text-center gap-2 py-8">
          <CheckCircle2 className="w-16 h-16 text-primary" />
          <h1 className="text-2xl font-display font-bold text-foreground">{t("closureSuccessTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("closureSuccessSubtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-foreground">{t("resumeClotureTitle")}</h2>
            <p className="text-sm"><span className="text-muted-foreground">{t("patients")}: </span>{patient.firstName} {patient.lastName}</p>
            <p className="text-sm"><span className="text-muted-foreground">{t("specialtyField")}: </span>{consultation.specialty}</p>
          </Card>
          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-foreground">{t("closureSuccessTitle")}</h2>
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="secondary">{t("statusBeforeClosure")}</Badge>
              <span>→</span>
              <Badge>{t("statusAfterClosure")}</Badge>
            </div>
          </Card>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button className="btn-primary" onClick={() => setLocation("/consultations")} data-testid="button-back-to-consultations">
            {t("backToConsultationsAction")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}/dossier-medical`)}>
            <Folder className="w-4 h-4 mr-2" />
            {t("viewPatientRecordAction")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
            <FileText className="w-4 h-4 mr-2" />
            {t("consultationMedicaleTitle")}
          </Button>
          {prescriptions.length > 0 && (
            <Button variant="outline" onClick={() => setLocation(`/pharmacie/${prescriptions[0].id}`)}>
              <Pill className="w-4 h-4 mr-2" />
              {t("prescriptionCardTitle")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="resume-cloture-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/consultation-medicale`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultationMedicaleTitle")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("resumeClotureTitle")} — {consultation.number ?? t("pendingSync")}</h1>
        <p className="text-sm text-muted-foreground">{t("resumeClotureSubtitle")}</p>
      </div>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("patients")}</h2>
        <p className="text-sm text-muted-foreground">{patient.firstName} {patient.lastName}</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("visitReason")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.reason}</p>
      </Card>
      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("diagnosisCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">{consultation.diagnosisPrincipal?.label ?? t("notStartedYet")}</p>
      </Card>
      <Card className="p-6 space-y-2" data-testid="card-resume-exams">
        <h2 className="font-semibold text-foreground">{t("examsCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {labOrders.length === 0 ? t("notStartedYet") : labOrders.map((o) => o.examLines.map((l) => l.examName).join(", ")).join(" · ")}
        </p>
      </Card>
      <Card className="p-6 space-y-2" data-testid="card-resume-prescriptions">
        <h2 className="font-semibold text-foreground">{t("prescriptionCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {prescriptions.length === 0 ? t("notStartedYet") : prescriptions.flatMap((p) => p.lines.map((l) => l.drugName)).join(", ")}
        </p>
      </Card>
      <Card className="p-6 space-y-2" data-testid="card-resume-care-plan">
        <h2 className="font-semibold text-foreground">{t("carePlanCardTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {consultation.carePlan ? t(`carePlanOrientation${consultation.carePlan.orientation.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`) : t("notStartedYet")}
        </p>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogTrigger asChild>
          <Button className="btn-primary" data-testid="button-open-close-confirm">
            <Ban className="w-4 h-4 mr-2" />
            {t("confirmCloseConsultationAction")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("closeConsultationConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingLabOrders.length > 0 && (
                <span className="block mb-2">{pendingLabOrders.length} {t("closeConsultationPendingExamsWarning")}</span>
              )}
              {t("closeConsultationArchiveNotice")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeMutation.mutate()} disabled={closeMutation.isPending} data-testid="button-confirm-close-consultation">
              {t("confirmCloseConsultationAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/consultations/resume-cloture.tsx
git commit -m "feat: add /consultations/:id/resume-cloture summary and closure flow"
```

---

### Task 11: `/consultations/:id/suivi` — post-consultation follow-up dashboard

**Files:**
- Create: `frontend/src/pages/consultations/suivi.tsx`

**Interfaces:**
- Consumes: `Consultation`, `Patient`, `LabOrder`, `Prescription`, `QueueItem` (`@shared/schema`), existing listing endpoints.
- Produces: the page rendered at `/consultations/:id/suivi` (route added in Task 15).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/consultations/suivi.tsx
import React, { useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Folder } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import type { Consultation, LabOrder, Patient, Prescription, QueueItem } from "@shared/schema";

const OPEN_LAB_ORDER_STATUSES = new Set(["demande", "en_cours", "a_valider"]);
const OPEN_PRESCRIPTION_STATUSES = new Set(["en_attente", "prepare"]);

type FollowUpFilter = "all" | "pending" | "done" | "scheduled";

interface FollowUpRow {
  key: string;
  action: string;
  service: string;
  statusLabel: string;
  filterBucket: FollowUpFilter;
  date: string;
  href?: string;
}

export default function Suivi() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: consultationId } = useParams<{ id: string }>();
  const [filter, setFilter] = useState<FollowUpFilter>("all");

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

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
    refetchInterval: 15_000,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?consultationId=${consultationId}`],
    enabled: !!currentTenant?.id && !!consultationId,
    refetchInterval: 15_000,
  });

  const { data: queueItems = [] } = useQuery<QueueItem[]>({
    queryKey: ["/api/queue", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });

  useEffect(() => {
    if (consultation && consultation.closedAt === null) {
      setLocation(`/consultations/${consultationId}/resume-cloture`, { replace: true });
    }
  }, [consultation, consultationId, setLocation]);

  if (!consultation || !patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const rows: FollowUpRow[] = [
    ...labOrders.map((order) => ({
      key: `lab-${order.id}`,
      action: order.examLines.map((l) => l.examName).join(", "),
      service: t("followUpServiceLab"),
      statusLabel: t("labOrderStatus" + order.status[0].toUpperCase() + order.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())),
      filterBucket: (OPEN_LAB_ORDER_STATUSES.has(order.status) ? "pending" : "done") as FollowUpFilter,
      date: new Date(order.updatedAt).toLocaleDateString(),
      href: `/consultations/${consultationId}/suivi/${order.id}`,
    })),
    ...prescriptions.map((prescription) => ({
      key: `rx-${prescription.id}`,
      action: prescription.lines.map((l) => l.drugName).join(", "),
      service: t("followUpServicePharmacy"),
      statusLabel: t("prescriptionStatus" + prescription.status[0].toUpperCase() + prescription.status.slice(1).replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())),
      filterBucket: (OPEN_PRESCRIPTION_STATUSES.has(prescription.status) ? "pending" : "done") as FollowUpFilter,
      date: new Date(prescription.updatedAt).toLocaleDateString(),
      href: `/pharmacie/${prescription.id}`,
    })),
    ...(consultation.carePlan?.orientation === "controle_suivi"
      ? [
          {
            key: "appointment",
            action: consultation.carePlan.followUpReason,
            service: t("followUpServiceAppointment"),
            statusLabel: consultation.carePlan.appointmentDate,
            filterBucket: "scheduled" as FollowUpFilter,
            date: consultation.carePlan.appointmentDate,
          },
        ]
      : []),
  ];

  const filteredRows = filter === "all" ? rows : rows.filter((r) => r.filterBucket === filter);
  const urgentCount = 0;
  const pendingCount = rows.filter((r) => r.filterBucket === "pending").length;
  const completedCount = rows.filter((r) => r.filterBucket === "done").length;

  const queueItem = queueItems.find((item) => item.consultationId === consultationId);
  const timeline = queueItem?.timeline ?? [];

  return (
    <div className="space-y-6" data-testid="suivi-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("consultations")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("suiviTitle")}</h1>
        <p className="text-sm text-muted-foreground">{t("suiviSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <AlertCircle className="w-8 h-8 text-destructive" />
          <div>
            <p className="text-lg font-semibold">{urgentCount} {t("urgentActionsLabel")}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <Clock className="w-8 h-8 text-muted-foreground" />
          <div>
            <p className="text-lg font-semibold">{pendingCount} {t("pendingActionsLabel")}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <CheckCircle2 className="w-8 h-8 text-primary" />
          <div>
            <p className="text-lg font-semibold">{completedCount} {t("completedActionsLabel")}</p>
          </div>
        </Card>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{t("followUpActionsTableTitle")}</h2>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FollowUpFilter)}>
            <TabsList>
              <TabsTrigger value="all">{t("followUpFilterAll")}</TabsTrigger>
              <TabsTrigger value="pending">{t("followUpFilterPending")}</TabsTrigger>
              <TabsTrigger value="done">{t("followUpFilterDone")}</TabsTrigger>
              <TabsTrigger value="scheduled">{t("followUpFilterScheduled")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("examTypesRequested")}</TableHead>
              <TableHead>{t("followUpServiceLab")}/{t("followUpServicePharmacy")}</TableHead>
              <TableHead>{t("statusColumnLabel")}</TableHead>
              <TableHead>{t("dateOfBirth")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.map((row) => (
              <TableRow key={row.key} data-testid={`row-followup-${row.key}`}>
                <TableCell>{row.action}</TableCell>
                <TableCell>{row.service}</TableCell>
                <TableCell><Badge>{row.statusLabel}</Badge></TableCell>
                <TableCell>{row.date}</TableCell>
                <TableCell>
                  {row.href && (
                    <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(row.href!)}>{t("viewLabel")}</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Card className="p-6 space-y-2">
        <h2 className="font-semibold text-foreground">{t("timelineTitle")}</h2>
        <ol className="space-y-2">
          {timeline.map((entry, index) => (
            <li key={index} className="flex items-center gap-2 text-sm">
              <span className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-muted-foreground">{new Date(entry.occurredAt).toLocaleString()}</span>
              <span>{entry.eventType}</span>
            </li>
          ))}
        </ol>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}/dossier-medical`)}>
          <Folder className="w-4 h-4 mr-2" />
          {t("viewPatientRecordAction")}
        </Button>
        <Button variant="outline" onClick={() => setLocation("/consultations")}>
          {t("backToConsultationsAction")}
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
git add frontend/src/pages/consultations/suivi.tsx
git commit -m "feat: add /consultations/:id/suivi post-consultation follow-up dashboard"
```

---

### Task 12: `/consultations/:id/suivi/:labOrderId` — async lab result review

**Files:**
- Create: `frontend/src/pages/consultations/suivi-resultat.tsx`

**Interfaces:**
- Consumes: `LabOrder` (`@shared/schema`), `GET /api/lab-orders/detail/:id`, `PATCH /api/lab-orders/:id/follow-up` (Task 3), `LabOrdersPolicy.canRecordFollowUp` (Task 6).
- Produces: the page rendered at `/consultations/:id/suivi/:labOrderId` (route added in Task 15).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/consultations/suivi-resultat.tsx
import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PolicyGuard } from "@/components/PolicyGuard";
import { LabOrdersPolicy } from "@/lib/policies/labOrders.policy";
import { useTranslation } from "../../lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import type { LabOrder, LabOrderFollowUpAction } from "@shared/schema";

const FOLLOW_UP_ACTIONS: LabOrderFollowUpAction[] = ["aucune_action", "contacter_patient", "modifier_traitement", "programmer_rdv", "nouvel_examen"];

const FOLLOW_UP_ACTION_LABEL_KEYS: Record<LabOrderFollowUpAction, string> = {
  aucune_action: "followUpActionAucuneAction",
  contacter_patient: "followUpActionContacterPatient",
  modifier_traitement: "followUpActionModifierTraitement",
  programmer_rdv: "followUpActionProgrammerRdv",
  nouvel_examen: "followUpActionNouvelExamen",
};

export default function SuiviResultat() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { id: consultationId, labOrderId } = useParams<{ id: string; labOrderId: string }>();

  const [action, setAction] = useState<LabOrderFollowUpAction>("aucune_action");
  const [note, setNote] = useState("");
  const [initialized, setInitialized] = useState(false);

  const { data: labOrder } = useQuery<LabOrder>({
    queryKey: ["/api/lab-orders/detail", labOrderId],
    queryFn: async () => {
      const response = await fetch(`/api/lab-orders/detail/${labOrderId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!labOrderId,
  });

  if (labOrder && !initialized) {
    setAction(labOrder.followUpAction ?? "aucune_action");
    setNote(labOrder.followUpNote ?? "");
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await offlineApiRequest("PATCH", `/api/lab-orders/${labOrderId}/follow-up`, { followUpAction: action, followUpNote: note || undefined }, { collection: "labOrders", entityId: labOrderId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lab-orders/detail", labOrderId] });
      toast({ title: t("success"), description: t("followUpSavedSuccessfully") });
      setLocation(`/consultations/${consultationId}/suivi`);
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToSaveFollowUp"), t("networkRequestFailed"));
    },
  });

  if (!labOrder) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="suivi-resultat-form">
      <Button variant="ghost" onClick={() => setLocation(`/consultations/${consultationId}/suivi`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("suiviTitle")}
      </Button>

      <h1 className="text-2xl font-display font-bold text-foreground">{t("resultDetailTitle")}</h1>

      <Card className="p-6 space-y-2">
        {labOrder.examLines.map((line, index) => (
          <p key={index} className="text-sm">
            <span className="font-medium">{line.examName}: </span>
            <span className="text-muted-foreground">{line.resultText ?? t("notStartedYet")}</span>
          </p>
        ))}
      </Card>

      <PolicyGuard policy={LabOrdersPolicy} action="canRecordFollowUp">
        <Card className="p-6 space-y-4">
          <h2 className="font-semibold text-foreground">{t("actionToTakeTitle")}</h2>
          <RadioGroup value={action} onValueChange={(value) => setAction(value as LabOrderFollowUpAction)} className="space-y-2">
            {FOLLOW_UP_ACTIONS.map((value) => (
              <div key={value} className="flex items-center gap-2">
                <RadioGroupItem value={value} id={`followup-${value}`} data-testid={`radio-followup-${value}`} />
                <Label htmlFor={`followup-${value}`}>{t(FOLLOW_UP_ACTION_LABEL_KEYS[value])}</Label>
              </div>
            ))}
          </RadioGroup>
          <div>
            <Label htmlFor="followup-note">{t("followUpNoteField")}</Label>
            <Textarea id="followup-note" className="glass-input" value={note} onChange={(e) => setNote(e.target.value)} data-testid="textarea-followup-note" />
          </div>
          <div className="flex justify-end">
            <Button className="btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} data-testid="button-validate-followup">
              {t("validateAction")}
            </Button>
          </div>
        </Card>
      </PolicyGuard>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/consultations/suivi-resultat.tsx
git commit -m "feat: add /consultations/:id/suivi/:labOrderId async lab result review"
```

---

### Task 13: `/patients/:id` — add "Historique" tab

**Files:**
- Modify: `frontend/src/pages/patients/show.tsx`

**Interfaces:**
- Consumes: `Consultation`, `LabOrder`, `Prescription` (`@shared/schema`), `GET .../:tenantId?patientId=` (Task 4), `buildPatientTimeline` (Task 7).
- Produces: a `Tabs`-wrapped page with the existing content under "Informations" and a new chronological "Historique" tab.

- [ ] **Step 1: Add imports and state**

Add to the imports in `frontend/src/pages/patients/show.tsx`:

```ts
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { useTenant } from "../../contexts/TenantContext";
import { buildPatientTimeline } from "@/lib/patientTimeline";
import type { Consultation, LabOrder, Prescription } from "@shared/schema";
```

(`Patient` is already imported.) Add inside the component body, alongside the existing hooks:

```ts
  const { currentTenant } = useTenant();
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
```

- [ ] **Step 2: Fetch this patient's cross-consultation data**

Add alongside the existing `patient`/`photoUrl` queries:

```ts
  const { data: patientConsultations = [] } = useQuery<Consultation[]>({
    queryKey: [`/api/consultations/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: patientLabOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: patientPrescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });
```

- [ ] **Step 3: Wrap the existing content in `Tabs`, add the Historique tab**

Replace the final `<div className="grid grid-cols-1 md:grid-cols-3 gap-6">...</div>` block (the two `Card`s under the header) with:

```tsx
      <Tabs defaultValue="informations">
        <TabsList>
          <TabsTrigger value="informations" data-testid="tab-informations">{t("informationsTab")}</TabsTrigger>
          <TabsTrigger value="historique" data-testid="tab-historique">{t("historiqueTab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="informations">
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
        </TabsContent>

        <TabsContent value="historique" className="space-y-4">
          <Card className="p-4 flex flex-wrap items-end gap-4">
            <div>
              <label className="text-sm text-muted-foreground block mb-1">{t("startDateLabel")}</label>
              <Input type="date" value={historyStartDate} onChange={(e) => setHistoryStartDate(e.target.value)} data-testid="input-history-start-date" />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">{t("endDateLabel")}</label>
              <Input type="date" value={historyEndDate} onChange={(e) => setHistoryEndDate(e.target.value)} data-testid="input-history-end-date" />
            </div>
            <Button variant="outline" onClick={() => { setAppliedStartDate(historyStartDate); setAppliedEndDate(historyEndDate); }} data-testid="button-apply-history-filter">
              {t("applyFilterAction")}
            </Button>
            <Button
              variant="ghost"
              onClick={() => { setHistoryStartDate(""); setHistoryEndDate(""); setAppliedStartDate(""); setAppliedEndDate(""); }}
              data-testid="button-reset-history-filter">
              {t("resetFilterAction")}
            </Button>
          </Card>

          <Card className="p-6 space-y-3">
            {(() => {
              const entries = buildPatientTimeline(patientConsultations, patientLabOrders, patientPrescriptions).filter((entry) => {
                if (appliedStartDate && entry.occurredAt < new Date(appliedStartDate)) return false;
                if (appliedEndDate && entry.occurredAt > new Date(`${appliedEndDate}T23:59:59`)) return false;
                return true;
              });
              if (entries.length === 0) return <p className="text-sm text-muted-foreground">{t("noHistoryEvents")}</p>;
              return entries.map((entry, index) => (
                <div key={index} className="flex items-start gap-3 border-b border-border pb-3 last:border-0" data-testid={`history-entry-${index}`}>
                  <Badge variant="secondary">{new Date(entry.occurredAt).toLocaleDateString()}</Badge>
                  <p className="text-sm">
                    {t(
                      {
                        consultation_created: "patientTimelineConsultationCreated",
                        consultation_closed: "patientTimelineConsultationClosed",
                        lab_result: "patientTimelineLabResult",
                        prescription_delivered: "patientTimelinePrescriptionDelivered",
                      }[entry.type]
                    )}{" "}
                    — {entry.detail}
                  </p>
                </div>
              ));
            })()}
          </Card>
        </TabsContent>
      </Tabs>
```

Add `useState` to the existing React import if not already covering it (`show.tsx` already imports `useState` from `useRef, useState` in Step 1 of the original file — no change needed there since `historyStartDate` etc. reuse the already-imported `useState`). Add `useQuery` — already imported from `@tanstack/react-query`.

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/patients/show.tsx
git commit -m "feat: add Historique tab to patient detail page"
```

---

### Task 14: `/patients/:id/dossier-medical` — clinical dossier view

**Files:**
- Create: `frontend/src/pages/patients/dossier-medical.tsx`

**Interfaces:**
- Consumes: `Patient`, `Consultation`, `LabOrder`, `Prescription` (`@shared/schema`), `GET .../:tenantId?patientId=` (Task 4), `buildPatientTimeline` (Task 7).
- Produces: the page rendered at `/patients/:id/dossier-medical` (route added in Task 15).

- [ ] **Step 1: Implement the page**

```tsx
// frontend/src/pages/patients/dossier-medical.tsx
import React, { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { calculateAge } from "@/lib/patientAge";
import type { Consultation, LabOrder, Patient, Prescription } from "@shared/schema";

function buildSparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}

export default function DossierMedical() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const [, setLocation] = useLocation();
  const { id: patientId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState("resume");

  const { data: patient } = useQuery<Patient>({
    queryKey: ["/api/patients/detail", patientId],
    queryFn: async () => {
      const response = await fetch(`/api/patients/detail/${patientId}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!patientId,
  });

  const { data: consultations = [] } = useQuery<Consultation[]>({
    queryKey: [`/api/consultations/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: labOrders = [] } = useQuery<LabOrder[]>({
    queryKey: [`/api/lab-orders/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: [`/api/prescriptions/${currentTenant?.id}?patientId=${patientId}`],
    enabled: !!currentTenant?.id && !!patientId,
  });

  if (!patient) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const sortedConsultations = [...consultations].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const mostRecent = sortedConsultations[0];

  const diagnosisLabels = Array.from(new Set(sortedConsultations.map((c) => c.diagnosisPrincipal?.label).filter((label): label is string => !!label)));

  const treatmentsByDrug = new Map<string, { dosage: string; frequency: string; prescribedAt: string }>();
  for (const prescription of [...prescriptions].sort((a, b) => new Date(a.prescribedAt).getTime() - new Date(b.prescribedAt).getTime())) {
    for (const line of prescription.lines) {
      treatmentsByDrug.set(line.drugName, { dosage: line.dosage, frequency: line.frequency, prescribedAt: prescription.prescribedAt as unknown as string });
    }
  }

  const latestResults = [...labOrders]
    .filter((o) => o.status === "termine")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  const vitalsSeries = sortedConsultations
    .filter((c) => c.vitals?.bloodPressureSystolic != null)
    .slice(0, 6)
    .reverse();
  const systolicValues = vitalsSeries.map((c) => c.vitals!.bloodPressureSystolic!);
  const sparklinePoints = buildSparklinePoints(systolicValues, 320, 80);

  const hospitalisations = sortedConsultations.filter((c) => c.carePlan?.orientation === "hospitalisation");

  return (
    <div className="space-y-6" data-testid="dossier-medical">
      <Button variant="ghost" onClick={() => setLocation(`/patients/${patientId}`)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        {t("patients")}
      </Button>

      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("dossierMedicalTitle")} — {patient.firstName} {patient.lastName}</h1>
        <p className="text-sm text-muted-foreground">{calculateAge(patient.dateOfBirth)} {t("age").toLowerCase()} · {patient.sex}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="resume">{t("clinicalSummaryAutoTitle")}</TabsTrigger>
          <TabsTrigger value="constantes">{t("tabConstantes")}</TabsTrigger>
          <TabsTrigger value="traitements">{t("tabTraitements")}</TabsTrigger>
          <TabsTrigger value="examens">{t("tabExamens")}</TabsTrigger>
          <TabsTrigger value="documents">{t("tabDocuments")}</TabsTrigger>
          <TabsTrigger value="hospitalisations">{t("tabHospitalisations")}</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="space-y-4">
          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-foreground">{t("clinicalSummaryAutoTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {mostRecent
                ? `${mostRecent.specialty} — ${mostRecent.diagnosisPrincipal?.label ?? t("noDataAvailable")}`
                : t("noDataAvailable")}
            </p>
          </Card>

          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-foreground">{t("activeDiagnosesTitle")}</h2>
            {diagnosisLabels.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
            ) : (
              diagnosisLabels.map((label, index) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span>{label}</span>
                  <Badge variant={index === 0 ? "default" : "secondary"}>{index === 0 ? t("diagnosisStatusActive") : t("diagnosisStatusMonitoring")}</Badge>
                </div>
              ))
            )}
          </Card>

          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-foreground">{t("activeTreatmentsTitle")}</h2>
            {treatmentsByDrug.size === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
            ) : (
              Array.from(treatmentsByDrug.entries()).map(([drugName, info]) => (
                <div key={drugName} className="flex items-center justify-between text-sm">
                  <span>{drugName} — {info.dosage} — {info.frequency}</span>
                  <Badge>{t("diagnosisStatusActive")}</Badge>
                </div>
              ))
            )}
          </Card>

          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-foreground">{t("latestResultsTitle")}</h2>
            {latestResults.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
            ) : (
              latestResults.map((order) => (
                <div key={order.id} className="text-sm">
                  {order.examLines.map((l) => l.examName).join(", ")} — {new Date(order.updatedAt).toLocaleDateString()}
                </div>
              ))
            )}
          </Card>

          <Card className="p-6 space-y-2">
            <h2 className="font-semibold text-foreground">{t("vitalsEvolutionTitle")}</h2>
            {systolicValues.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
            ) : (
              <svg viewBox="0 0 320 80" className="w-full h-20" data-testid="svg-vitals-sparkline">
                <polyline points={sparklinePoints} fill="none" stroke="currentColor" strokeWidth="2" className="text-primary" />
              </svg>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="constantes" className="space-y-2">
          {vitalsSeries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
          ) : (
            vitalsSeries.map((c) => (
              <Card key={c.id} className="p-4 text-sm">
                {new Date(c.createdAt).toLocaleDateString()} — TA {c.vitals?.bloodPressureSystolic}/{c.vitals?.bloodPressureDiastolic} · FC {c.vitals?.heartRate}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="traitements" className="space-y-2">
          {treatmentsByDrug.size === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
          ) : (
            Array.from(treatmentsByDrug.entries()).map(([drugName, info]) => (
              <Card key={drugName} className="p-4 text-sm">{drugName} — {info.dosage} — {info.frequency}</Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="examens" className="space-y-2">
          {labOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noDataAvailable")}</p>
          ) : (
            labOrders.map((order) => (
              <Card key={order.id} className="p-4 text-sm">
                {order.examLines.map((l) => l.examName).join(", ")} — {new Date(order.updatedAt).toLocaleDateString()}
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="documents">
          <p className="text-sm text-muted-foreground">{t("availableInFuturePhase")}</p>
        </TabsContent>

        <TabsContent value="hospitalisations" className="space-y-2">
          {hospitalisations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("hospitalisationsEmptyState")}</p>
          ) : (
            hospitalisations.map((c) => (
              <Card key={c.id} className="p-4 text-sm">
                {new Date(c.createdAt).toLocaleDateString()} — {c.carePlan?.orientation === "hospitalisation" ? c.carePlan.targetService : ""}
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 2: Write a unit test for `buildSparklinePoints`**

Create `frontend/src/pages/patients/dossier-medical.spec.ts` is not the convention here (page files stay untested per Global Constraints) — instead extract `buildSparklinePoints` before writing its test, since it's pure math worth covering directly:

Move the `buildSparklinePoints` function out of `dossier-medical.tsx` into `frontend/src/lib/sparkline.ts`:

```ts
// frontend/src/lib/sparkline.ts
export function buildSparklinePoints(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
}
```

```ts
// frontend/src/lib/sparkline.spec.ts
import { describe, expect, it } from "vitest";
import { buildSparklinePoints } from "./sparkline";

describe("buildSparklinePoints", () => {
  it("returns an empty string for no values", () => {
    expect(buildSparklinePoints([], 100, 50)).toBe("");
  });

  it("places a single value at x=0, vertically centered when it equals both min and max", () => {
    expect(buildSparklinePoints([120], 100, 50)).toBe("0,25");
  });

  it("scales the lowest value to the bottom and the highest to the top", () => {
    const points = buildSparklinePoints([100, 140], 100, 50);
    expect(points).toBe("0,50 100,0");
  });
});
```

Run: `cd frontend && npx vitest run src/lib/sparkline.spec.ts`
Expected: PASS once the file exists (this is written directly rather than red-green here since it's a 6-line pure function with obvious behavior — still fully covered).

Remove the inline `buildSparklinePoints` function from `dossier-medical.tsx` and replace it with:

```ts
import { buildSparklinePoints } from "@/lib/sparkline";
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/patients/dossier-medical.tsx frontend/src/lib/sparkline.ts frontend/src/lib/sparkline.spec.ts
git commit -m "feat: add /patients/:id/dossier-medical clinical dossier view"
```

---

### Task 15: Routes registration

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `PlanPriseEnCharge` (Task 9), `ResumeCloture` (Task 10), `Suivi` (Task 11), `SuiviResultat` (Task 12), `DossierMedical` (Task 14).
- Produces: `/consultations/:id/plan-prise-en-charge`, `/consultations/:id/resume-cloture`, `/consultations/:id/suivi`, `/consultations/:id/suivi/:labOrderId`, `/patients/:id/dossier-medical` routes.

- [ ] **Step 1: Register the lazy imports**

Add after the `ConsultationMedicaleForm` import and before the `LaboratoireIndex` import:

```ts
const PlanPriseEnCharge = lazy(() => import("./pages/consultations/plan-prise-en-charge"));
const ResumeCloture = lazy(() => import("./pages/consultations/resume-cloture"));
const Suivi = lazy(() => import("./pages/consultations/suivi"));
const SuiviResultat = lazy(() => import("./pages/consultations/suivi-resultat"));
```

Add after the `PatientDetails` import:

```ts
const DossierMedical = lazy(() => import("./pages/patients/dossier-medical"));
```

- [ ] **Step 2: Add the patient route**

Insert between `/patients/:id/edit` and `/patients/:id` (before the bare `:id` route, per the ordering rule in Global Constraints):

```tsx
        <Route path="/patients/:id/dossier-medical">
          <ProtectedRoute>
            <Layout>
              <DossierMedical />
            </Layout>
          </ProtectedRoute>
        </Route>
```

- [ ] **Step 3: Add the consultation routes**

Insert between `/consultations/:id/consultation-medicale` and the bare `/consultations/:id`:

```tsx
        <Route path="/consultations/:id/plan-prise-en-charge">
          <ProtectedRoute>
            <Layout>
              <PlanPriseEnCharge />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/resume-cloture">
          <ProtectedRoute>
            <Layout>
              <ResumeCloture />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/suivi">
          <ProtectedRoute>
            <Layout>
              <Suivi />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/consultations/:id/suivi/:labOrderId">
          <ProtectedRoute>
            <Layout>
              <SuiviResultat />
            </Layout>
          </ProtectedRoute>
        </Route>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire Phase 4 routes"
```

---

### Task 16: Wire `consultation-medicale.tsx`'s care-plan card and closure button

**Files:**
- Modify: `frontend/src/pages/consultations/consultation-medicale.tsx`

**Interfaces:**
- Consumes: `Consultation.carePlan` (Task 1).
- Produces: a new "Plan de prise en charge" card after `card-prescriptions`; `button-close-consultation` navigates instead of staying `disabled`.

- [ ] **Step 1: Add the care-plan card**

Insert a new `Card` right after the closing `</Card>` of `card-prescriptions` (i.e., right before the `<div className="fixed bottom-0 ...">` bottom action bar):

```tsx
      <Card className="p-6 space-y-2" data-testid="card-care-plan">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">{t("carePlanCardTitle")}</h2>
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setLocation(`/consultations/${consultationId}/plan-prise-en-charge`)}
            data-testid="button-edit-care-plan">
            {consultation.carePlan ? t("modifyLabel") : t("defineCarePlanAction")}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {consultation.carePlan
            ? t(`carePlanOrientation${consultation.carePlan.orientation.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`)
            : t("notStartedYet")}
        </p>
      </Card>
```

- [ ] **Step 2: Activate the close-consultation button**

Replace:

```tsx
        <Button variant="outline" disabled data-testid="button-close-consultation">{t("closeConsultationAction")}</Button>
```

with:

```tsx
        <Button variant="outline" onClick={() => setLocation(`/consultations/${consultationId}/resume-cloture`)} data-testid="button-close-consultation">
          {t("closeConsultationAction")}
        </Button>
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/consultations/consultation-medicale.tsx
git commit -m "feat: wire care plan card and closure navigation into consultation-medicale"
```

---

### Task 17: Wire the consultation hub's care-plan card and history link

**Files:**
- Modify: `frontend/src/pages/consultations/show.tsx`

**Interfaces:**
- Consumes: `Consultation.carePlan`/`closedAt` (Task 1), `computeConsultationJourney` (Task 5, real `carePlan`/`closure` derivation now).
- Produces: the hub's `card-hub-care-plan` shows real content; `currentStepAction()` gets real navigation for the `carePlan`/`closure` steps instead of the `availableInFuturePhase` badge; a new "Dossier médical" link is added to the bottom action bar.

- [ ] **Step 1: Replace the inert care-plan card**

Replace:

```tsx
          <Card className="p-4 space-y-1 opacity-60" data-testid="card-hub-care-plan">
            <span className="text-sm font-medium">{t("carePlanCardTitle")}</span>
            <p className="text-sm text-muted-foreground">{t("notStartedYet")}</p>
          </Card>
```

with:

```tsx
          <Card className="p-4 space-y-1" data-testid="card-hub-care-plan">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t("carePlanCardTitle")}</span>
              <PolicyGuard policy={ConsultationsPolicy} action="canUpdate">
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setLocation(`/consultations/${consultationId}/plan-prise-en-charge`)}>{t("modifyLabel")}</Button>
              </PolicyGuard>
            </div>
            <p className="text-sm text-muted-foreground">
              {consultation.carePlan
                ? t(`carePlanOrientation${consultation.carePlan.orientation.replace(/(^|_)([a-z])/g, (_, __, c: string) => c.toUpperCase())}`)
                : t("notStartedYet")}
            </p>
          </Card>
```

- [ ] **Step 2: Give `currentStepAction()` real cases for `carePlan`/`closure`**

Replace the `default:` branch of `currentStepAction()`'s `switch` (currently the only handler for these two keys) with explicit cases, keeping `default` for any truly unhandled key:

```tsx
      case "carePlan":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/plan-prise-en-charge`)} data-testid="button-hub-continue-care-plan">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      case "closure":
        return (
          <Button className="btn-primary" onClick={() => setLocation(`/consultations/${consultationId}/resume-cloture`)} data-testid="button-hub-continue-closure">
            {t("continueToStep")}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        );
      default:
        return <Badge variant="secondary">{t("availableInFuturePhase")}</Badge>;
```

- [ ] **Step 3: Add a "Dossier médical" link to the bottom action bar**

Replace:

```tsx
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}`)} data-testid="button-patient-history">
            <User className="w-4 h-4 mr-2" />
            {t("patientHistory")}
          </Button>
```

with:

```tsx
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}`)} data-testid="button-patient-history">
            <User className="w-4 h-4 mr-2" />
            {t("patientHistory")}
          </Button>
          <Button variant="outline" onClick={() => setLocation(`/patients/${consultation.patientId}/dossier-medical`)} data-testid="button-view-dossier-medical">
            {t("viewDossierMedicalAction")}
          </Button>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/consultations/show.tsx
git commit -m "feat: wire care plan and closure into the consultation hub"
```

---

## Final verification

- [ ] Run the full backend suite: `cd backend && npx jest`
- [ ] Run the full frontend suite: `cd frontend && npx vitest run`
- [ ] Run both typechecks: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
- [ ] Manually exercise the golden path in the running app, as a `medecin`: open a closed-loop consultation on `consultation-medicale`, click "Définir le plan de prise en charge", pick each of the 6 orientations in turn and confirm the right fields appear, save one (e.g. "Contrôle / Rendez-vous de suivi"); confirm the hub's step 8 now shows completed and the care-plan card reflects the choice; go to "Clôturer la consultation", confirm the AlertDialog shows the pending-exam warning if any `LabOrder` is unresolved, confirm; confirm the success screen appears and the hub's step 9 shows completed; open `/consultations/:id/suivi` and confirm the appointment row from the `controle_suivi` plan appears in the table; open a lab order's `/consultations/:id/suivi/:labOrderId`, record a follow-up action, confirm it saves; open `/patients/:id`, confirm the new "Historique" tab lists the consultation/lab/prescription events and the date filter narrows them; open `/patients/:id/dossier-medical` and confirm the summary, diagnoses, treatments, results, and vitals sparkline render from real data.
