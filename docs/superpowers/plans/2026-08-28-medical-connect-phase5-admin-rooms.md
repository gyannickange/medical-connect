# Medical Connect — Phase 5: Salles, Admin Socle, Fermeture Faille /register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Rooms ("Salles") module from scratch, extend the already-shipped Staff/Audit modules with the missing pieces the Figma mockups call for, and close a real, exploitable authentication hole in `/api/auth/register`.

**Architecture:** CouchDB documents only (no Drizzle/Postgres), following the exact repository/controller/policy shape used by every prior module (`patients`, `consultations`, `staff`). `Room` is a brand-new per-tenant CouchDB document type. The audit log is already globally instrumented via `AuditInterceptor` (`APP_INTERCEPTOR`) — this phase extends its `entityMap` and adds read-time patient-name resolution, it does **not** add any new per-service audit wiring. `Consultation.roomId` (already a free `string | null`) starts pointing at real `Room` ids without any migration of historical data.

**Tech Stack:** NestJS (Fastify), CouchDB via `nano` (`CouchDBService`), `class-validator` DTOs, Jest (`*.spec.ts`, backend). React + Vite + TypeScript + Wouter, `@tanstack/react-query`, `react-hook-form` + zod, shadcn `components/ui/*`, Vitest (`*.test.ts`, frontend — different extension than backend, see Task 3).

**Spec:** `docs/superpowers/specs/2026-08-28-medical-connect-phase5-admin-rooms-design.md`

## Global Constraints

- Never change the meaning/type/required-ness of an existing shipped route or DTO field. Every schema/DTO change in this plan is a new **optional** field, except the deliberate, spec-approved authorization tightening of `POST /api/auth/register` (Task 10).
- CouchDB only — no Postgres/Drizzle for anything in this plan.
- Tenant scoping: every new controller method derives `tenantId` from `req.user.tenantId` (never trusts a client-supplied `tenantId` without cross-checking), mirroring `patients.controller.ts`'s `private tenantId(req, legacyTenantId?)` helper — per CLAUDE.md's guidance to prefer this over unscoped lookups on new endpoints.
- No `@testing-library/react`/jsdom anywhere. Backend logic is unit-tested with plain `new X(mockedDep as any)` construction (no `@nestjs/testing`). Frontend pages stay thin and untested except pure extracted functions.
- Backend test files: `*.spec.ts` (Jest, `testRegex: ".*\\.spec\\.ts$"`). Frontend test files: `*.test.ts` (Vitest, `include: ["src/**/*.test.ts"]`) — a `.spec.ts` file under `frontend/src` is silently never run. This plan has no frontend pure-function extraction in Phase 5 (no new frontend `.test.ts` files), only backend `.spec.ts` files.
- Every new user-visible string goes through `t("key")`, added to **both** `en` and `fr` in the relevant `frontend/src/lib/i18n/*.ts` section file (`i18nCompleteness.test.ts` enforces this).
- `Room` types must be added to **both** `backend/src/shared/schema.ts` and `frontend/shared/schema.ts` (the two are hand-duplicated, not a mirror/symlink) — frontend copy uses `string` for date-like fields, matching that file's existing convention, not `Date`.
- Never run `git commit` without the user's explicit go-ahead — this plan's steps show `git commit` commands for structure/reference, but hold off on actually running them until the user says to (per this project's CLAUDE.md and the subagent-driven-development skill's task-level commit skip).

---

### Task 1: Add `Room`/`InsertRoom`/`RoomStatus` types to both schema files

**Files:**
- Modify: `backend/src/shared/schema.ts:68-69` (insert new types just above `Consultation`, since `Consultation.roomId` will reference `Room.id`)
- Modify: `frontend/shared/schema.ts:67-68` (mirror, `string` dates)
- Test: none (pure type declarations; correctness is verified by the TypeScript compiler in later tasks that consume these types)

**Interfaces:**
- Produces: `Room`, `InsertRoom`, `RoomStatus` (backend, `Date` fields) and the same three names (frontend, `string` fields) — every later backend task imports `Room`/`InsertRoom`/`RoomStatus` from `@shared/schema`; frontend Room pages import the frontend versions the same way.

- [ ] **Step 1: Add the backend types**

In `backend/src/shared/schema.ts`, insert immediately before the existing line `export interface Consultation { ... }` (currently line 68):

```ts
export type RoomStatus = "disponible" | "en_maintenance";
export type RoomEffectiveStatus = "occupee" | "reservee" | "disponible" | "en_maintenance";

export interface Room { id: string; tenantId: string; number: string; type: string; floor: string | null; capacity: number; equipment: string[]; notes: string | null; status: RoomStatus; createdAt: Date; updatedAt: Date }
export interface InsertRoom { id?: string; number: string; type: string; floor?: string | null; capacity: number; equipment?: string[]; notes?: string | null; status?: RoomStatus; tenantId: string }

```

`RoomEffectiveStatus` lives here (not in `room-status.ts`) because both the backend pure function (Task 3) and the frontend pages (Task 13) need it, and only `@shared/schema` is importable from both sides.

Then, near the bottom of the file where the other `insertXSchema` zod objects live (right after `export const insertConsultationSchema = ...`), add:

```ts
export const insertRoomSchema = z.object({ id, number: z.string().min(1), type: z.string().min(1), floor: nullableString, capacity: z.number().int().min(1), equipment: z.array(z.string()).optional(), notes: nullableString, status: z.enum(["disponible", "en_maintenance"]).optional(), tenantId: z.string() });
```

- [ ] **Step 2: Add the frontend mirror**

In `frontend/shared/schema.ts`, insert immediately before the existing line `export interface Consultation { ... }` (currently line 67):

```ts
export type RoomStatus = "disponible" | "en_maintenance";
export type RoomEffectiveStatus = "occupee" | "reservee" | "disponible" | "en_maintenance";

export interface Room { id: string; tenantId: string; number: string; type: string; floor: string | null; capacity: number; equipment: string[]; notes: string | null; status: RoomStatus; createdAt: string; updatedAt: string }
export interface InsertRoom { id?: string; number: string; type: string; floor?: string | null; capacity: number; equipment?: string[]; notes?: string | null; status?: RoomStatus; tenantId: string }

```

Then, next to the existing `insertConsultationSchema` (line 227), add the identical zod schema shown in Step 1.

- [ ] **Step 3: Typecheck both packages**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: PASS (no consumers reference `Room` yet, so this only validates the new declarations parse and `nullableString`/`id` zod helpers are in scope — they already are, reused from the existing file).

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add Room type to backend and frontend schema"
```

---

### Task 2: `RoomsRepository` (CouchDB CRUD)

**Files:**
- Create: `backend/src/modules/rooms/rooms.repository.ts`
- Test: `backend/src/modules/rooms/rooms.repository.spec.ts`

**Interfaces:**
- Consumes: `Room`/`InsertRoom` (Task 1), `CouchDBService` (existing, `backend/src/database/couchdb.service.ts`), `couchDocumentId`/`publicDocumentId`/`tenantDatabaseName` (existing, `backend/src/database/couchdb-naming.ts`).
- Produces: `RoomsRepository` with `create(data: InsertRoom): Promise<Room>`, `update(id: string, tenantId: string, data: Partial<InsertRoom>): Promise<Room>`, `findById(id: string, tenantId: string): Promise<Room>`, `findByTenant(tenantId: string): Promise<Room[]>` — consumed by Task 6 (`RoomsService`).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/rooms/rooms.repository.spec.ts`:

```ts
import { NotFoundException } from "@nestjs/common";
import { RoomsRepository } from "./rooms.repository";

describe("RoomsRepository", () => {
  describe("create", () => {
    it("creates a room document with default status disponible", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new RoomsRepository(couchDBService as any);

      const result = await repository.create({
        number: "101",
        type: "Cardiologie",
        capacity: 2,
        tenantId: "tenant-1",
      } as any);

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "room",
          tenantId: "tenant-1",
          number: "101",
          roomType: undefined,
        })
      );
      expect(result.status).toBe("disponible");
      expect(result.equipment).toEqual([]);
    });
  });

  describe("update", () => {
    function existingRoom(overrides: Record<string, unknown> = {}) {
      return {
        _id: "room:room-1",
        _rev: "2-a",
        id: "room-1",
        type: "room",
        number: "101",
        roomType: "Cardiologie",
        floor: null,
        capacity: 2,
        equipment: [],
        notes: null,
        status: "disponible",
        tenantId: "tenant-1",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        ...overrides,
      };
    }

    it("patches the stored status", async () => {
      const db = {
        get: jest.fn().mockResolvedValue(existingRoom()),
        insert: jest.fn().mockResolvedValue({ ok: true }),
      };
      const repository = new RoomsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      const result = await repository.update("room-1", "tenant-1", { status: "en_maintenance" });

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ status: "en_maintenance" }));
      expect(result.status).toBe("en_maintenance");
    });

    it("throws NotFoundException when the room does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new RoomsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.update("missing", "tenant-1", { status: "disponible" })).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the room belongs to a different tenant", async () => {
      const db = { get: jest.fn().mockResolvedValue(existingRoom({ tenantId: "tenant-2" })) };
      const repository = new RoomsRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

      await expect(repository.update("room-1", "tenant-1", { status: "disponible" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("queries rooms by tenant sorted by number", async () => {
      const docs = [{ _id: "room:room-1", type: "room", number: "101", tenantId: "tenant-1", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z" }];
      const db = { find: jest.fn().mockResolvedValue({ docs }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new RoomsRepository(couchDBService as any);

      const result = await repository.findByTenant("tenant-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: { type: "room", tenantId: "tenant-1" }, sort: [{ number: "asc" }] })
      );
      expect(result[0].id).toBe("room-1");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest rooms.repository.spec.ts`
Expected: FAIL — `Cannot find module './rooms.repository'`.

- [ ] **Step 3: Implement `RoomsRepository`**

Create `backend/src/modules/rooms/rooms.repository.ts`:

```ts
import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { InsertRoom, Room } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class RoomsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(data: InsertRoom): Promise<Room> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const room: Room = {
      id,
      tenantId: data.tenantId,
      number: data.number,
      type: data.type,
      floor: data.floor ?? null,
      capacity: data.capacity,
      equipment: data.equipment ?? [],
      notes: data.notes ?? null,
      status: data.status ?? "disponible",
      createdAt: now,
      updatedAt: now,
    };

    try {
      await db.insert({ ...this.toDocument(room), _id: couchDocumentId("room", id) } as any);
      return room;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async update(id: string, tenantId: string, data: Partial<InsertRoom>): Promise<Room> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "room" || current.tenantId !== tenantId) {
      throw new NotFoundException("Room not found");
    }

    const updated = {
      ...current,
      ...data,
      _id: current._id,
      _rev: current._rev,
      id,
      type: "room" as const,
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

  async findById(id: string, tenantId: string): Promise<Room> {
    const db = await this.database(tenantId);
    const doc = await this.findExisting(db, id);
    if (!doc || doc.type !== "room" || doc.tenantId !== tenantId) {
      throw new NotFoundException("Room not found");
    }
    return this.hydrate(doc);
  }

  async findByTenant(tenantId: string): Promise<Room[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "rooms_by_tenant_number", ["tenantId", "type", "number"]);
    const result = await db.find({ selector: { type: "room", tenantId }, sort: [{ number: "asc" }], limit: 200 });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("room", id))) as unknown as Record<string, any>;
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

  private hydrate(doc: Record<string, any>): Room {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "room"),
      createdAt: new Date(doc.createdAt),
      updatedAt: new Date(doc.updatedAt),
    } as Room;
  }

  private toDocument(room: Room) {
    return { ...room, type: "room" as const, createdAt: room.createdAt.toISOString(), updatedAt: room.updatedAt.toISOString() };
  }
}
```

Note: the first test's `roomType: undefined` assertion is intentionally checking a field that does NOT exist on the document (the field is named `type` for the entity's own discriminator, and `type` for the CouchDB doc-type discriminator — both are literally `"room"`/`"room"`, there is no separate `roomType` field). Fix the test instead of the implementation — replace that line with `type: "room"` (the assertion was testing the CouchDB doc-type discriminator, already covered by `type: "room"` in the same `objectContaining`). Remove the stray `roomType: undefined` line from the test written in Step 1 before running.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest rooms.repository.spec.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/rooms/rooms.repository.ts backend/src/modules/rooms/rooms.repository.spec.ts
git commit -m "feat: add RoomsRepository"
```

---

### Task 3: `computeRoomStatus`/`deriveRoomHistory` pure functions

**Files:**
- Create: `backend/src/modules/rooms/room-status.ts`
- Test: `backend/src/modules/rooms/room-status.spec.ts`

**Interfaces:**
- Consumes: `Room`, `RoomEffectiveStatus` (Task 1), `Consultation`/`ConsultationStatus` (existing, `@shared/schema`).
- Produces: `RoomStatusResult { effectiveStatus: RoomEffectiveStatus; currentConsultation: Consultation | null; upcomingConsultations: Consultation[] }`, `computeRoomStatus(room: Room, roomConsultations: Consultation[], now: Date): RoomStatusResult`, `deriveRoomHistory(roomConsultations: Consultation[], limit: number): Consultation[]` — both consumed by Task 6 (`RoomsService`) and Task 13 (frontend pages import `RoomEffectiveStatus` from `@shared/schema` directly, not from this file).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/rooms/room-status.spec.ts`:

```ts
import { computeRoomStatus, deriveRoomHistory } from "./room-status";
import type { Consultation, Room } from "@shared/schema";

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    tenantId: "tenant-1",
    number: "101",
    type: "Cardiologie",
    floor: null,
    capacity: 2,
    equipment: [],
    notes: null,
    status: "disponible",
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    ...overrides,
  };
}

function consultation(overrides: Partial<Consultation> = {}): Consultation {
  return {
    id: "c-1",
    tenantId: "tenant-1",
    number: "C-2026-0001",
    patientId: "patient-1",
    scheduledAt: new Date("2026-08-28T09:00:00.000Z"),
    specialty: "Cardiologie",
    assignedDoctorId: "doctor-1",
    roomId: "room-1",
    priority: "normal",
    reason: "Suivi",
    nurseNotes: null,
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
    carePlan: null,
    carePlanSavedAt: null,
    closedAt: null,
    status: "planifiee",
    createdAt: new Date("2026-08-01"),
    updatedAt: new Date("2026-08-01"),
    ...overrides,
  };
}

const now = new Date("2026-08-28T08:00:00.000Z");

describe("computeRoomStatus", () => {
  it("returns occupee when a consultation in this room is en_cours", () => {
    const inProgress = consultation({ status: "en_cours" });
    const result = computeRoomStatus(room(), [inProgress], now);
    expect(result.effectiveStatus).toBe("occupee");
    expect(result.currentConsultation).toBe(inProgress);
  });

  it("occupee wins even when the room is stored as en_maintenance", () => {
    const inProgress = consultation({ status: "en_cours" });
    const result = computeRoomStatus(room({ status: "en_maintenance" }), [inProgress], now);
    expect(result.effectiveStatus).toBe("occupee");
  });

  it("returns en_maintenance when stored status is en_maintenance and no consultation is in progress", () => {
    const result = computeRoomStatus(room({ status: "en_maintenance" }), [], now);
    expect(result.effectiveStatus).toBe("en_maintenance");
  });

  it("en_maintenance wins over a future reservation today", () => {
    const upcoming = consultation({ status: "planifiee", scheduledAt: new Date("2026-08-28T14:00:00.000Z") });
    const result = computeRoomStatus(room({ status: "en_maintenance" }), [upcoming], now);
    expect(result.effectiveStatus).toBe("en_maintenance");
  });

  it("returns reservee when a planifiee/en_attente consultation is scheduled later today", () => {
    const upcoming = consultation({ status: "en_attente", scheduledAt: new Date("2026-08-28T14:00:00.000Z") });
    const result = computeRoomStatus(room(), [upcoming], now);
    expect(result.effectiveStatus).toBe("reservee");
    expect(result.upcomingConsultations).toEqual([upcoming]);
  });

  it("ignores a scheduled consultation from a different day", () => {
    const tomorrow = consultation({ status: "planifiee", scheduledAt: new Date("2026-08-29T09:00:00.000Z") });
    const result = computeRoomStatus(room(), [tomorrow], now);
    expect(result.effectiveStatus).toBe("disponible");
  });

  it("returns disponible when there is nothing relevant", () => {
    const result = computeRoomStatus(room(), [], now);
    expect(result.effectiveStatus).toBe("disponible");
  });
});

describe("deriveRoomHistory", () => {
  it("returns only terminee consultations, most recent first, limited", () => {
    const oldest = consultation({ id: "c-old", status: "terminee", scheduledAt: new Date("2026-08-01T09:00:00.000Z") });
    const newest = consultation({ id: "c-new", status: "terminee", scheduledAt: new Date("2026-08-20T09:00:00.000Z") });
    const stillPlanned = consultation({ id: "c-planned", status: "planifiee" });

    const result = deriveRoomHistory([oldest, newest, stillPlanned], 5);

    expect(result.map((c) => c.id)).toEqual(["c-new", "c-old"]);
  });

  it("respects the limit", () => {
    const consultations = [1, 2, 3].map((n) =>
      consultation({ id: `c-${n}`, status: "terminee", scheduledAt: new Date(`2026-08-0${n}T09:00:00.000Z`) })
    );
    expect(deriveRoomHistory(consultations, 2)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest room-status.spec.ts`
Expected: FAIL — `Cannot find module './room-status'`.

- [ ] **Step 3: Implement `room-status.ts`**

Create `backend/src/modules/rooms/room-status.ts`:

```ts
import type { Consultation, Room, RoomEffectiveStatus } from "@shared/schema";

export interface RoomStatusResult {
  effectiveStatus: RoomEffectiveStatus;
  currentConsultation: Consultation | null;
  upcomingConsultations: Consultation[];
}

export function computeRoomStatus(room: Room, roomConsultations: Consultation[], now: Date): RoomStatusResult {
  const current = roomConsultations.find((c) => c.status === "en_cours") ?? null;
  if (current) {
    return { effectiveStatus: "occupee", currentConsultation: current, upcomingConsultations: [] };
  }

  if (room.status === "en_maintenance") {
    return { effectiveStatus: "en_maintenance", currentConsultation: null, upcomingConsultations: [] };
  }

  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const upcoming = roomConsultations
    .filter(
      (c) =>
        (c.status === "planifiee" || c.status === "en_attente") &&
        c.scheduledAt >= dayStart &&
        c.scheduledAt <= dayEnd
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());

  if (upcoming.length > 0) {
    return { effectiveStatus: "reservee", currentConsultation: null, upcomingConsultations: upcoming };
  }

  return { effectiveStatus: "disponible", currentConsultation: null, upcomingConsultations: [] };
}

export function deriveRoomHistory(roomConsultations: Consultation[], limit: number): Consultation[] {
  return roomConsultations
    .filter((c) => c.status === "terminee")
    .sort((a, b) => b.scheduledAt.getTime() - a.scheduledAt.getTime())
    .slice(0, limit);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest room-status.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/rooms/room-status.ts backend/src/modules/rooms/room-status.spec.ts
git commit -m "feat: add pure room-status derivation functions"
```

---

### Task 4: Add `roomId` filter to `ConsultationsRepository.findByTenant`

**Files:**
- Modify: `backend/src/modules/consultations/consultations.repository.ts:11-16` (interface), `:126-139` (`findByTenant`)
- Test: create `backend/src/modules/consultations/consultations.repository.spec.ts` if it does not already exist (it doesn't — verified during research), otherwise add to it.

**Interfaces:**
- Produces: `ConsultationFilters.roomId?: string` — consumed by Task 6 (`RoomsService.findById`, which needs only one room's consultations).

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/consultations/consultations.repository.spec.ts`:

```ts
import { ConsultationsRepository } from "./consultations.repository";

describe("ConsultationsRepository", () => {
  describe("findByTenant", () => {
    it("filters by roomId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, {} as any);

      await repository.findByTenant("tenant-1", { roomId: "room-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ roomId: "room-1" }) })
      );
    });

    it("omits the roomId selector when not provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new ConsultationsRepository(couchDBService as any, { next: jest.fn() } as any, {} as any);

      await repository.findByTenant("tenant-1", {});

      const call = db.find.mock.calls[0][0];
      expect(call.selector.roomId).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest consultations.repository.spec.ts`
Expected: FAIL — `expect(received).toEqual(expected)` on the `roomId` selector assertion (the filter isn't applied yet).

- [ ] **Step 3: Add the filter**

In `backend/src/modules/consultations/consultations.repository.ts`, change the `ConsultationFilters` interface (currently lines 11-16):

```ts
export interface ConsultationFilters {
  specialty?: string;
  assignedDoctorId?: string;
  scheduledOnOrAfter?: string;
  patientId?: string;
  roomId?: string;
}
```

And inside `findByTenant` (currently lines 126-139), add one line to the filter-application block, right after `if (filters?.patientId) selector.patientId = filters.patientId;`:

```ts
    if (filters?.patientId) selector.patientId = filters.patientId;
    if (filters?.roomId) selector.roomId = filters.roomId;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest consultations.repository.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/consultations/consultations.repository.ts backend/src/modules/consultations/consultations.repository.spec.ts
git commit -m "feat: add roomId filter to ConsultationsRepository.findByTenant"
```

---

### Task 5: `RoomsPolicy`

**Files:**
- Create: `backend/src/modules/rooms/rooms.policy.ts`
- Test: `backend/src/modules/rooms/rooms.policy.spec.ts`

**Interfaces:**
- Consumes: `BasePolicy` (existing, `backend/src/modules/auth/policies/base.policy.ts`).
- Produces: `RoomsPolicy` with `view(): boolean`, `create(): boolean`, `update(): boolean` — consumed by Task 7 (`RoomsController`'s `@CheckPolicy` decorators).

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/rooms/rooms.policy.spec.ts` (mirrors the exact construction idiom used by `consultations.policy.spec.ts`):

```ts
import { RoomsPolicy } from "./rooms.policy";

function policyFor(role: string): RoomsPolicy {
  const policy = new RoomsPolicy();
  policy.setUser({ id: "u1", username: "x", tenantId: "t1", role } as any);
  return policy;
}

describe("RoomsPolicy", () => {
  it.each(["admin", "manager", "medecin", "infirmier", "accueil"])("%s can view", (role) => {
    expect(policyFor(role).view()).toBe(true);
  });

  it.each(["laboratoire", "pharmacien", "cashier"])("%s cannot view", (role) => {
    expect(policyFor(role).view()).toBe(false);
  });

  it.each(["admin", "manager"])("%s can create", (role) => {
    expect(policyFor(role).create()).toBe(true);
  });

  it.each(["medecin", "infirmier", "accueil", "laboratoire", "pharmacien", "cashier"])("%s cannot create", (role) => {
    expect(policyFor(role).create()).toBe(false);
  });

  it.each(["admin", "manager"])("%s can update", (role) => {
    expect(policyFor(role).update()).toBe(true);
  });

  it.each(["medecin", "infirmier", "accueil"])("%s cannot update", (role) => {
    expect(policyFor(role).update()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest rooms.policy.spec.ts`
Expected: FAIL — `Cannot find module './rooms.policy'`.

- [ ] **Step 3: Implement `RoomsPolicy`**

Create `backend/src/modules/rooms/rooms.policy.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class RoomsPolicy extends BasePolicy {
  view(): boolean {
    return this.hasAnyRole("admin", "manager", "medecin", "infirmier", "accueil");
  }

  create(): boolean {
    return this.isAdminOrManager();
  }

  update(): boolean {
    return this.isAdminOrManager();
  }
}
```

Note: `hasAnyRole` is `protected` on `BasePolicy`, callable from the subclass directly (same access pattern used implicitly by `isAdminOrManager()` itself, which calls `this.hasAnyRole("admin", "manager")` internally).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest rooms.policy.spec.ts`
Expected: PASS (14 assertions across the `it.each` blocks).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/rooms/rooms.policy.ts backend/src/modules/rooms/rooms.policy.spec.ts
git commit -m "feat: add RoomsPolicy"
```

---

### Task 6: `RoomsService` (list/detail with computed status)

**Files:**
- Create: `backend/src/modules/rooms/rooms.service.ts`
- Test: `backend/src/modules/rooms/rooms.service.spec.ts`

**Interfaces:**
- Consumes: `RoomsRepository` (Task 2), `ConsultationsRepository` (existing + Task 4's `roomId` filter), `computeRoomStatus`/`deriveRoomHistory` (Task 3).
- Produces: `RoomWithStatus = Room & RoomStatusResult`, `RoomDetail = Room & RoomStatusResult & { recentHistory: Consultation[] }`, `RoomsService` with `findByTenant(tenantId): Promise<RoomWithStatus[]>`, `findById(id, tenantId): Promise<RoomDetail>`, `create(data: InsertRoom)`, `update(id, tenantId, data: Partial<InsertRoom>)` — consumed by Task 7 (`RoomsController`).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/rooms/rooms.service.spec.ts`:

```ts
import { RoomsService } from "./rooms.service";

function room(overrides: Record<string, unknown> = {}) {
  return {
    id: "room-1",
    tenantId: "tenant-1",
    number: "101",
    type: "Cardiologie",
    floor: null,
    capacity: 2,
    equipment: [],
    notes: null,
    status: "disponible",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    roomId: "room-1",
    status: "en_cours",
    scheduledAt: new Date(),
    ...overrides,
  };
}

describe("RoomsService", () => {
  describe("findByTenant", () => {
    it("groups consultations by roomId and attaches computed status per room", async () => {
      const roomsRepository = { findByTenant: jest.fn().mockResolvedValue([room({ id: "room-1" }), room({ id: "room-2", status: "disponible" })]) };
      const occupied = consultation({ roomId: "room-1", status: "en_cours" });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([occupied]) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any);

      const result = await service.findByTenant("tenant-1");

      expect(consultationsRepository.findByTenant).toHaveBeenCalledWith("tenant-1", {});
      expect(result.find((r) => r.id === "room-1")?.effectiveStatus).toBe("occupee");
      expect(result.find((r) => r.id === "room-2")?.effectiveStatus).toBe("disponible");
    });
  });

  describe("findById", () => {
    it("scopes the consultations query to this room and includes recent history", async () => {
      const roomsRepository = { findById: jest.fn().mockResolvedValue(room()) };
      const terminee = consultation({ id: "c-old", status: "terminee", scheduledAt: new Date("2026-08-01") });
      const consultationsRepository = { findByTenant: jest.fn().mockResolvedValue([terminee]) };
      const service = new RoomsService(roomsRepository as any, consultationsRepository as any);

      const result = await service.findById("room-1", "tenant-1");

      expect(consultationsRepository.findByTenant).toHaveBeenCalledWith("tenant-1", { roomId: "room-1" });
      expect(result.recentHistory).toEqual([terminee]);
      expect(result.effectiveStatus).toBe("disponible");
    });
  });

  describe("create/update", () => {
    it("delegates to RoomsRepository", async () => {
      const roomsRepository = { create: jest.fn().mockResolvedValue(room()), update: jest.fn().mockResolvedValue(room()) };
      const service = new RoomsService(roomsRepository as any, { findByTenant: jest.fn() } as any);

      await service.create({ number: "101", type: "Cardiologie", capacity: 2, tenantId: "tenant-1" } as any);
      await service.update("room-1", "tenant-1", { status: "en_maintenance" });

      expect(roomsRepository.create).toHaveBeenCalledWith({ number: "101", type: "Cardiologie", capacity: 2, tenantId: "tenant-1" });
      expect(roomsRepository.update).toHaveBeenCalledWith("room-1", "tenant-1", { status: "en_maintenance" });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest rooms.service.spec.ts`
Expected: FAIL — `Cannot find module './rooms.service'`.

- [ ] **Step 3: Implement `RoomsService`**

Create `backend/src/modules/rooms/rooms.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import type { Consultation, InsertRoom, Room } from "@shared/schema";
import { ConsultationsRepository } from "../consultations/consultations.repository";
import { RoomsRepository } from "./rooms.repository";
import { computeRoomStatus, deriveRoomHistory, type RoomStatusResult } from "./room-status";

export type RoomWithStatus = Room & RoomStatusResult;
export type RoomDetail = Room & RoomStatusResult & { recentHistory: Consultation[] };

@Injectable()
export class RoomsService {
  constructor(
    private readonly roomsRepository: RoomsRepository,
    private readonly consultationsRepository: ConsultationsRepository
  ) {}

  async findByTenant(tenantId: string): Promise<RoomWithStatus[]> {
    const [rooms, consultations] = await Promise.all([
      this.roomsRepository.findByTenant(tenantId),
      this.consultationsRepository.findByTenant(tenantId, {}),
    ]);
    const now = new Date();
    return rooms.map((room) => {
      const roomConsultations = (consultations as Consultation[]).filter((c) => c.roomId === room.id);
      return { ...room, ...computeRoomStatus(room, roomConsultations, now) };
    });
  }

  async findById(id: string, tenantId: string): Promise<RoomDetail> {
    const room = await this.roomsRepository.findById(id, tenantId);
    const consultations = (await this.consultationsRepository.findByTenant(tenantId, { roomId: id })) as Consultation[];
    const now = new Date();
    return {
      ...room,
      ...computeRoomStatus(room, consultations, now),
      recentHistory: deriveRoomHistory(consultations, 5),
    };
  }

  create(data: InsertRoom) {
    return this.roomsRepository.create(data);
  }

  update(id: string, tenantId: string, data: Partial<InsertRoom>) {
    return this.roomsRepository.update(id, tenantId, data);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest rooms.service.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/rooms/rooms.service.ts backend/src/modules/rooms/rooms.service.spec.ts
git commit -m "feat: add RoomsService with computed status"
```

---

### Task 7: `RoomsController`, DTOs, and module wiring

**Files:**
- Create: `backend/src/modules/rooms/dto/create-room.dto.ts`
- Create: `backend/src/modules/rooms/dto/update-room.dto.ts`
- Create: `backend/src/modules/rooms/rooms.controller.ts`
- Create: `backend/src/modules/rooms/rooms.repository.module.ts`
- Create: `backend/src/modules/rooms/rooms.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/src/modules/rooms/rooms.controller.spec.ts`

**Interfaces:**
- Consumes: `RoomsService` (Task 6), `RoomsPolicy` (Task 5), `JwtAuthGuard`/`PolicyGuard`/`CheckPolicy` (existing).
- Produces: live routes `GET /api/rooms/:tenantId`, `GET /api/rooms/detail/:id`, `POST /api/rooms`, `PUT /api/rooms/:id` — consumed by Task 12-14 (frontend).

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/rooms/rooms.controller.spec.ts`:

```ts
import { ForbiddenException } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";

describe("RoomsController", () => {
  function req(tenantId = "tenant-1") {
    return { user: { tenantId } };
  }

  it("findByTenant scopes to the authenticated tenant", async () => {
    const roomsService = { findByTenant: jest.fn().mockResolvedValue([]) };
    const controller = new RoomsController(roomsService as any);

    await controller.findByTenant("tenant-1", req());

    expect(roomsService.findByTenant).toHaveBeenCalledWith("tenant-1");
  });

  it("rejects a tenantId param that does not match the authenticated user", async () => {
    const controller = new RoomsController({ findByTenant: jest.fn() } as any);

    await expect(controller.findByTenant("tenant-2", req("tenant-1"))).rejects.toThrow(ForbiddenException);
  });

  it("create forces tenantId from the authenticated user", async () => {
    const roomsService = { create: jest.fn().mockResolvedValue({ id: "room-1" }) };
    const controller = new RoomsController(roomsService as any);

    await controller.create({ number: "101", type: "Cardiologie", capacity: 2 } as any, req());

    expect(roomsService.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1" }));
  });

  it("update scopes to the authenticated tenant", async () => {
    const roomsService = { update: jest.fn().mockResolvedValue({ id: "room-1" }) };
    const controller = new RoomsController(roomsService as any);

    await controller.update("room-1", { status: "en_maintenance" } as any, req());

    expect(roomsService.update).toHaveBeenCalledWith("room-1", "tenant-1", { status: "en_maintenance" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest rooms.controller.spec.ts`
Expected: FAIL — `Cannot find module './rooms.controller'`.

- [ ] **Step 3: Implement the DTOs**

Create `backend/src/modules/rooms/dto/create-room.dto.ts`:

```ts
import { IsArray, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from "class-validator";
import { Type } from "class-transformer";

export class CreateRoomDto {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsString()
  @IsNotEmpty()
  number: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  equipment?: string[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsIn(["disponible", "en_maintenance"])
  @IsOptional()
  status?: "disponible" | "en_maintenance";

  @IsString()
  @IsOptional()
  tenantId?: string;
}
```

Create `backend/src/modules/rooms/dto/update-room.dto.ts`:

```ts
import { IsArray, IsIn, IsInt, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";

export class UpdateRoomDto {
  @IsString()
  @IsOptional()
  number?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  floor?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  capacity?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  equipment?: string[];

  @IsString()
  @IsOptional()
  notes?: string;

  @IsIn(["disponible", "en_maintenance"])
  @IsOptional()
  status?: "disponible" | "en_maintenance";
}
```

- [ ] **Step 4: Implement `RoomsController`**

Create `backend/src/modules/rooms/rooms.controller.ts`:

```ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Request, UseGuards } from "@nestjs/common";
import { RoomsService } from "./rooms.service";
import { CreateRoomDto } from "./dto/create-room.dto";
import { UpdateRoomDto } from "./dto/update-room.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { RoomsPolicy } from "./rooms.policy";

@Controller("api/rooms")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Get(":tenantId")
  @CheckPolicy(RoomsPolicy, "view")
  async findByTenant(@Param("tenantId") tenantId: string, @Request() req: any) {
    return this.roomsService.findByTenant(this.tenantId(req, tenantId));
  }

  @Get("detail/:id")
  @CheckPolicy(RoomsPolicy, "view")
  async findById(@Param("id") id: string, @Request() req: any) {
    return this.roomsService.findById(id, this.tenantId(req));
  }

  @Post()
  @CheckPolicy(RoomsPolicy, "create")
  async create(@Body() dto: CreateRoomDto, @Request() req: any) {
    const tenantId = this.tenantId(req, dto.tenantId);
    return this.roomsService.create({ ...dto, tenantId } as any);
  }

  @Put(":id")
  @CheckPolicy(RoomsPolicy, "update")
  async update(@Param("id") id: string, @Body() dto: UpdateRoomDto, @Request() req: any) {
    return this.roomsService.update(id, this.tenantId(req), dto);
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

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest rooms.controller.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Wire the modules**

Create `backend/src/modules/rooms/rooms.repository.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { RoomsRepository } from "./rooms.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [RoomsRepository],
  exports: [RoomsRepository],
})
export class RoomsRepositoryModule {}
```

Create `backend/src/modules/rooms/rooms.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller";
import { RoomsService } from "./rooms.service";
import { RoomsPolicy } from "./rooms.policy";
import { AuthModule } from "../auth/auth.module";
import { RoomsRepositoryModule } from "./rooms.repository.module";
import { ConsultationsRepositoryModule } from "../consultations/consultations.repository.module";

@Module({
  imports: [AuthModule, RoomsRepositoryModule, ConsultationsRepositoryModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsPolicy],
  exports: [RoomsService],
})
export class RoomsModule {}
```

In `backend/src/app.module.ts`, add the import and register it in the `imports` array (right after `StaffModule` to keep admin-adjacent modules grouped):

```ts
import { StaffModule } from "./modules/staff/staff.module";
import { RoomsModule } from "./modules/rooms/rooms.module";
```

```ts
    StaffModule,
    RoomsModule,
```

- [ ] **Step 7: Start the backend and smoke-test manually**

Run: `cd backend && npm run start:dev` (or the project's existing dev script), then in another terminal:
```bash
curl -i -X POST http://localhost:3000/api/rooms -H "Content-Type: application/json" -H "Cookie: access_token=<a real admin session cookie>" -d '{"number":"101","type":"Cardiologie","capacity":2}'
```
Expected: `201 Created` with a JSON body containing `"status":"disponible"`. (If no local session cookie is available, this smoke test can be deferred to Task 18's full manual verification pass — the Jest suite from Steps 1-5 is the authoritative check for this task.)

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/rooms/ backend/src/app.module.ts
git commit -m "feat: wire RoomsController, DTOs, and module registration"
```

---

### Task 8: Extend `AuditInterceptor`'s `entityMap`

**Files:**
- Modify: `backend/src/common/interceptors/audit.interceptor.ts:161-168`
- Test: `backend/src/common/interceptors/audit.interceptor.spec.ts` (new — none exists yet for this interceptor)

**Interfaces:**
- Produces: `extractEntityInfo` now resolves `"lab-orders"`, `"prescriptions"`, `"rooms"` instead of falling through to `"unknown"` — consumed by Task 9 (patient-name resolution keys off these exact strings).

- [ ] **Step 1: Write the failing test**

Create `backend/src/common/interceptors/audit.interceptor.spec.ts`:

```ts
import { AuditInterceptor } from "./audit.interceptor";

describe("AuditInterceptor", () => {
  function extract(path: string) {
    const interceptor = new AuditInterceptor({ logAction: jest.fn() } as any);
    return (interceptor as any).extractEntityInfo(path, {}, {});
  }

  it.each([
    ["/api/patients/123", "patients"],
    ["/api/consultations/123", "consultations"],
    ["/api/queue/tenant-1", "queue"],
    ["/api/staff/123", "staff"],
    ["/api/settings/123", "settings"],
    ["/api/tenants/123", "tenants"],
    ["/api/lab-orders/123", "lab-orders"],
    ["/api/prescriptions/123", "prescriptions"],
    ["/api/rooms/123", "rooms"],
  ])("resolves %s to entityType %s", (path, expected) => {
    expect(extract(path).entityType).toBe(expected);
  });

  it("falls back to unknown for an unrecognized path", () => {
    expect(extract("/api/something-else/123").entityType).toBe("unknown");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest audit.interceptor.spec.ts`
Expected: FAIL on the three new cases (`lab-orders`, `prescriptions`, `rooms` all currently return `"unknown"`).

- [ ] **Step 3: Extend the `entityMap`**

In `backend/src/common/interceptors/audit.interceptor.ts`, change the `entityMap` object literal (currently lines 161-168):

```ts
    const entityMap: { [key: string]: string } = {
      patients: "patients",
      consultations: "consultations",
      queue: "queue",
      staff: "staff",
      settings: "settings",
      tenants: "tenants",
      "lab-orders": "lab-orders",
      prescriptions: "prescriptions",
      rooms: "rooms",
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest audit.interceptor.spec.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/interceptors/audit.interceptor.ts backend/src/common/interceptors/audit.interceptor.spec.ts
git commit -m "feat: recognize lab-orders, prescriptions, and rooms in AuditInterceptor"
```

---

### Task 9: "Patient concerné" resolution in the audit log

**Files:**
- Modify: `backend/src/modules/audit/audit.repository.ts` (add `resolvePatientName`)
- Modify: `backend/src/modules/audit/audit.service.ts` (enrich `getAuditLogs`)
- Test: `backend/src/modules/audit/audit.repository.spec.ts` (new), `backend/src/modules/audit/audit.service.spec.ts` (new)

**Interfaces:**
- Consumes: `AuditLog` (existing), `couchDocumentId`/`tenantDatabaseName` (existing).
- Produces: `AuditRepository.resolvePatientName(tenantId: string, entityType: string, entityId: string | null, changes: unknown): Promise<string | null>`; `AuditService.getAuditLogs(...)` now returns `Array<AuditLog & { patientName: string | null }>` — consumed by Task 16 (`AuditLogs.tsx`'s new "Patient concerné" column).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/audit/audit.repository.spec.ts`:

```ts
import { AuditRepository } from "./audit.repository";

describe("AuditRepository.resolvePatientName", () => {
  it("resolves via entityId for a consultations UPDATE", async () => {
    const db = {
      get: jest.fn().mockResolvedValue({ patientId: "patient-1", firstName: "Aissatou", lastName: "Diallo" }),
    };
    const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

    const name = await repository.resolvePatientName("tenant-1", "consultations", "c-1", null);

    expect(db.get).toHaveBeenNthCalledWith(1, "consultation:c-1");
    expect(name).toBe("Aissatou Diallo");
  });

  it("falls back to changes.patientId for a consultations CREATE (no entityId yet)", async () => {
    const db = { get: jest.fn().mockResolvedValue({ firstName: "Aissatou", lastName: "Diallo" }) };
    const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

    const name = await repository.resolvePatientName("tenant-1", "consultations", null, { patientId: "patient-1" });

    expect(db.get).toHaveBeenCalledWith("patient:patient-1");
    expect(name).toBe("Aissatou Diallo");
  });

  it("resolves a lab-orders UPDATE directly from the lab_order document", async () => {
    const db = {
      get: jest.fn((id: string) => {
        if (id === "lab_order:lo-1") return Promise.resolve({ patientId: "patient-1" });
        if (id === "patient:patient-1") return Promise.resolve({ firstName: "Marc", lastName: "Etoa" });
        return Promise.reject({ statusCode: 404 });
      }),
    };
    const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

    const name = await repository.resolvePatientName("tenant-1", "lab-orders", "lo-1", null);

    expect(name).toBe("Marc Etoa");
  });

  it("resolves a prescriptions CREATE via changes.consultationId (no direct patientId in the body)", async () => {
    const db = {
      get: jest.fn((id: string) => {
        if (id === "consultation:c-1") return Promise.resolve({ patientId: "patient-1" });
        if (id === "patient:patient-1") return Promise.resolve({ firstName: "Marc", lastName: "Etoa" });
        return Promise.reject({ statusCode: 404 });
      }),
    };
    const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

    const name = await repository.resolvePatientName("tenant-1", "prescriptions", null, { consultationId: "c-1" });

    expect(name).toBe("Marc Etoa");
  });

  it("returns null for an unrelated entityType without erroring", async () => {
    const repository = new AuditRepository({ getDatabase: jest.fn() } as any);

    const name = await repository.resolvePatientName("tenant-1", "staff", "user-1", null);

    expect(name).toBeNull();
  });

  it("returns null when nothing resolves", async () => {
    const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
    const repository = new AuditRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any);

    const name = await repository.resolvePatientName("tenant-1", "consultations", null, {});

    expect(name).toBeNull();
  });
});
```

Create `backend/src/modules/audit/audit.service.spec.ts`:

```ts
import { AuditService } from "./audit.service";

describe("AuditService.getAuditLogs", () => {
  it("enriches every log with a resolved patientName", async () => {
    const logs = [
      { id: "log-1", entityType: "consultations", entityId: "c-1", changes: null },
      { id: "log-2", entityType: "staff", entityId: "user-1", changes: null },
    ];
    const auditRepository = {
      find: jest.fn().mockResolvedValue(logs),
      resolvePatientName: jest.fn().mockResolvedValueOnce("Aissatou Diallo").mockResolvedValueOnce(null),
    };
    const service = new AuditService(auditRepository as any);

    const result = await service.getAuditLogs("tenant-1");

    expect(result[0]).toMatchObject({ id: "log-1", patientName: "Aissatou Diallo" });
    expect(result[1]).toMatchObject({ id: "log-2", patientName: null });
    expect(auditRepository.resolvePatientName).toHaveBeenCalledWith("tenant-1", "consultations", "c-1", null);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest audit.repository.spec.ts audit.service.spec.ts`
Expected: FAIL — `resolvePatientName` doesn't exist yet on `AuditRepository`; `getAuditLogs` doesn't return `patientName`.

- [ ] **Step 3: Implement `resolvePatientName` on `AuditRepository`**

In `backend/src/modules/audit/audit.repository.ts`, add the `DocumentScope` type import at the top:

```ts
import type { DocumentScope } from "nano";
```

Then add these methods to the class (after `find`, before the private `db`/`hydrate` helpers):

```ts
  async resolvePatientName(tenantId: string, entityType: string, entityId: string | null, changes: unknown): Promise<string | null> {
    const patientId = await this.resolvePatientId(tenantId, entityType, entityId, changes as Record<string, unknown> | null);
    if (!patientId) return null;
    const db = await this.db(tenantId);
    const patient = await this.getOrNull(db, `patient:${patientId}`);
    if (!patient) return null;
    return `${patient.firstName} ${patient.lastName}`;
  }

  private async resolvePatientId(
    tenantId: string,
    entityType: string,
    entityId: string | null,
    changes: Record<string, unknown> | null
  ): Promise<string | null> {
    const db = await this.db(tenantId);

    if (entityType === "consultations") {
      if (entityId) {
        const doc = await this.getOrNull(db, `consultation:${entityId}`);
        if (doc?.patientId) return doc.patientId;
      }
      if (typeof changes?.patientId === "string") return changes.patientId;
      return null;
    }

    if (entityType === "lab-orders" || entityType === "prescriptions") {
      const docType = entityType === "lab-orders" ? "lab_order" : "prescription";
      if (entityId) {
        const doc = await this.getOrNull(db, `${docType}:${entityId}`);
        if (doc?.patientId) return doc.patientId;
      }
      if (typeof changes?.consultationId === "string") {
        const consultation = await this.getOrNull(db, `consultation:${changes.consultationId}`);
        if (consultation?.patientId) return consultation.patientId;
      }
      return null;
    }

    return null;
  }

  private async getOrNull(db: DocumentScope<unknown>, id: string): Promise<any | null> {
    try {
      return await db.get(id);
    } catch (error: any) {
      if (error?.statusCode === 404) return null;
      throw error;
    }
  }
```

- [ ] **Step 4: Enrich `AuditService.getAuditLogs`**

In `backend/src/modules/audit/audit.service.ts`, replace the `getAuditLogs` method:

```ts
  async getAuditLogs(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      page?: number;
      startDate?: Date;
      endDate?: Date;
      action?: string;
      status?: string;
      entityType?: string;
      userId?: string;
    }
  ): Promise<Array<AuditLog & { patientName: string | null }>> {
    const logs = await this.auditRepository.find(tenantId, options);
    return Promise.all(
      logs.map(async (log) => ({
        ...log,
        patientName: await this.auditRepository.resolvePatientName(tenantId, log.entityType, log.entityId, log.changes),
      }))
    );
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest audit.repository.spec.ts audit.service.spec.ts`
Expected: PASS (7 tests total).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/audit/audit.repository.ts backend/src/modules/audit/audit.service.ts backend/src/modules/audit/audit.repository.spec.ts backend/src/modules/audit/audit.service.spec.ts
git commit -m "feat: resolve patientName for consultations/lab-orders/prescriptions audit entries"
```

---

### Task 10: Close the `/api/auth/register` hole

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts` (`register` method)
- Modify: `backend/src/modules/auth/auth.controller.ts` (`register` route)
- Test: `backend/src/modules/auth/auth.service.spec.ts` (extend the existing file — confirmed to already exist)

**Interfaces:**
- Produces: `AuthService.register(..., requester?: { userId: string; tenantId: string; role: string } | null)` — throws `ForbiddenException` when the target tenant already has users and `requester` isn't an admin/manager of that same tenant. Consumed by Task 17 (`Register.tsx` simplification, which stops sending a tenant/role selection for the non-bootstrap case).

- [ ] **Step 1: Write the failing tests**

Read `backend/src/modules/auth/auth.service.spec.ts` first to see its existing structure and mocking conventions, then add a new `describe("register")` block to it (do not remove any existing tests):

```ts
describe("register", () => {
  function repos(overrides: { existingUsersCount?: number } = {}) {
    const usersRepository = {
      findByUsername: jest.fn().mockResolvedValue(undefined),
      findByTenant: jest.fn().mockResolvedValue(new Array(overrides.existingUsersCount ?? 0).fill({ id: "u" })),
      create: jest.fn().mockResolvedValue({ id: "new-user", tenantId: "tenant-1", role: "cashier" }),
    };
    const tenantsRepository = { findById: jest.fn().mockResolvedValue({ id: "tenant-1", name: "Clinic" }) };
    return { usersRepository, tenantsRepository };
  }

  it("allows open registration when the target tenant has zero users", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 0 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newadmin", "password1", "New", "Admin", "tenant-1", undefined, "admin", null)
    ).resolves.toBeDefined();
  });

  it("rejects an unauthenticated caller when the target tenant already has users", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newadmin", "password1", "New", "Admin", "tenant-1", undefined, "admin", null)
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects a caller from a different tenant even if they are admin somewhere", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newadmin", "password1", "New", "Admin", "tenant-1", undefined, "admin", {
        userId: "u2",
        tenantId: "tenant-2",
        role: "admin",
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("rejects a non-admin/manager caller from the correct tenant", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newuser", "password1", "New", "User", "tenant-1", undefined, "cashier", {
        userId: "u2",
        tenantId: "tenant-1",
        role: "medecin",
      })
    ).rejects.toThrow(ForbiddenException);
  });

  it("allows an admin of the correct tenant to register a new user", async () => {
    const { usersRepository, tenantsRepository } = repos({ existingUsersCount: 1 });
    const service = new AuthService(usersRepository as any, tenantsRepository as any, { sign: jest.fn() } as any);

    await expect(
      service.register("newuser", "password1", "New", "User", "tenant-1", undefined, "cashier", {
        userId: "u2",
        tenantId: "tenant-1",
        role: "admin",
      })
    ).resolves.toBeDefined();
  });
});
```

Add the `ForbiddenException` import at the top of the spec file if not already imported (`import { AuthService } from "./auth.service";` is presumably already there — add `import { ForbiddenException } from "@nestjs/common";` alongside it, matching whatever import style the existing file already uses).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest auth.service.spec.ts -t register`
Expected: FAIL — `register` currently accepts only 7 params and never checks `findByTenant`/throws `ForbiddenException`.

- [ ] **Step 3: Harden `AuthService.register`**

In `backend/src/modules/auth/auth.service.ts`, add the `ForbiddenException` import (alongside the existing `UnauthorizedException, ConflictException, BadRequestException` import from `@nestjs/common`), then replace the `register` method:

```ts
  async register(
    username: string,
    password: string,
    firstName: string,
    lastName: string,
    tenantId: string,
    email?: string,
    role: "admin" | "manager" | "cashier" = "cashier",
    requester?: { userId: string; tenantId: string; role: string } | null
  ): Promise<RegisterResponse> {
    username = normalizeUsername(username);
    const existingUser = await this.usersRepository.findByUsername(username);
    if (existingUser) {
      throw new ConflictException("Username already exists");
    }

    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new BadRequestException("Invalid tenant ID");
    }

    const existingTenantUsers = await this.usersRepository.findByTenant(tenantId, { limit: 1 });
    if (existingTenantUsers.length > 0) {
      const isAuthorizedRequester =
        !!requester &&
        requester.tenantId === tenantId &&
        (requester.role === "admin" || requester.role === "manager");
      if (!isAuthorizedRequester) {
        throw new ForbiddenException(
          "Registration for an existing tenant requires an authenticated admin or manager of that tenant"
        );
      }
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const user = await this.usersRepository.create({
      username,
      password: hashedPassword,
      firstName,
      lastName,
      email,
      role,
      tenantId,
      isActive: true,
    });

    return {
      user: this.sanitizeUser(user),
      tenant,
    };
  }
```

- [ ] **Step 4: Update `AuthController.register` to decode the requester from the JWT cookie**

In `backend/src/modules/auth/auth.controller.ts`:
- Add `JwtService` to the imports: `import { JwtService } from "@nestjs/jwt";`
- Add it to the constructor: `constructor(private readonly authService: AuthService, private readonly jwtService: JwtService) {}`
- Replace the `register` method:

```ts
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() registerDto: RegisterDto, @Request() req: FastifyRequest) {
    const requester = this.tryDecodeRequester((req as any)?.cookies?.access_token);
    return this.authService.register(
      registerDto.username,
      registerDto.password,
      registerDto.firstName,
      registerDto.lastName,
      registerDto.tenantId,
      registerDto.email,
      registerDto.role,
      requester
    );
  }

  private tryDecodeRequester(token: string | undefined): { userId: string; tenantId: string; role: string } | null {
    if (!token) return null;
    try {
      const payload: any = this.jwtService.verify(token);
      return { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
    } catch {
      return null;
    }
  }
```

Note: `Request` is already imported from `@nestjs/common` in this file (used by `getCurrentUser`), and the cookie name/extraction path (`req.cookies?.access_token`) is the exact one already used by `JwtStrategy` — no new cookie-parsing setup is needed since it's already registered globally (proven by `/api/auth/me` working today via cookie-based `JwtAuthGuard`). `JwtService` is resolvable here because `AuthController` lives in the same `AuthModule` that already provides it to `AuthService` (no change needed to `auth.module.ts`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest auth.service.spec.ts`
Expected: PASS (all existing tests plus the 5 new ones).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/auth/auth.service.ts backend/src/modules/auth/auth.controller.ts backend/src/modules/auth/auth.service.spec.ts
git commit -m "fix: require admin/manager auth to register into a tenant that already has users"
```

---

### Task 11: Staff schema extension + photo upload endpoint

**Files:**
- Modify: `backend/src/shared/schema.ts:10-11` (`User`/`InsertUser`), `:232` (`insertUserSchema`)
- Modify: `frontend/shared/schema.ts:6-7` (mirror), `:220` (mirror)
- Modify: `backend/src/modules/staff/dto/create-staff.dto.ts`, `backend/src/modules/staff/dto/update-staff.dto.ts`
- Modify: `backend/src/modules/staff/dto/create-staff.dto.spec.ts`, `backend/src/modules/staff/dto/update-staff.dto.spec.ts` (both already exist)
- Modify: `backend/src/modules/identity/users.repository.ts` (add `attachPhoto`/`getPhotoUrl`)
- Modify: `backend/src/modules/identity/identity.module.ts` (import `S3Module`)
- Modify: `backend/src/modules/staff/staff.service.ts` (add `attachPhoto`/`getPhotoUrl` passthrough)
- Modify: `backend/src/modules/staff/staff.controller.ts` (add photo route)
- Create: `backend/src/modules/staff/dto/attach-staff-photo.dto.ts`
- Test: `backend/src/modules/identity/users.repository.spec.ts` (new)

**Interfaces:**
- Consumes: `S3Service` (existing, `backend/src/lib/s3.service.ts`).
- Produces: `User.service`/`specialty`/`matricule`/`fonction`/`photoS3Key: string | null` (backend + frontend), `PUT /api/staff/:id/photo` — consumed by Task 15 (`Staff.tsx` form extension).

- [ ] **Step 1: Extend the schema types**

In `backend/src/shared/schema.ts`, replace the `User`/`InsertUser`/`insertUserSchema` lines (currently 10-11 and 232):

```ts
export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien"; tenantId: string; isActive: boolean; service: string | null; specialty: string | null; matricule: string | null; fonction: string | null; photoS3Key: string | null; createdAt: Date }
export interface InsertUser { id?: string; username: string; password: string; firstName: string; lastName: string; email?: string | null; role?: User["role"]; tenantId: string; isActive?: boolean; service?: string | null; specialty?: string | null; matricule?: string | null; fonction?: string | null }
```

```ts
export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien"]).optional(), tenantId: z.string(), isActive: z.boolean().optional(), service: nullableString, specialty: nullableString, matricule: nullableString, fonction: nullableString });
```

In `frontend/shared/schema.ts`, apply the identical replacement (the `User`/`InsertUser`/`insertUserSchema` lines there are byte-for-byte identical to the backend ones today, per Task 1's research — same edit, same file locations relative to `Consultation`).

- [ ] **Step 2: Run typecheck**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Extend `CreateStaffDto`/`UpdateStaffDto`**

In `backend/src/modules/staff/dto/create-staff.dto.ts`, add before the closing brace:

```ts
  @IsString()
  @IsOptional()
  service?: string;

  @IsString()
  @IsOptional()
  specialty?: string;

  @IsString()
  @IsOptional()
  matricule?: string;

  @IsString()
  @IsOptional()
  fonction?: string;
```

(`IsString`/`IsOptional` are already imported in this file.) Apply the identical four fields to `backend/src/modules/staff/dto/update-staff.dto.ts`.

- [ ] **Step 4: Write the failing backward-compatibility tests for both DTOs**

Add to the existing `backend/src/modules/staff/dto/create-staff.dto.spec.ts` (inside the top-level `describe("CreateStaffDto", ...)` block, alongside the existing `it(...)` cases — do not remove any of them):

```ts
  it("accepts the new optional service/specialty/matricule/fonction fields", async () => {
    const dto = plainToInstance(CreateStaffDto, {
      ...validBase,
      service: "Cardiologie",
      specialty: "Cardiologie interventionnelle",
      matricule: "MED-99382",
      fonction: "Médecin Chef Adjoint",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("stays valid without service/specialty/matricule/fonction (backward compatibility)", async () => {
    const dto = plainToInstance(CreateStaffDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
```

Add the equivalent two cases to `backend/src/modules/staff/dto/update-staff.dto.spec.ts`, following whatever `validBase`-equivalent object that file already uses (an empty object is valid for `UpdateStaffDto` since every field there is `@IsOptional()` — check the existing file's baseline case for the exact pattern before adding).

Run: `cd backend && npx jest create-staff.dto.spec.ts update-staff.dto.spec.ts`
Expected: FAIL for the two new "accepts the new..." cases in each file (the fields don't exist on the DTO class yet, so `class-validator` currently has nothing to validate them against — but since Step 3 above already added the decorators before this step runs in sequence, re-order: run this Step 3b's tests *before* Step 3's decorator implementation if executing strictly TDD-by-the-book. Practically: write this test file first, confirm it fails on `errors).toHaveLength(0)` for extra unknown properties only if `whitelist` validation is enabled — if `class-validator`'s `validate()` here doesn't strip/reject unknown properties by default (it doesn't, unless `ValidatorOptions.whitelist` is set at the `validate()` call site, which none of the existing specs in this file do), both new-field tests will actually pass even before Step 3's decorators exist, since undecorated properties are simply ignored, not rejected. In that case Step 3b is a passing-from-the-start regression guard rather than a red/green TDD step — still write it, still run it after Step 3 to confirm it passes, but don't expect a red phase here.)

- [ ] **Step 5: Write the failing test for photo upload**

Create `backend/src/modules/identity/users.repository.spec.ts`:

```ts
import { NotFoundException } from "@nestjs/common";
import { UsersRepository } from "./users.repository";

describe("UsersRepository.attachPhoto / getPhotoUrl", () => {
  function existingUser(overrides: Record<string, unknown> = {}) {
    return {
      _id: "user:user-1",
      _rev: "2-a",
      id: "user-1",
      type: "user",
      tenantId: "tenant-1",
      photoS3Key: null,
      ...overrides,
    };
  }

  it("uploads to S3 with a tenant/staff-scoped key and patches photoS3Key", async () => {
    const db = {
      get: jest.fn().mockResolvedValue(existingUser()),
      insert: jest.fn().mockResolvedValue({ ok: true }),
    };
    const s3Service = { uploadObject: jest.fn().mockResolvedValue(undefined) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, s3Service as any);

    const result = await repository.attachPhoto("user-1", "tenant-1", Buffer.from("img").toString("base64"), "image/jpeg");

    expect(s3Service.uploadObject).toHaveBeenCalledWith(
      expect.stringMatching(/^tenants\/tenant-1\/staff\/user-1\/photo-\d+\.jpg$/),
      Buffer.from("img"),
      "image/jpeg"
    );
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ photoS3Key: expect.stringMatching(/^tenants\//) }));
    expect(result.photoS3Key).toMatch(/^tenants\//);
  });

  it("throws NotFoundException when the staff member does not exist", async () => {
    const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, { uploadObject: jest.fn() } as any);

    await expect(repository.attachPhoto("missing", "tenant-1", "aW1n", "image/jpeg")).rejects.toThrow(NotFoundException);
  });

  it("getPhotoUrl returns a presigned URL when photoS3Key is set", async () => {
    const db = { get: jest.fn().mockResolvedValue(existingUser({ photoS3Key: "tenants/tenant-1/staff/user-1/photo-1.jpg" })) };
    const s3Service = { getPresignedUrl: jest.fn().mockResolvedValue("https://signed.example/photo.jpg") };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, s3Service as any);

    const url = await repository.getPhotoUrl("user-1", "tenant-1");

    expect(s3Service.getPresignedUrl).toHaveBeenCalledWith("tenants/tenant-1/staff/user-1/photo-1.jpg", 300);
    expect(url).toBe("https://signed.example/photo.jpg");
  });

  it("getPhotoUrl throws NotFoundException when no photo has been uploaded yet", async () => {
    const db = { get: jest.fn().mockResolvedValue(existingUser()) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, { getPresignedUrl: jest.fn() } as any);

    await expect(repository.getPhotoUrl("user-1", "tenant-1")).rejects.toThrow(NotFoundException);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && npx jest users.repository.spec.ts`
Expected: FAIL — `UsersRepository` constructor doesn't accept a second `s3Service` argument yet, and `attachPhoto`/`getPhotoUrl` don't exist.

- [ ] **Step 7: Implement `attachPhoto`/`getPhotoUrl` on `UsersRepository`**

In `backend/src/modules/identity/users.repository.ts`:
- Add the import: `import { S3Service } from "../../lib/s3.service";`
- Change the constructor: `constructor(private readonly couchDBService: CouchDBService, private readonly s3Service: S3Service) {}`
- Add these two methods (after `delete`, before the private `usernameId`/`db`/`hydrate` helpers):

```ts
  async attachPhoto(id: string, tenantId: string, base64Body: string, contentType: string): Promise<User> {
    const db = await this.db();
    const current: any = await db.get(`user:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Staff member not found");
      throw error;
    });
    if (current.tenantId !== tenantId) {
      throw new NotFoundException("Staff member not found");
    }

    const extension = contentType === "image/png" ? "png" : "jpg";
    const key = `tenants/${tenantId}/staff/${id}/photo-${Date.now()}.${extension}`;
    await this.s3Service.uploadObject(key, Buffer.from(base64Body, "base64"), contentType);

    const updated = { ...current, photoS3Key: key };
    await db.insert(updated);
    return this.hydrate(updated);
  }

  async getPhotoUrl(id: string, tenantId: string): Promise<string> {
    const db = await this.db();
    const current: any = await db.get(`user:${id}`).catch((error: any) => {
      if (error?.statusCode === 404) throw new NotFoundException("Staff member not found");
      throw error;
    });
    if (current.tenantId !== tenantId) {
      throw new NotFoundException("Staff member not found");
    }
    if (!current.photoS3Key) {
      throw new NotFoundException("Staff member has no photo");
    }
    return this.s3Service.getPresignedUrl(current.photoS3Key, 300);
  }
```

Note: the photo is stored in the same bucket `S3Service` already points at (`AWS_S3_BUCKET_PATIENT_PHOTOS`) — the env var name is a historical artifact of it having been introduced for patient photos first, but the bucket is a generic object store and the `tenants/{tenantId}/staff/...` key prefix already fully separates staff photos from patient photos within it. No new environment variable is introduced.

- [ ] **Step 8: Wire `S3Module` into `IdentityModule`**

In `backend/src/modules/identity/identity.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { CouchDBModule } from "../../database/couchdb.module";
import { S3Module } from "../../lib/s3.module";
import { TenantsRepository } from "./tenants.repository";
import { UsersRepository } from "./users.repository";

@Module({
  imports: [CouchDBModule, S3Module],
  providers: [TenantsRepository, UsersRepository],
  exports: [TenantsRepository, UsersRepository],
})
export class IdentityModule {}
```

- [ ] **Step 9: Run tests to verify they pass**

Run: `cd backend && npx jest users.repository.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 10: Expose the photo endpoint through `StaffService`/`StaffController`**

In `backend/src/modules/staff/staff.service.ts`, add two passthrough methods (after `delete`, before `sanitizeUser`):

```ts
  attachPhoto(id: string, tenantId: string, base64Body: string, contentType: string) {
    return this.usersRepository.attachPhoto(id, tenantId, base64Body, contentType);
  }

  getPhotoUrl(id: string, tenantId: string) {
    return this.usersRepository.getPhotoUrl(id, tenantId);
  }
```

Create `backend/src/modules/staff/dto/attach-staff-photo.dto.ts` (identical shape to the patients one):

```ts
import { IsString, IsNotEmpty, IsIn } from "class-validator";

export class AttachStaffPhotoDto {
  @IsString() @IsNotEmpty() photoBase64: string;
  @IsIn(["image/jpeg", "image/png"]) contentType: "image/jpeg" | "image/png";
}
```

In `backend/src/modules/staff/staff.controller.ts`, add the import (`import { AttachStaffPhotoDto } from "./dto/attach-staff-photo.dto";`) and two routes (after `update`, before `delete`):

```ts
  @Put(":id/photo")
  @CheckPolicy(StaffPolicy, "update")
  async attachPhoto(@Param("id") id: string, @Body() dto: AttachStaffPhotoDto, @Request() req: any) {
    return this.staffService.attachPhoto(id, req.user.tenantId, dto.photoBase64, dto.contentType);
  }

  @Get(":id/photo-url")
  @CheckPolicy(StaffPolicy, "view")
  async getPhotoUrl(@Param("id") id: string, @Request() req: any) {
    return { url: await this.staffService.getPhotoUrl(id, req.user.tenantId) };
  }
```

- [ ] **Step 11: Typecheck and run the full backend suite**

Run: `cd backend && npx tsc --noEmit && npx jest`
Expected: PASS across the board (no regressions in existing staff/auth/patients suites).

- [ ] **Step 12: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts backend/src/modules/staff/ backend/src/modules/identity/
git commit -m "feat: add service/specialty/matricule/fonction fields and photo upload to Staff"
```

---

### Task 12: Frontend `RoomsPolicy` + Sidebar nav entry + i18n skeleton

**Files:**
- Create: `frontend/src/lib/policies/rooms.policy.ts`
- Create: `frontend/src/lib/i18n/rooms.ts`
- Modify: `frontend/src/lib/i18n/index.ts` (register the new section)
- Modify: `frontend/src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `BasePolicy` (existing, `frontend/src/lib/policies/base.policy.ts`), `usePolicy` (existing, `frontend/src/hooks/usePolicy.ts`).
- Produces: `RoomsPolicy` (frontend), `t("salles")`/`t("roomsSubtitle")` etc., a `/salles` nav entry — consumed by Task 13 (`/salles` pages) and Task 14.

- [ ] **Step 1: Create the frontend policy**

Create `frontend/src/lib/policies/rooms.policy.ts`:

```ts
import { BasePolicy } from "./base.policy";

export class RoomsPolicy extends BasePolicy {
  canView(): boolean {
    return this.hasAnyRole("admin", "manager", "medecin", "infirmier", "accueil");
  }

  canCreate(): boolean {
    return this.isAdminOrManager();
  }

  canUpdate(): boolean {
    return this.isAdminOrManager();
  }
}
```

- [ ] **Step 2: Create the i18n section**

Create `frontend/src/lib/i18n/rooms.ts`:

```ts
import type { TranslationSection } from "./types";

export const rooms: TranslationSection = {
  en: {
    salles: "Rooms",
    roomsManagement: "Room Management",
    roomsManagementSubtitle: "Real-time tracking of care room occupancy and availability.",
    roomsAvailable: "Available",
    roomsOccupied: "Occupied",
    roomsReserved: "Reserved",
    addRoom: "Add a room",
    editRoom: "Edit room",
    roomNumberOrName: "Room number or name",
    roomType: "Room type",
    roomFloor: "Floor",
    roomCapacity: "Capacity",
    roomEquipment: "Available equipment",
    roomNotes: "Maintenance notes / specifics",
    roomInitialStatus: "Initial status",
    roomStatusDisponible: "Available",
    roomStatusOccupee: "Occupied",
    roomStatusReservee: "Reserved",
    roomStatusEnMaintenance: "In maintenance",
    markInMaintenance: "Mark in maintenance",
    markAvailable: "Mark available",
    reserveRoom: "Reserve",
    currentOccupation: "Current occupation",
    todaysReservations: "Today's reservations",
    recentUsageHistory: "Recent usage history",
    noCurrentOccupation: "No current occupation",
    createRoom: "Create room",
    roomCreatedSuccessfully: "Room created successfully",
    roomUpdatedSuccessfully: "Room updated successfully",
    failedToCreateRoom: "Failed to create room",
    failedToUpdateRoom: "Failed to update room",
    viewRoomDetails: "View details",
    assignedRoom: "Assigned room",
    noRoomAssigned: "No room assigned",
  },
  fr: {
    salles: "Salles",
    roomsManagement: "Gestion des salles",
    roomsManagementSubtitle: "Suivi en temps réel de l'occupation et de la disponibilité des salles de soin.",
    roomsAvailable: "Disponibles",
    roomsOccupied: "Occupées",
    roomsReserved: "Réservées",
    addRoom: "Ajouter une salle",
    editRoom: "Modifier la salle",
    roomNumberOrName: "Numéro ou nom de la salle",
    roomType: "Type de salle",
    roomFloor: "Étage",
    roomCapacity: "Capacité d'accueil",
    roomEquipment: "Équipements disponibles",
    roomNotes: "Notes de maintenance / Spécificités",
    roomInitialStatus: "Statut initial",
    roomStatusDisponible: "Disponible",
    roomStatusOccupee: "Occupée",
    roomStatusReservee: "Réservée",
    roomStatusEnMaintenance: "En maintenance",
    markInMaintenance: "Marquer en maintenance",
    markAvailable: "Marquer disponible",
    reserveRoom: "Réserver",
    currentOccupation: "Occupation actuelle",
    todaysReservations: "Planning des réservations — Aujourd'hui",
    recentUsageHistory: "Historique d'utilisation récent",
    noCurrentOccupation: "Aucune occupation en cours",
    createRoom: "Créer la salle",
    roomCreatedSuccessfully: "Salle créée avec succès",
    roomUpdatedSuccessfully: "Salle mise à jour avec succès",
    failedToCreateRoom: "Échec de la création de la salle",
    failedToUpdateRoom: "Échec de la mise à jour de la salle",
    viewRoomDetails: "Voir détails",
    assignedRoom: "Salle assignée",
    noRoomAssigned: "Aucune salle assignée",
  },
};
```

- [ ] **Step 3: Register the section**

In `frontend/src/lib/i18n/index.ts`, add the import and register it in the `sections` array:

```ts
import { carePlan } from "./carePlan";
import { rooms } from "./rooms";
```

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
  carePlan,
  rooms,
];
```

- [ ] **Step 4: Add the nav entry**

In `frontend/src/components/Sidebar.tsx`:
- Add `DoorOpen` to the `lucide-react` import list (alongside `Pill`, `FlaskConical`, etc.).
- Add the import: `import { RoomsPolicy } from "@/lib/policies/rooms.policy";`
- Add `const roomsPolicy = usePolicy(RoomsPolicy);` next to the other `usePolicy(...)` calls.
- Add the menu entry into `menuItems`, right after the `prescriptionsPolicy` entry and before the `staffPolicy` entry:

```ts
    ...(roomsPolicy.canView()
      ? [{ icon: DoorOpen, label: t("salles"), path: "/salles" }]
      : []),
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual check**

Run the frontend dev server, log in as `admin`, confirm a "Salles" nav item now appears in the sidebar (it will 404 or show a blank lazy-loaded page until Task 13 adds the route — that's expected at this point).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/policies/rooms.policy.ts frontend/src/lib/i18n/rooms.ts frontend/src/lib/i18n/index.ts frontend/src/components/Sidebar.tsx
git commit -m "feat: add RoomsPolicy, rooms i18n section, and Salles nav entry"
```

---

### Task 13: `/salles` pages (index, new, show) and routes

**Files:**
- Create: `frontend/src/pages/salles/index.tsx`
- Create: `frontend/src/pages/salles/new.tsx`
- Create: `frontend/src/pages/salles/show.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `GET /api/rooms/:tenantId`, `GET /api/rooms/detail/:id`, `POST /api/rooms`, `PUT /api/rooms/:id` (Task 7), `RoomsPolicy` (Task 12), `Room`/`InsertRoom` (Task 1).
- Produces: working `/salles`, `/salles/new`, `/salles/:id` pages — consumed by Task 14 (the consultation form links out to room detail is not required, but the room picker in Task 14 depends on the same `/api/rooms/:tenantId` endpoint this task's `index.tsx` also calls).

- [ ] **Step 1: Add the routes to `App.tsx`**

Add the lazy imports, right after `const PrescriptionDetails = lazy(() => import("./pages/pharmacie/show"));`:

```tsx
const SallesIndex = lazy(() => import("./pages/salles"));
const NewSalle = lazy(() => import("./pages/salles/new"));
const SalleDetails = lazy(() => import("./pages/salles/show"));
```

Add the routes, right before the `/staff` route block:

```tsx
        <Route path="/salles">
          <ProtectedRoute>
            <Layout>
              <SallesIndex />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/salles/new">
          <ProtectedRoute>
            <Layout>
              <NewSalle />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/salles/:id">
          <ProtectedRoute>
            <Layout>
              <SalleDetails />
            </Layout>
          </ProtectedRoute>
        </Route>
```

(`/salles/new` is declared before `/salles/:id`, matching the ordering already used for `/laboratoire/new` vs `/laboratoire/:id` and `/pharmacie` vs `/pharmacie/:id` in this same file.)

- [ ] **Step 2: Build `index.tsx`**

Create `frontend/src/pages/salles/index.tsx`:

```tsx
import React from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { usePolicy } from "@/hooks/usePolicy";
import { RoomsPolicy } from "@/lib/policies/rooms.policy";
import { PolicyGuard } from "@/components/PolicyGuard";
import type { Room, RoomEffectiveStatus } from "@shared/schema";

type RoomWithStatus = Room & { effectiveStatus: RoomEffectiveStatus };

const statusBadgeVariant: Record<RoomEffectiveStatus, "success" | "danger" | "warning" | "secondary"> = {
  disponible: "success",
  occupee: "danger",
  reservee: "warning",
  en_maintenance: "secondary",
};

export default function SallesIndex() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const roomsPolicy = usePolicy(RoomsPolicy);

  const { data: rooms = [], isLoading } = useQuery<RoomWithStatus[]>({
    queryKey: ["/api/rooms", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });

  const counts = rooms.reduce(
    (acc, room) => {
      if (room.effectiveStatus === "disponible") acc.disponible += 1;
      if (room.effectiveStatus === "occupee") acc.occupee += 1;
      if (room.effectiveStatus === "reservee") acc.reservee += 1;
      return acc;
    },
    { disponible: 0, occupee: 0, reservee: 0 }
  );

  return (
    <PolicyGuard policy={RoomsPolicy} action="canView">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{t("roomsManagement")}</h1>
            <p className="text-sm text-muted-foreground">{t("roomsManagementSubtitle")}</p>
          </div>
          {roomsPolicy.canCreate() && (
            <Link href="/salles/new">
              <Button data-testid="button-add-room">{t("addRoom")}</Button>
            </Link>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsAvailable")}</p>
              <p className="text-2xl font-bold text-foreground">{counts.disponible}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsOccupied")}</p>
              <p className="text-2xl font-bold text-foreground">{counts.occupee}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase">{t("roomsReserved")}</p>
              <p className="text-2xl font-bold text-foreground">{counts.reservee}</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground">{t("loading")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room) => (
              <Card key={room.id} data-testid={`card-room-${room.id}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{room.number}</p>
                      <p className="text-sm text-muted-foreground">{room.type}</p>
                    </div>
                    <Badge variant={statusBadgeVariant[room.effectiveStatus]}>
                      {t(`roomStatus${room.effectiveStatus === "occupee" ? "Occupee" : room.effectiveStatus === "reservee" ? "Reservee" : room.effectiveStatus === "en_maintenance" ? "EnMaintenance" : "Disponible"}`)}
                    </Badge>
                  </div>
                  <Link href={`/salles/${room.id}`}>
                    <Button variant="link" size="sm" className="h-auto p-0" data-testid={`link-room-${room.id}`}>
                      {t("viewRoomDetails")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PolicyGuard>
  );
}
```

- [ ] **Step 3: Build `new.tsx`**

Create `frontend/src/pages/salles/new.tsx`:

```tsx
import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { insertRoomSchema, type InsertRoom } from "@shared/schema";

const EQUIPMENT_OPTIONS = [
  "Lit médicalisé",
  "Moniteur de signes vitaux",
  "Oxygène mural",
  "Respirateur artificiel",
  "Défibrillateur",
  "Armoire à pharmacie",
];

export default function NewSalle() {
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const form = useForm<InsertRoom>({
    resolver: zodResolver(insertRoomSchema),
    defaultValues: {
      number: "",
      type: "",
      floor: "",
      capacity: 1,
      equipment: [],
      notes: "",
      status: "disponible",
      tenantId: currentTenant?.id ?? "",
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: InsertRoom) => {
      const response = await offlineApiRequest(
        "POST",
        "/api/rooms",
        { ...data, tenantId: currentTenant?.id },
        { collection: "rooms" }
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: t("success"), description: t("roomCreatedSuccessfully") });
      setLocation("/salles");
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToCreateRoom"), t("networkRequestFailed"));
    },
  });

  const equipment = form.watch("equipment") ?? [];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold text-foreground">{t("addRoom")}</h1>
      </div>

      <form
        onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))}
        className="bg-card border border-border rounded-2xl p-6 space-y-4 max-w-3xl"
        data-testid="form-room">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("roomNumberOrName")}</Label>
            <Input {...form.register("number")} data-testid="input-room-number" />
          </div>
          <div className="space-y-2">
            <Label>{t("roomType")}</Label>
            <Input {...form.register("type")} data-testid="input-room-type" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t("roomFloor")}</Label>
            <Input {...form.register("floor")} data-testid="input-room-floor" />
          </div>
          <div className="space-y-2">
            <Label>{t("roomCapacity")}</Label>
            <Input type="number" min={1} {...form.register("capacity", { valueAsNumber: true })} data-testid="input-room-capacity" />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("roomEquipment")}</Label>
          <div className="grid grid-cols-2 gap-2">
            {EQUIPMENT_OPTIONS.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={equipment.includes(item)}
                  onCheckedChange={(checked) => {
                    const next = checked ? [...equipment, item] : equipment.filter((e) => e !== item);
                    form.setValue("equipment", next);
                  }}
                  data-testid={`checkbox-equipment-${item}`}
                />
                {item}
              </label>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("roomNotes")}</Label>
          <Textarea {...form.register("notes")} data-testid="input-room-notes" />
        </div>

        <div className="space-y-2">
          <Label>{t("roomInitialStatus")}</Label>
          <Select value={form.watch("status")} onValueChange={(value) => form.setValue("status", value as InsertRoom["status"])}>
            <SelectTrigger data-testid="select-room-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="disponible">{t("roomStatusDisponible")}</SelectItem>
              <SelectItem value="en_maintenance">{t("roomStatusEnMaintenance")}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button type="button" variant="outline" onClick={() => setLocation("/salles")}>
            {t("cancel")}
          </Button>
          <Button type="submit" disabled={saveMutation.isPending} data-testid="button-create-room">
            {saveMutation.isPending ? t("saving") : t("createRoom")}
          </Button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Build `show.tsx`**

Create `frontend/src/pages/salles/show.tsx`:

```tsx
import React from "react";
import { useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "../../lib/i18n";
import { useTenant } from "../../contexts/TenantContext";
import { useToast } from "@/hooks/use-toast";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { showApiErrorToast } from "@/lib/errorHandler";
import { usePolicy } from "@/hooks/usePolicy";
import { RoomsPolicy } from "@/lib/policies/rooms.policy";
import type { Consultation, Room, RoomEffectiveStatus } from "@shared/schema";

type RoomDetail = Room & {
  effectiveStatus: RoomEffectiveStatus;
  currentConsultation: Consultation | null;
  upcomingConsultations: Consultation[];
  recentHistory: Consultation[];
};

export default function SalleDetails() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { currentTenant } = useTenant();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const roomsPolicy = usePolicy(RoomsPolicy);

  const { data: room, isLoading } = useQuery<RoomDetail>({
    queryKey: ["/api/rooms/detail", id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/detail/${id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!id,
  });

  const maintenanceMutation = useMutation({
    mutationFn: async (status: "disponible" | "en_maintenance") => {
      const response = await offlineApiRequest("PUT", `/api/rooms/${id}`, { status }, { collection: "rooms", entityId: id });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms/detail", id] });
      toast({ title: t("success"), description: t("roomUpdatedSuccessfully") });
    },
    onError: (error: unknown) => {
      void showApiErrorToast(toast, error, t("error"), t("failedToUpdateRoom"), t("networkRequestFailed"));
    },
  });

  if (isLoading || !room) {
    return <div className="p-6 text-muted-foreground">{t("loading")}</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-display font-bold text-foreground">{room.number}</h1>
          <Badge>{t(`roomStatus${room.effectiveStatus === "occupee" ? "Occupee" : room.effectiveStatus === "reservee" ? "Reservee" : room.effectiveStatus === "en_maintenance" ? "EnMaintenance" : "Disponible"}`)}</Badge>
        </div>
        {roomsPolicy.canUpdate() && (
          <Button
            variant="outline"
            onClick={() => maintenanceMutation.mutate(room.status === "en_maintenance" ? "disponible" : "en_maintenance")}
            disabled={maintenanceMutation.isPending}
            data-testid="button-toggle-maintenance">
            {room.status === "en_maintenance" ? t("markAvailable") : t("markInMaintenance")}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("currentOccupation")}</CardTitle>
          </CardHeader>
          <CardContent>
            {room.currentConsultation ? (
              <p className="text-sm text-foreground" data-testid="text-current-consultation">
                {room.currentConsultation.reason} — {new Date(room.currentConsultation.scheduledAt).toLocaleTimeString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("noCurrentOccupation")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("todaysReservations")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {room.upcomingConsultations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCurrentOccupation")}</p>
            ) : (
              room.upcomingConsultations.map((c) => (
                <div key={c.id} className="flex justify-between text-sm" data-testid={`row-upcoming-${c.id}`}>
                  <span>{new Date(c.scheduledAt).toLocaleTimeString()}</span>
                  <span className="text-muted-foreground">{c.reason}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>{t("recentUsageHistory")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {room.recentHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noCurrentOccupation")}</p>
            ) : (
              room.recentHistory.map((c) => (
                <div key={c.id} className="flex justify-between text-sm" data-testid={`row-history-${c.id}`}>
                  <span>{c.reason}</span>
                  <span className="text-muted-foreground">{new Date(c.scheduledAt).toLocaleDateString()}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS. `RoomEffectiveStatus` is already exported from `@shared/schema` on both sides (added in Task 1), so these pages' `import type { Room, RoomEffectiveStatus } from "@shared/schema";` resolves without any further schema changes.

- [ ] **Step 6: Manual verification**

Run the frontend + backend dev servers. As `admin`, navigate to `/salles`, click "Ajouter une salle", create a room, confirm it appears in the list with "Disponible" status and the KPI counts update. Click into it, confirm the detail page loads with empty occupation/planning/history, click "Marquer en maintenance", confirm the badge updates to "En maintenance".

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/salles/ frontend/src/App.tsx
git commit -m "feat: add /salles index, new, and show pages"
```

---

### Task 14: Wire `ConsultationFormFields.tsx`'s `roomId` to a real room picker

**Files:**
- Modify: `frontend/src/pages/consultations/ConsultationFormFields.tsx`

**Interfaces:**
- Consumes: `GET /api/rooms/:tenantId` (Task 7).
- Produces: consultations created/edited through this form now store a real `Room.id` in `roomId` when one is picked.

- [ ] **Step 1: Add the rooms query**

In `frontend/src/pages/consultations/ConsultationFormFields.tsx`, add the import `import type { Room } from "@shared/schema";` alongside the existing `@shared/schema` import, and add a new query next to the existing `patientResults` query:

```tsx
  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ["/api/rooms", currentTenant?.id],
    queryFn: async () => {
      const response = await fetch(`/api/rooms/${currentTenant?.id}`, { credentials: "include" });
      return response.json();
    },
    enabled: !!currentTenant?.id,
  });
```

- [ ] **Step 2: Replace the free-text `roomId` input with a `Select`**

Add the `Select`/`SelectContent`/`SelectItem`/`SelectTrigger`/`SelectValue` import from `@/components/ui/select` to the top of the file (not currently imported there). Replace this block:

```tsx
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("assignedRoom")}</Label>
            <div className="relative">
              <Input className={`${inputClass} pr-9`} placeholder="Salle de cardiologie 104" {...form.register("roomId")} />
              <ChevronDown className="w-3.5 h-3.5 text-[#64748b] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
```

with:

```tsx
          <div className="flex-1 flex flex-col gap-2">
            <Label className={labelClass}>{t("assignedRoom")}</Label>
            <Select value={form.watch("roomId") ?? ""} onValueChange={(value) => form.setValue("roomId", value)}>
              <SelectTrigger className={inputClass} data-testid="select-consultation-room">
                <SelectValue placeholder={t("noRoomAssigned")} />
              </SelectTrigger>
              <SelectContent>
                {rooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.number} — {room.type}
                  </SelectItem>
                ))}
                {form.watch("roomId") && !rooms.some((r) => r.id === form.watch("roomId")) && (
                  <SelectItem value={form.watch("roomId") as string} disabled>
                    {form.watch("roomId")}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
```

The trailing disabled `SelectItem` keeps a legacy free-text `roomId` (from a consultation created before this phase) visibly selected and readable, without silently clearing it or forcing a migration.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Create at least one room via `/salles/new`, then open `/consultations/new`, confirm the "Salle assignée" field is now a dropdown listing that room, select it, save, and confirm the created consultation's room shows correctly on `/consultations/:id`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/consultations/ConsultationFormFields.tsx
git commit -m "feat: wire consultation room field to real Room picker"
```

---

### Task 15: Extend `Staff.tsx` with the new fields and a profile photo

**Files:**
- Modify: `frontend/src/pages/Staff.tsx`
- Modify: `frontend/src/lib/i18n/*.ts` (whichever section already holds `firstName`/`lastName`/`role`-style keys — add the four new field labels there, or create a small addition to `navigation.ts`; use whichever existing section already contains `staff`-prefixed keys, confirmed present at `frontend/src/lib/i18n/audit.ts` or a dedicated staff section — locate it by grepping `grep -rn '"staff":' frontend/src/lib/i18n/` before editing, and add the new keys next to it)

**Interfaces:**
- Consumes: `PUT /api/staff/:id/photo`, `GET /api/staff/:id/photo-url` (Task 11), `service`/`specialty`/`matricule`/`fonction` fields on `InsertUser` (Task 11).

- [ ] **Step 1: Add the four new fields to the `useForm` defaults, `handleCloseModal`, and `handleEditStaff`**

In `frontend/src/pages/Staff.tsx`, add `service: "", specialty: "", matricule: "", fonction: ""` to the object literal in all three of these places (the `useForm({ defaultValues: {...} })` call, `handleCloseModal`'s `form.reset({...})`, and `handleEditStaff`'s `form.reset({...})` — the last one reads from `member.service ?? ""` etc. instead of a hardcoded empty string):

```tsx
    // useForm defaultValues and handleCloseModal's form.reset — both use empty strings:
    service: "",
    specialty: "",
    matricule: "",
    fonction: "",
```

```tsx
    // handleEditStaff's form.reset — reads from the existing member:
    service: member.service || "",
    specialty: member.specialty || "",
    matricule: member.matricule || "",
    fonction: member.fonction || "",
```

- [ ] **Step 2: Add the four input fields to the modal form**

In the modal's JSX, insert these four fields right after the existing `email` field block and before the `role` `Select` block:

```tsx
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="service" className="text-sm font-medium text-foreground">
            {t("staffService")}
          </Label>
          <Input id="service" {...form.register("service")} className="glass-input rounded-xl" data-testid="input-service" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="specialty" className="text-sm font-medium text-foreground">
            {t("staffSpecialty")}
          </Label>
          <Input id="specialty" {...form.register("specialty")} className="glass-input rounded-xl" data-testid="input-specialty" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="matricule" className="text-sm font-medium text-foreground">
            {t("staffMatricule")}
          </Label>
          <Input id="matricule" {...form.register("matricule")} className="glass-input rounded-xl" data-testid="input-matricule" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fonction" className="text-sm font-medium text-foreground">
            {t("staffFonction")}
          </Label>
          <Input id="fonction" {...form.register("fonction")} className="glass-input rounded-xl" data-testid="input-fonction" />
        </div>
      </div>
```

- [ ] **Step 3: Add the photo upload, deferred like the patient one**

Add near the top of the component (alongside the other `useState` calls): `const [pendingPhoto, setPendingPhoto] = useState<File | null>(null);` and this helper function above the component:

```tsx
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

Then, inside `saveStaffMutation`'s `mutationFn`, after the existing `const response = await offlineApiRequest(...)` / `return response.json();` lines for the non-local-install branch, capture the result and upload the pending photo before returning:

```tsx
    const response = await offlineApiRequest(
      method,
      url,
      {
        ...data,
        tenantId: currentTenant?.id,
      },
      { collection: "staff" }
    );

    const saved = await response.json();
    if (pendingPhoto && saved?.id) {
      const photoBase64 = await fileToBase64(pendingPhoto);
      await offlineApiRequest(
        "PUT",
        `/api/staff/${saved.id}/photo`,
        { photoBase64, contentType: pendingPhoto.type === "image/png" ? "image/png" : "image/jpeg" },
        { collection: "staff", entityId: saved.id }
      );
      setPendingPhoto(null);
    }
    return saved;
```

(Remove the old bare `return response.json();` line this replaces.) Add the upload input to the modal JSX, right after the `fonction` field block added in Step 2:

```tsx
      <div className="space-y-2">
        <Label className="text-sm font-medium text-foreground">{t("uploadPhoto")}</Label>
        <label className="glass-input rounded-xl h-24 flex flex-col items-center justify-center gap-1 cursor-pointer text-sm text-muted-foreground">
          <input
            type="file"
            accept="image/jpeg,image/png"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && setPendingPhoto(e.target.files[0])}
          />
          <span>{pendingPhoto ? pendingPhoto.name : t("dragDropPhoto")}</span>
        </label>
      </div>
```

- [ ] **Step 4: Add the i18n keys**

Add `staffService`, `staffSpecialty`, `staffMatricule`, `staffFonction` (en/fr) to whichever i18n section file already contains the `staff` nav label key (locate it with `grep -rn '"staff":' frontend/src/lib/i18n/`), following that file's existing `en`/`fr` structure exactly.

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual verification**

As `admin`, open `/staff`, click "Add new staff member", fill in the four new fields and attach a photo, save. Reopen the same member for editing, confirm the four fields are pre-filled with the saved values.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Staff.tsx frontend/src/lib/i18n/
git commit -m "feat: add service/specialty/matricule/fonction and photo upload to Staff form"
```

---

### Task 16: `AuditLogs.tsx` — KPI cards, Module filter, Patient concerné column

**Files:**
- Modify: `frontend/src/pages/AuditLogs.tsx`
- Modify: `frontend/src/hooks/useAuditLogs.ts` (confirm it passes through the already-existing `entityType` param — no change expected, verify only)

**Interfaces:**
- Consumes: the enriched `patientName` field from `GET /api/audit-logs/:tenantId` (Task 9).

- [ ] **Step 1: Add the KPI cards**

In `frontend/src/pages/AuditLogs.tsx`, insert a new `<div className="grid grid-cols-1 md:grid-cols-3 gap-4">...</div>` block right after the header `<div className="flex items-center justify-between">...</div>` and before the `{/* Filters */}` comment:

```tsx
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">{t("auditActionsToday")}</p>
            <p className="text-2xl font-bold text-foreground" data-testid="text-actions-today">
              {filteredLogs.filter((log) => new Date(log.createdAt).toDateString() === new Date().toDateString()).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">{t("auditActiveUsers")}</p>
            <p className="text-2xl font-bold text-foreground" data-testid="text-active-users">
              {new Set(filteredLogs.map((log) => log.userId)).size}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs font-medium text-muted-foreground uppercase">{t("auditSecurityAlerts")}</p>
            <p className="text-2xl font-bold text-foreground" data-testid="text-security-alerts">
              {filteredLogs.filter((log) => log.status === "FAILED").length}
            </p>
          </CardContent>
        </Card>
      </div>
```

- [ ] **Step 2: Surface the `Module` (entityType) filter as a `Select`**

Replace the existing free-text `entityType` `Input` filter:

```tsx
      <div>
        <label className="text-sm font-medium mb-2 block">
          {t("entityType")}
        </label>
        <Input
          placeholder={t("searchEntityType")}
          value={filters.entityType}
          onChange={(e) =>
            setFilters({ ...filters, entityType: e.target.value })
          }
        />
      </div>
```

with:

```tsx
      <div>
        <label className="text-sm font-medium mb-2 block">{t("entityType")}</label>
        <Select value={filters.entityType} onValueChange={(value) => setFilters({ ...filters, entityType: value })}>
          <SelectTrigger data-testid="select-audit-module">
            <SelectValue placeholder={t("allModules")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("allModules")}</SelectItem>
            <SelectItem value="patients">{t("patients")}</SelectItem>
            <SelectItem value="consultations">{t("consultations")}</SelectItem>
            <SelectItem value="queue">{t("queueTitle")}</SelectItem>
            <SelectItem value="lab-orders">{t("laboratoireTitle")}</SelectItem>
            <SelectItem value="prescriptions">{t("pharmacieTitle")}</SelectItem>
            <SelectItem value="staff">{t("staff")}</SelectItem>
            <SelectItem value="rooms">{t("salles")}</SelectItem>
            <SelectItem value="settings">{t("settings")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
```

- [ ] **Step 3: Add the "Patient concerné" column**

In the `TableHeader`, add a new `TableHead` right after the `entityId` column:

```tsx
            <TableHead>{t("entityId")}</TableHead>
            <TableHead>{t("patientConcerned")}</TableHead>
```

In the `TableBody`'s row rendering, add the matching `TableCell` right after the `entityId` cell:

```tsx
                <TableCell className="font-mono text-xs">
                  {log.entityId || "-"}
                </TableCell>
                <TableCell>
                  {(log as any).patientName ?? "-"}
                </TableCell>
```

Also update the `colSpan={8}` on the expanded-detail row to `colSpan={9}` (one more column has been added to the table).

- [ ] **Step 4: Add the new i18n keys**

Add `auditActionsToday`, `auditActiveUsers`, `auditSecurityAlerts`, `allModules`, `patientConcerned` (en/fr) to `frontend/src/lib/i18n/audit.ts`, matching its existing structure (it already holds `auditCreate`/`auditSuccess`/etc.).

- [ ] **Step 5: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Manual verification**

As `admin`, open `/audit-logs`, confirm the three KPI cards render real counts, the Module dropdown lists all entries including "Salles"/"Laboratoire"/"Pharmacie", and after creating a consultation elsewhere in the app, confirm a row appears here with the patient's name in the new column.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/AuditLogs.tsx frontend/src/lib/i18n/audit.ts
git commit -m "feat: add KPI cards, module filter, and patient column to Audit Logs"
```

---

### Task 17: Simplify `Register.tsx` to a bootstrap-only flow

**Files:**
- Modify: `frontend/src/pages/Register.tsx`

**Interfaces:**
- Consumes: `AuthContext.register` (existing, unchanged signature), `useAuth` (existing, to detect an already-authenticated session).

- [ ] **Step 1: Remove the tenant and role selectors, force role to `admin`**

In `frontend/src/pages/Register.tsx`:
- Remove the `tenants`/`tenantsLoading` `useQuery` block entirely (the `useQuery<Tenant[]>({ queryKey: ["/api/tenants"], ... })` block and its `Tenant` import).
- Remove `tenantId: ""` and `role: "cashier" as ...` from the initial `formData` state; replace with nothing for `tenantId` (bootstrap doesn't need to pick one — it's derived server-side from whichever tenant has zero users, but since `RegisterDto.tenantId` is still required by the existing frozen DTO, keep collecting it as a plain text field the operator types in during first-run setup, not a dropdown of every tenant in the system):

```tsx
  const [formData, setFormData] = useState({
    username: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    email: "",
    tenantId: "",
  });
```

- Remove the `if (!formData.tenantId) {...}` validation block's dependency on the removed `tenants` query (the validation itself — requiring a non-empty `tenantId` — stays, since it's still a required field on `RegisterDto`).
- In the `register({...})` call, hardcode `role: "admin"` instead of `formData.role`.
- Remove the entire `<div className="space-y-2"><Label htmlFor="tenantId">...<Select>...` block (the tenant dropdown) and replace it with a plain text `Input` for `tenantId`:

```tsx
            <div className="space-y-2">
              <Label htmlFor="tenantId">{t("tenantShop")}</Label>
              <Input
                id="tenantId"
                type="text"
                value={formData.tenantId}
                onChange={(e) => handleChange("tenantId", e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
```

- Remove the entire `<div className="space-y-2"><Label htmlFor="role">...<Select>...` block (the role dropdown) — there is no role choice on this bootstrap-only form any more.

- [ ] **Step 2: Redirect away if already authenticated**

Add the import `import { useAuth } from "@/contexts/AuthContext";` (if not already present via the existing `register` destructure — check whether `useAuth()` is already called; if so, just destructure `user` from the same call instead of adding a second one) and, near the top of the component body, add:

```tsx
  const { register, user } = useAuth();
```

```tsx
  if (user) {
    setLocation("/staff");
    return null;
  }
```

(Placed after the `useLocation()` call so `setLocation` is already defined, and before the `return (<div className="min-h-screen...`.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Manual verification**

Log out. Visit `/register`, confirm there is no tenant dropdown and no role dropdown, fill in a brand-new `tenantId` that has zero existing users, submit, confirm the account is created as `admin` and login works. Then, while logged in, navigate to `/register` directly and confirm it immediately redirects to `/staff`. Finally, attempt registering a second user against a tenant that already has the one just created, while logged out — confirm it now fails with a 403 (Task 10's hardening), matching the intent of this simplification.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Register.tsx
git commit -m "feat: simplify Register to a bootstrap-only flow, redirect if already authenticated"
```

---

### Task 18: Manual verification of the full Phase 5 loop

**Files:** none (verification only)

- [ ] **Step 1: Full backend test suite**

Run: `cd backend && npx jest`
Expected: PASS, no regressions in any existing suite (patients, consultations, staff, auth, audit, lab-orders, prescriptions, queue).

- [ ] **Step 2: Full frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: i18n completeness**

Run: `cd frontend && npx vitest run src/lib/i18nCompleteness.test.ts`
Expected: PASS — every key added across Tasks 12, 15, 16 exists in both `en` and `fr`.

- [ ] **Step 4: Manual end-to-end walkthrough**

Run both dev servers. As `admin`:
1. Create two rooms via `/salles/new` (one "Cardiologie", one "Pédiatrie"). Confirm both show "Disponible" on `/salles`.
2. Create a patient and a consultation via the existing flow, assigning it to the "Cardiologie" room through the now-real `Select` (Task 14). Confirm `/salles` now shows that room as "Réservée" (or "Occupée" once the consultation is moved to `en_cours` via the existing queue/pré-consultation flow — try both).
3. Open the room's detail page, confirm the consultation appears in "Planning des réservations" (or "Occupation actuelle" once `en_cours`).
4. Toggle "Marquer en maintenance" on the second, unused room; confirm its badge updates and it no longer counts as "Disponible" in the KPI row.
5. Open `/staff`, create a new staff member with a service/specialty/matricule/fonction and a photo; edit them back open and confirm the values persisted.
6. Open `/audit-logs`, confirm entries exist for the consultation creation with a resolved "Patient concerné" name, and for the room/staff writes with `entityType` "rooms"/"staff" (not "unknown").
7. Log out, visit `/register`, confirm no tenant/role dropdowns remain; attempt to register into the tenant that already has staff — confirm it's rejected while logged out, and succeeds when tried through `/staff` while logged in as that tenant's admin instead.
8. Confirm no role other than `admin`/`manager` can reach `/salles/new` or see the "Add a room" button (test by switching to a `medecin`/`infirmier` session if one exists), and that `laboratoire`/`pharmacien`/`cashier` cannot see the "Salles" nav item at all.

Expected: the full loop works without console errors, matching the design spec's §4-§6 behavior end to end.

- [ ] **Step 5: Report to the user**

Summarize what was built and ask whether/how to commit any steps that weren't already committed task-by-task (per this project's CLAUDE.md, commits require explicit user go-ahead each time).
