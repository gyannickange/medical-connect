# Personal Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify a specific staff member personally — via a bell-icon inbox and a native OS toast — when their patient arrives/is called in the queue, or when a lab result they ordered is ready, including while the desktop app window is closed (but the workstation is on).

**Architecture:** A new `AppNotification` CouchDB document type is written by the backend at two existing trigger points (`QueueRepository.appendEvent`, `LabOrdersRepository.update`) and rides the app's *existing* continuous (`live: true`) CouchDB↔PouchDB replication down to every caisse — no new transport. A REST API (`NotificationsModule`) backs a bell-icon dropdown via react-query. A separate lightweight PouchDB `changes()` listener on the frontend turns a newly-replicated notification doc into an instant native OS toast. A new Tauri tray icon + close-to-hide behavior keeps the sync engine (and thus this feature) running with the window closed.

**Tech Stack:** NestJS + `nano` (CouchDB) on the backend; React + `@tanstack/react-query` + PouchDB (`pouchdb-browser`) + Tauri v2 (`tauri-plugin-notification`, tray) on the frontend.

**Spec:** `docs/superpowers/specs/2026-09-03-medical-connect-push-notifications-design.md`

## Global Constraints

- No third-party push service (OneSignal/FCM/APNs/WNS) — explicitly ruled out in the spec.
- Every notification read/write is scoped from `req.user.tenantId`/`req.user.id`, never a client-supplied value.
- All new user-facing strings go through `t("key")`, added to **both** `en` and `fr` in a new `frontend/src/lib/i18n/notifications.ts` module.
- `backend/src/shared/schema.ts` and `frontend/shared/schema.ts` are separate, manually-kept-in-sync files — both must be edited for shared types. The frontend mirror uses `string` for date fields (not `Date`), matching its existing convention (see `AuditLog.createdAt` there).
- Backend testing convention actually used by the two modules this touches (`queue`, `lab-orders`) is **repository-level** specs with plain Jest-mocked `nano`/`CouchDBService` (`new Repository(mockDep as any, ...)`), not NestJS `TestingModule` — match this, not a `*.service.spec.ts`.
- Frontend testing convention: business logic in plain, fully-unit-tested `lib/` functions; thin React hooks/components that just glue tested logic together are left untested (no jsdom/RTL in this project).
- No raw HTML elements where a `frontend/src/components/ui/` equivalent exists (`Button`, `Badge`, `DropdownMenu*`, etc.).

---

### Task 1: Shared `AppNotification` types

**Files:**
- Modify: `backend/src/shared/schema.ts` (append after the `QueueItem` line, ~line 239)
- Modify: `frontend/shared/schema.ts` (append after the `AuditLog` interface line)

**Interfaces:**
- Produces: `NotificationType`, `NotificationData`, `NotificationRelatedEntity`, `AppNotification`, `InsertAppNotification` (backend only — frontend has no `Insert*` since it never constructs one) — used by every later task.

- [ ] **Step 1: Add the backend types**

In `backend/src/shared/schema.ts`, immediately after the line starting `export interface QueueItem { ... }`, add:

```ts

export type NotificationType = "queue_patient_ready" | "lab_result_ready";
export interface NotificationData { consultationNumber?: string; examNames?: string }
export interface NotificationRelatedEntity { type: "consultation" | "labOrder"; id: string }
export interface AppNotification { id: string; tenantId: string; recipientUserId: string; notificationType: NotificationType; data: NotificationData; relatedEntity: NotificationRelatedEntity; createdAt: Date; readAt: Date | null }
export interface InsertAppNotification { id?: string; tenantId: string; recipientUserId: string; notificationType: NotificationType; data: NotificationData; relatedEntity: NotificationRelatedEntity }
```

- [ ] **Step 2: Add the frontend mirror**

In `frontend/shared/schema.ts`, immediately after the line starting `export interface AuditLog { ... }`, add (note `string` dates, matching this file's existing convention, not `Date`):

```ts

export type NotificationType = "queue_patient_ready" | "lab_result_ready";
export interface NotificationData { consultationNumber?: string; examNames?: string }
export interface NotificationRelatedEntity { type: "consultation" | "labOrder"; id: string }
export interface AppNotification { id: string; tenantId: string; recipientUserId: string; notificationType: NotificationType; data: NotificationData; relatedEntity: NotificationRelatedEntity; createdAt: string; readAt: string | null }
```

- [ ] **Step 3: Typecheck both packages**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: no new errors (these are additive types, nothing consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat(notifications): add AppNotification shared types"
```

---

### Task 2: `NotificationsRepository` (CouchDB read/write)

**Files:**
- Create: `backend/src/modules/notifications/notifications.repository.ts`
- Create: `backend/src/modules/notifications/notifications.repository.module.ts`
- Create: `backend/src/modules/notifications/notifications.repository.spec.ts`

**Interfaces:**
- Consumes: `CouchDBService.getDatabase(name)`, `CouchDBService.ensureIndex(dbName, indexName, fields)` (`backend/src/database/couchdb.service.ts`); `couchDocumentId`, `publicDocumentId`, `tenantDatabaseName` (`backend/src/database/couchdb-naming.ts`); `AppNotification`, `InsertAppNotification` (Task 1).
- Produces: `NotificationsRepository` with `notifyUser(data: InsertAppNotification): Promise<AppNotification>`, `findForRecipient(tenantId: string, recipientUserId: string, limit?: number): Promise<AppNotification[]>`, `markRead(id: string, tenantId: string, recipientUserId: string): Promise<AppNotification>` — consumed by Task 3 (service), Task 4 (`QueueRepository`), Task 5 (`LabOrdersRepository`).

- [ ] **Step 1: Write the repository**

Create `backend/src/modules/notifications/notifications.repository.ts`:

```ts
import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { DocumentScope } from "nano";
import { CouchDBService } from "../../database/couchdb.service";
import type { AppNotification, InsertAppNotification } from "@shared/schema";
import { couchDocumentId, publicDocumentId, tenantDatabaseName } from "../../database/couchdb-naming";

@Injectable()
export class NotificationsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async notifyUser(data: InsertAppNotification): Promise<AppNotification> {
    const id = data.id ?? randomUUID();
    const now = new Date();
    const db = await this.database(data.tenantId);

    const notification: AppNotification = {
      id,
      tenantId: data.tenantId,
      recipientUserId: data.recipientUserId,
      notificationType: data.notificationType,
      data: data.data,
      relatedEntity: data.relatedEntity,
      createdAt: now,
      readAt: null,
    };

    try {
      await db.insert({ ...this.toDocument(notification), _id: couchDocumentId("notification", id) } as any);
      return notification;
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  async findForRecipient(tenantId: string, recipientUserId: string, limit = 50): Promise<AppNotification[]> {
    const dbName = this.databaseName(tenantId);
    const db = await this.database(tenantId);
    await this.couchDBService.ensureIndex(dbName, "notifications_by_tenant_recipient_created", ["tenantId", "type", "recipientUserId", "createdAt"]);
    const result = await db.find({
      selector: { type: "notification", tenantId, recipientUserId },
      sort: [{ createdAt: "desc" }],
      limit,
    });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }

  async markRead(id: string, tenantId: string, recipientUserId: string): Promise<AppNotification> {
    const db = await this.database(tenantId);
    const current = await this.findExisting(db, id);
    if (!current || current.type !== "notification" || current.tenantId !== tenantId || current.recipientUserId !== recipientUserId) {
      throw new NotFoundException("Notification not found");
    }

    const updated = { ...current, readAt: new Date().toISOString() };
    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }

  private async findExisting(db: DocumentScope<unknown>, id: string): Promise<Record<string, any> | null> {
    try {
      return (await db.get(couchDocumentId("notification", id))) as unknown as Record<string, any>;
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

  private hydrate(doc: Record<string, any>): AppNotification {
    return {
      ...doc,
      id: doc.id ?? publicDocumentId(doc._id, "notification"),
      createdAt: new Date(doc.createdAt),
      readAt: doc.readAt ? new Date(doc.readAt) : null,
    } as AppNotification;
  }

  private toDocument(notification: AppNotification) {
    return {
      ...notification,
      type: "notification" as const,
      createdAt: notification.createdAt.toISOString(),
      readAt: notification.readAt ? notification.readAt.toISOString() : null,
    };
  }
}
```

- [ ] **Step 2: Write the repository module**

Create `backend/src/modules/notifications/notifications.repository.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { NotificationsRepository } from "./notifications.repository";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [CouchDBModule],
  providers: [NotificationsRepository],
  exports: [NotificationsRepository],
})
export class NotificationsRepositoryModule {}
```

- [ ] **Step 3: Write the failing/passing repository spec**

Create `backend/src/modules/notifications/notifications.repository.spec.ts`:

```ts
import { NotFoundException } from "@nestjs/common";
import { NotificationsRepository } from "./notifications.repository";

describe("NotificationsRepository", () => {
  describe("notifyUser", () => {
    it("inserts a notification document for the recipient", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      const result = await repository.notifyUser({
        tenantId: "tenant-1",
        recipientUserId: "doctor-1",
        notificationType: "queue_patient_ready",
        data: { consultationNumber: "C-2026-0001" },
        relatedEntity: { type: "consultation", id: "c1" },
      });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "notification",
          tenantId: "tenant-1",
          recipientUserId: "doctor-1",
          notificationType: "queue_patient_ready",
          readAt: null,
        })
      );
      expect(result.readAt).toBeNull();
      expect(result.recipientUserId).toBe("doctor-1");
    });
  });

  describe("findForRecipient", () => {
    it("queries by tenant and recipient, sorted newest-first", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new NotificationsRepository(couchDBService as any);

      await repository.findForRecipient("tenant-1", "doctor-1");

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: { type: "notification", tenantId: "tenant-1", recipientUserId: "doctor-1" },
          sort: [{ createdAt: "desc" }],
          limit: 50,
        })
      );
    });
  });

  describe("markRead", () => {
    it("sets readAt on the recipient's own notification", async () => {
      const existing = {
        _id: "notification:n1",
        _rev: "1-a",
        id: "n1",
        type: "notification",
        tenantId: "tenant-1",
        recipientUserId: "doctor-1",
        notificationType: "lab_result_ready",
        data: { examNames: "NFS" },
        relatedEntity: { type: "labOrder", id: "lo1" },
        createdAt: "2026-09-03T08:00:00.000Z",
        readAt: null,
      };
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      const result = await repository.markRead("n1", "tenant-1", "doctor-1");

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ readAt: expect.any(String) }));
      expect(result.readAt).toBeInstanceOf(Date);
    });

    it("throws NotFoundException when the notification belongs to a different recipient", async () => {
      const existing = { _id: "notification:n1", type: "notification", tenantId: "tenant-1", recipientUserId: "other-doctor" };
      const db = { get: jest.fn().mockResolvedValue(existing) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      await expect(repository.markRead("n1", "tenant-1", "doctor-1")).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when the notification does not exist", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const repository = new NotificationsRepository(couchDBService as any);

      await expect(repository.markRead("missing", "tenant-1", "doctor-1")).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 4: Run the spec**

Run: `cd backend && npx jest src/modules/notifications/notifications.repository.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/notifications/notifications.repository.ts backend/src/modules/notifications/notifications.repository.module.ts backend/src/modules/notifications/notifications.repository.spec.ts
git commit -m "feat(notifications): add NotificationsRepository"
```

---

### Task 3: `NotificationsModule` (REST API)

**Files:**
- Create: `backend/src/modules/notifications/notifications.service.ts`
- Create: `backend/src/modules/notifications/notifications.policy.ts`
- Create: `backend/src/modules/notifications/notifications.controller.ts`
- Create: `backend/src/modules/notifications/notifications.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `NotificationsRepository` (Task 2); `JwtAuthGuard` (`../auth/jwt-auth.guard`), `PolicyGuard` (`../auth/guards/policy.guard`), `CheckPolicy` (`../auth/decorators/check-policy.decorator`), `BasePolicy` (`../auth/policies/base.policy`), `AuthModule` (`../auth/auth.module`) — all existing.
- Produces: `GET /api/notifications` (latest 50 for the authenticated user, newest-first), `PATCH /api/notifications/:id/read` — consumed by Task 8 (`useNotifications` frontend hook).

- [ ] **Step 1: Write the service**

Create `backend/src/modules/notifications/notifications.service.ts`:

```ts
import { Injectable } from "@nestjs/common";
import type { InsertAppNotification } from "@shared/schema";
import { NotificationsRepository } from "./notifications.repository";

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsRepository: NotificationsRepository) {}

  notifyUser(data: InsertAppNotification) {
    return this.notificationsRepository.notifyUser(data);
  }

  findForRecipient(tenantId: string, recipientUserId: string) {
    return this.notificationsRepository.findForRecipient(tenantId, recipientUserId);
  }

  markRead(id: string, tenantId: string, recipientUserId: string) {
    return this.notificationsRepository.markRead(id, tenantId, recipientUserId);
  }
}
```

- [ ] **Step 2: Write the policy**

Create `backend/src/modules/notifications/notifications.policy.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

// Ownership-based, not role-based, unlike every other policy in this codebase:
// any authenticated user may view/mark-read their OWN notifications. The
// actual scoping happens in NotificationsRepository (filtering by
// recipientUserId), the same way tenant scoping happens by which database
// is opened rather than by a role check here.
@Injectable()
export class NotificationsPolicy extends BasePolicy {
  view(): boolean {
    return Boolean(this.user);
  }

  markRead(): boolean {
    return Boolean(this.user);
  }
}
```

- [ ] **Step 3: Write the controller**

Create `backend/src/modules/notifications/notifications.controller.ts`:

```ts
import { Controller, Get, Patch, Param, Request, UseGuards, ForbiddenException } from "@nestjs/common";
import { NotificationsService } from "./notifications.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { NotificationsPolicy } from "./notifications.policy";

@Controller("api/notifications")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @CheckPolicy(NotificationsPolicy, "view")
  async list(@Request() req: any) {
    return this.notificationsService.findForRecipient(this.tenantId(req), req.user.id);
  }

  @Patch(":id/read")
  @CheckPolicy(NotificationsPolicy, "markRead")
  async markRead(@Param("id") id: string, @Request() req: any) {
    return this.notificationsService.markRead(id, this.tenantId(req), req.user.id);
  }

  private tenantId(req: any): string {
    const tenantId = req?.user?.tenantId;
    if (!tenantId) throw new ForbiddenException("Authenticated tenant is required");
    return tenantId;
  }
}
```

- [ ] **Step 4: Write the module**

Create `backend/src/modules/notifications/notifications.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationsPolicy } from "./notifications.policy";
import { AuthModule } from "../auth/auth.module";
import { NotificationsRepositoryModule } from "./notifications.repository.module";

@Module({
  imports: [AuthModule, NotificationsRepositoryModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsPolicy],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 5: Register the module in `app.module.ts`**

In `backend/src/app.module.ts`, add the import statement after the `PlatformModule` import:

```ts
import { NotificationsModule } from "./modules/notifications/notifications.module";
```

And add `NotificationsModule` to the `imports` array after `PlatformModule`:

```ts
    PlatformModule,
    NotificationsModule,
```

- [ ] **Step 6: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/notifications/notifications.service.ts backend/src/modules/notifications/notifications.policy.ts backend/src/modules/notifications/notifications.controller.ts backend/src/modules/notifications/notifications.module.ts backend/src/app.module.ts
git commit -m "feat(notifications): add REST API for listing and marking notifications read"
```

---

### Task 4: Trigger notifications from the queue ("arrived"/"called")

**Files:**
- Modify: `backend/src/modules/queue/queue.repository.ts`
- Modify: `backend/src/modules/queue/queue.module.ts`
- Modify: `backend/src/modules/queue/queue.repository.spec.ts` (full replacement, shown below)

**Interfaces:**
- Consumes: `NotificationsRepository.notifyUser` (Task 2); `Consultation.assignedDoctorId`/`Consultation.number` (existing, via `consultationsRepository.findExistingForCascade`, already called in `appendEvent`).

- [ ] **Step 1: Wire `NotificationsRepository` into `QueueRepository`**

In `backend/src/modules/queue/queue.repository.ts`, add the import:

```ts
import { NotificationsRepository } from "../notifications/notifications.repository";
```

Change the constructor:

```ts
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly consultationsRepository: ConsultationsRepository,
    private readonly notificationsRepository: NotificationsRepository
  ) {}
```

Replace the `appendEvent` method body (the `try { await db.insert(...) ... }` through `return event;`) with:

```ts
    try {
      await db.insert({ ...event, type: "queue_event" as const, occurredAt: now.toISOString(), _id: couchDocumentId("queue_event", id) } as any);
    } catch (error) {
      throw this.unavailable(error);
    }

    if ((event.eventType === "arrived" || event.eventType === "called") && consultation.assignedDoctorId) {
      await this.notificationsRepository.notifyUser({
        tenantId: data.tenantId,
        recipientUserId: consultation.assignedDoctorId,
        notificationType: "queue_patient_ready",
        data: consultation.number ? { consultationNumber: consultation.number } : {},
        relatedEntity: { type: "consultation", id: data.consultationId },
      });
    }

    return event;
```

- [ ] **Step 2: Wire the module import**

In `backend/src/modules/queue/queue.module.ts`, add the import:

```ts
import { NotificationsRepositoryModule } from "../notifications/notifications.repository.module";
```

Add `NotificationsRepositoryModule` to the `imports` array:

```ts
  imports: [AuthModule, CouchDBModule, ConsultationsRepositoryModule, NotificationsRepositoryModule],
```

- [ ] **Step 3: Replace the repository spec with the updated version**

Replace the full contents of `backend/src/modules/queue/queue.repository.spec.ts` with:

```ts
import { NotFoundException } from "@nestjs/common";
import { QueueRepository } from "./queue.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1", assignedDoctorId: "doctor-1", number: "C-2026-0001" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

function notificationsRepositoryStub() {
  return { notifyUser: jest.fn().mockResolvedValue(undefined) };
}

describe("QueueRepository", () => {
  describe("appendEvent", () => {
    it("validates the consultation exists in the tenant and inserts the event", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new QueueRepository(couchDBService as any, consultationsRepository as any, notificationsRepositoryStub() as any);

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
      const repository = new QueueRepository(couchDBService as any, consultationsRepoStub(null) as any, notificationsRepositoryStub() as any);

      await expect(
        repository.appendEvent({ consultationId: "missing", patientId: "p1", eventType: "arrived", actorUserId: "u1", tenantId: "tenant-1" } as any)
      ).rejects.toThrow(NotFoundException);
    });

    it("notifies the assigned doctor when the patient arrives", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const notificationsRepository = notificationsRepositoryStub();
      const repository = new QueueRepository(couchDBService as any, consultationsRepository as any, notificationsRepository as any);

      await repository.appendEvent({ consultationId: "c1", patientId: "p1", eventType: "arrived", actorUserId: "u1", tenantId: "tenant-1" } as any);

      expect(notificationsRepository.notifyUser).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        recipientUserId: "doctor-1",
        notificationType: "queue_patient_ready",
        data: { consultationNumber: "C-2026-0001" },
        relatedEntity: { type: "consultation", id: "c1" },
      });
    });

    it("notifies the assigned doctor when the patient is called", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const notificationsRepository = notificationsRepositoryStub();
      const repository = new QueueRepository(couchDBService as any, consultationsRepository as any, notificationsRepository as any);

      await repository.appendEvent({ consultationId: "c1", patientId: "p1", eventType: "called", actorUserId: "u1", tenantId: "tenant-1" } as any);

      expect(notificationsRepository.notifyUser).toHaveBeenCalledWith(expect.objectContaining({ notificationType: "queue_patient_ready" }));
    });

    it("does not notify for event types other than arrived/called", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const notificationsRepository = notificationsRepositoryStub();
      const repository = new QueueRepository(couchDBService as any, consultationsRepository as any, notificationsRepository as any);

      await repository.appendEvent({ consultationId: "c1", patientId: "p1", eventType: "waiting", actorUserId: "u1", tenantId: "tenant-1" } as any);

      expect(notificationsRepository.notifyUser).not.toHaveBeenCalled();
    });
  });

  describe("findById", () => {
    it("returns a tenant-owned event by its stable id", async () => {
      const db = {
        get: jest.fn().mockResolvedValue({
          _id: "queue_event:event-1",
          id: "event-1",
          type: "queue_event",
          tenantId: "tenant-1",
          consultationId: "c1",
          patientId: "p1",
          eventType: "waiting",
          payload: null,
          actorUserId: "u1",
          actorDeviceId: null,
          occurredAt: "2026-08-27T08:00:00.000Z",
        }),
      };
      const repository = new QueueRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        consultationsRepoStub() as any,
        notificationsRepositoryStub() as any
      );

      const result = await repository.findById("event-1", "tenant-1");

      expect(db.get).toHaveBeenCalledWith("queue_event:event-1");
      expect(result).toEqual(expect.objectContaining({ id: "event-1", eventType: "waiting" }));
      expect(result.occurredAt).toEqual(new Date("2026-08-27T08:00:00.000Z"));
    });

    it("returns undefined when the event is absent or belongs to another tenant", async () => {
      const db = {
        get: jest
          .fn()
          .mockRejectedValueOnce({ statusCode: 404 })
          .mockResolvedValueOnce({ type: "queue_event", tenantId: "tenant-2" }),
      };
      const repository = new QueueRepository(
        { getDatabase: jest.fn().mockResolvedValue(db) } as any,
        consultationsRepoStub() as any,
        notificationsRepositoryStub() as any
      );

      await expect(repository.findById("missing", "tenant-1")).resolves.toBeUndefined();
      await expect(repository.findById("other-tenant", "tenant-1")).resolves.toBeUndefined();
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
      const repository = new QueueRepository(couchDBService as any, consultationsRepoStub() as any, notificationsRepositoryStub() as any);

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

- [ ] **Step 4: Run the spec**

Run: `cd backend && npx jest src/modules/queue/queue.repository.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Typecheck (catches any other `new QueueRepository(...)` call sites, e.g. `queue.repository.module.ts` if one exists)**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors. If another file constructs `QueueRepository` directly (unlikely — it's normally instantiated by Nest's DI container via `QueueModule`'s `providers` array), update that call site the same way.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/queue/queue.repository.ts backend/src/modules/queue/queue.module.ts backend/src/modules/queue/queue.repository.spec.ts
git commit -m "feat(notifications): notify the assigned doctor when their patient arrives or is called"
```

---

### Task 5: Trigger notifications from lab results ("termine")

**Files:**
- Modify: `backend/src/modules/lab-orders/lab-orders.repository.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.repository.module.ts`
- Modify: `backend/src/modules/lab-orders/lab-orders.repository.spec.ts` (full replacement, shown below)

**Interfaces:**
- Consumes: `NotificationsRepository.notifyUser` (Task 2); `LabOrder.requestedByUserId`/`LabOrder.examLines` (existing).

- [ ] **Step 1: Wire `NotificationsRepository` into `LabOrdersRepository`**

In `backend/src/modules/lab-orders/lab-orders.repository.ts`, add the import:

```ts
import { NotificationsRepository } from "../notifications/notifications.repository";
```

Change the constructor:

```ts
  constructor(
    private readonly couchDBService: CouchDBService,
    private readonly consultationsRepository: ConsultationsRepository,
    private readonly s3Service: S3Service,
    private readonly notificationsRepository: NotificationsRepository
  ) {}
```

In the `update` method, replace:

```ts
    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }
    return this.hydrate(updated);
  }
```

with:

```ts
    try {
      await db.insert(updated as any);
    } catch (error) {
      throw this.unavailable(error);
    }

    if (enteringTermine) {
      await this.notificationsRepository.notifyUser({
        tenantId,
        recipientUserId: current.requestedByUserId,
        notificationType: "lab_result_ready",
        data: { examNames: (current.examLines ?? []).map((line: any) => line.examName).join(", ") },
        relatedEntity: { type: "labOrder", id },
      });
    }

    return this.hydrate(updated);
  }
```

(This is the `update` method only — `create`, `recordFollowUp`, `addAttachment`, `getAttachmentUrl`, `findById`, `findByTenant` are unchanged.)

- [ ] **Step 2: Wire the module import**

In `backend/src/modules/lab-orders/lab-orders.repository.module.ts`, add the import:

```ts
import { NotificationsRepositoryModule } from "../notifications/notifications.repository.module";
```

Add `NotificationsRepositoryModule` to the `imports` array:

```ts
  imports: [CouchDBModule, ConsultationsRepositoryModule, S3Module, NotificationsRepositoryModule],
```

- [ ] **Step 3: Replace the repository spec with the updated version**

Replace the full contents of `backend/src/modules/lab-orders/lab-orders.repository.spec.ts` with:

```ts
import { NotFoundException } from "@nestjs/common";
import { LabOrdersRepository } from "./lab-orders.repository";

function consultationsRepoStub(consultation: any = { type: "consultation", tenantId: "tenant-1", patientId: "patient-1" }) {
  return { findExistingForCascade: jest.fn().mockResolvedValue(consultation) };
}

function notificationsRepositoryStub() {
  return { notifyUser: jest.fn().mockResolvedValue(undefined) };
}

describe("LabOrdersRepository", () => {
  describe("create", () => {
    it("validates the consultation exists in the tenant and creates the lab order", async () => {
      const db = { insert: jest.fn().mockResolvedValue({ ok: true, rev: "1-a" }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
      const consultationsRepository = consultationsRepoStub();
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepository as any, {} as any, notificationsRepositoryStub() as any);

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
          examLines: [
            { examName: "NFS", resultText: null, parameters: [] },
            { examName: "Créatinine", resultText: null, parameters: [] },
          ],
        })
      );
      expect(result.status).toBe("demande");
      expect(result.patientId).toBe("patient-1");
    });

    it("throws NotFoundException when the consultation does not exist in this tenant", async () => {
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue({ insert: jest.fn() }) };
      const consultationsRepository = consultationsRepoStub(null);
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepository as any, {} as any, notificationsRepositoryStub() as any);

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
      const notificationsRepository = notificationsRepositoryStub();
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any, {} as any, notificationsRepository as any);

      const result = await repository.update("lo1", "tenant-1", { status: "en_cours" }, "labtech-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: expect.any(String) })
      );
      expect(result.takenInChargeAt).toBeInstanceOf(Date);
      expect(notificationsRepository.notifyUser).not.toHaveBeenCalled();
    });

    it("sets validatedByUserId/At, stores results, and notifies the requesting doctor when status transitions to termine", async () => {
      const existing = existingLabOrder({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" });
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const notificationsRepository = notificationsRepositoryStub();
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any, {} as any, notificationsRepository as any);

      const examLines = [{ examName: "NFS", resultText: "Hémoglobine 13.2 g/dL, normale", parameters: [] }];
      const result = await repository.update("lo1", "tenant-1", { status: "termine", examLines }, "labtech-1");

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ status: "termine", examLines, validatedByUserId: "labtech-1", validatedAt: expect.any(String) })
      );
      expect(result.validatedAt).toBeInstanceOf(Date);
      expect(notificationsRepository.notifyUser).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        recipientUserId: "doctor-1",
        notificationType: "lab_result_ready",
        data: { examNames: "NFS" },
        relatedEntity: { type: "labOrder", id: "lo1" },
      });
    });

    it("does not re-stamp takenInChargeAt when already en_cours", async () => {
      const existing = existingLabOrder({ status: "en_cours", takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" });
      const db = { get: jest.fn().mockResolvedValue(existing), insert: jest.fn().mockResolvedValue({ ok: true }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any, {} as any, notificationsRepositoryStub() as any);

      await repository.update("lo1", "tenant-1", { status: "en_cours" }, "labtech-2");

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ takenInChargeByUserId: "labtech-1", takenInChargeAt: "2026-08-27T09:05:00.000Z" }));
    });

    it("throws NotFoundException when the lab order does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any, {} as any, notificationsRepositoryStub() as any);

      await expect(repository.update("missing", "tenant-1", { status: "en_cours" }, "labtech-1")).rejects.toThrow(NotFoundException);
    });
  });

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
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any, {} as any, notificationsRepositoryStub() as any);

      const result = await repository.recordFollowUp("lo1", "tenant-1", { followUpAction: "contacter_patient", followUpNote: "Rappeler demain" });

      expect(db.insert).toHaveBeenCalledWith(
        expect.objectContaining({ followUpAction: "contacter_patient", followUpNote: "Rappeler demain", followUpRecordedAt: expect.any(String) })
      );
      expect(result.followUpRecordedAt).toBeInstanceOf(Date);
    });

    it("throws NotFoundException when the lab order does not exist in this tenant", async () => {
      const db = { get: jest.fn().mockRejectedValue({ statusCode: 404 }) };
      const repository = new LabOrdersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, consultationsRepoStub() as any, {} as any, notificationsRepositoryStub() as any);

      await expect(repository.recordFollowUp("missing", "tenant-1", { followUpAction: "aucune_action" })).rejects.toThrow(NotFoundException);
    });
  });

  describe("findByTenant", () => {
    it("filters by consultationId, status, and priority when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepoStub() as any, {} as any, notificationsRepositoryStub() as any);

      await repository.findByTenant("tenant-1", { consultationId: "c1", status: "demande", priority: "urgent" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({
          selector: expect.objectContaining({ type: "lab_order", tenantId: "tenant-1", consultationId: "c1", status: "demande", priority: "urgent" }),
        })
      );
    });

    it("filters by patientId when provided", async () => {
      const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
      const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db), ensureIndex: jest.fn().mockResolvedValue(undefined) };
      const repository = new LabOrdersRepository(couchDBService as any, consultationsRepoStub() as any, {} as any, notificationsRepositoryStub() as any);

      await repository.findByTenant("tenant-1", { patientId: "patient-1" });

      expect(db.find).toHaveBeenCalledWith(
        expect.objectContaining({ selector: expect.objectContaining({ type: "lab_order", tenantId: "tenant-1", patientId: "patient-1" }) })
      );
    });
  });
});
```

- [ ] **Step 4: Run the spec**

Run: `cd backend && npx jest src/modules/lab-orders/lab-orders.repository.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: all tests PASS (this catches any other place `LabOrdersRepository`/`QueueRepository` might be constructed directly, e.g. `lab-orders.policy.spec.ts` does not construct the repository so should be unaffected).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/lab-orders/lab-orders.repository.ts backend/src/modules/lab-orders/lab-orders.repository.module.ts backend/src/modules/lab-orders/lab-orders.repository.spec.ts
git commit -m "feat(notifications): notify the requesting doctor when lab results are ready"
```

---

### Task 6: Frontend i18n strings

**Files:**
- Create: `frontend/src/lib/i18n/notifications.ts`
- Modify: `frontend/src/lib/i18n/index.ts`

**Interfaces:**
- Produces: translation keys `notifications`, `noNotifications`, `notificationQueuePatientReadyTitle`, `notificationQueuePatientReadyBody`, `notificationLabResultReadyTitle`, `notificationLabResultReadyBody`, `notificationSoundLabel`, `notificationSoundDefault`, `notificationSoundChime`, `notificationSoundPing`, `notificationSoundNone` — consumed by Task 7 (`lib/notifications.ts`), Task 8 (`NotificationBell`), and Task 10 (sound preset picker).

- [ ] **Step 1: Write the i18n module**

Create `frontend/src/lib/i18n/notifications.ts`:

```ts
import type { TranslationSection } from "./types";

export const notifications: TranslationSection = {
  en: {
    notifications: "Notifications",
    noNotifications: "No notifications yet.",
    notificationQueuePatientReadyTitle: "Patient ready",
    notificationQueuePatientReadyBody: "Your patient is ready — consultation",
    notificationLabResultReadyTitle: "Lab results ready",
    notificationLabResultReadyBody: "Results are back for",
    notificationSoundLabel: "Notification sound",
    notificationSoundDefault: "Default",
    notificationSoundChime: "Chime",
    notificationSoundPing: "Ping",
    notificationSoundNone: "Silent",
  },
  fr: {
    notifications: "Notifications",
    noNotifications: "Aucune notification pour le moment.",
    notificationQueuePatientReadyTitle: "Patient prêt",
    notificationQueuePatientReadyBody: "Votre patient est prêt — consultation",
    notificationLabResultReadyTitle: "Résultats d'analyses prêts",
    notificationLabResultReadyBody: "Résultats disponibles pour",
    notificationSoundLabel: "Son de notification",
    notificationSoundDefault: "Par défaut",
    notificationSoundChime: "Carillon",
    notificationSoundPing: "Ping",
    notificationSoundNone: "Silencieux",
  },
};
```

- [ ] **Step 2: Register it**

In `frontend/src/lib/i18n/index.ts`, add the import after `import { platform } from "./platform";`:

```ts
import { notifications } from "./notifications";
```

Add `notifications` to the `sections` array after `platform`:

```ts
  platform,
  notifications,
];
```

- [ ] **Step 3: Run the i18n completeness test**

Run: `cd frontend && npx vitest run src/lib/i18nCompleteness.test.ts --config vitest.config.ts`
Expected: PASS (both `en` and `fr` have every key).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/i18n/notifications.ts frontend/src/lib/i18n/index.ts
git commit -m "feat(notifications): add i18n strings"
```

---

### Task 7: Pure notification-rendering functions (unit tested)

**Files:**
- Create: `frontend/src/lib/notifications.ts`
- Create: `frontend/src/lib/notifications.test.ts`

**Interfaces:**
- Consumes: `AppNotification` (Task 1, frontend mirror).
- Produces: `isNotificationDoc(doc: unknown, userId: string): doc is AppNotification & { _id: string }`, `notificationTitle(t: (key: string) => string, notification: Pick<AppNotification, "notificationType">): string`, `notificationBody(t: (key: string) => string, notification: Pick<AppNotification, "notificationType" | "data">): string` — consumed by Task 8 (bell list) and Task 9 (toast + PouchDB changes filter).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/notifications.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { isNotificationDoc, notificationBody, notificationTitle } from "./notifications";

const t = vi.fn((key: string) => key);

describe("isNotificationDoc", () => {
  it("accepts a notification doc addressed to the given user", () => {
    const doc = { type: "notification", recipientUserId: "doctor-1" };
    expect(isNotificationDoc(doc, "doctor-1")).toBe(true);
  });

  it("rejects a notification doc addressed to someone else", () => {
    const doc = { type: "notification", recipientUserId: "doctor-2" };
    expect(isNotificationDoc(doc, "doctor-1")).toBe(false);
  });

  it("rejects non-notification docs", () => {
    expect(isNotificationDoc({ type: "consultation", recipientUserId: "doctor-1" }, "doctor-1")).toBe(false);
  });

  it("rejects deleted docs", () => {
    expect(isNotificationDoc({ type: "notification", recipientUserId: "doctor-1", _deleted: true }, "doctor-1")).toBe(false);
  });

  it("rejects null/undefined", () => {
    expect(isNotificationDoc(null, "doctor-1")).toBe(false);
    expect(isNotificationDoc(undefined, "doctor-1")).toBe(false);
  });
});

describe("notificationTitle", () => {
  it("returns the queue title key for queue_patient_ready", () => {
    expect(notificationTitle(t, { notificationType: "queue_patient_ready" })).toBe("notificationQueuePatientReadyTitle");
  });

  it("returns the lab title key for lab_result_ready", () => {
    expect(notificationTitle(t, { notificationType: "lab_result_ready" })).toBe("notificationLabResultReadyTitle");
  });
});

describe("notificationBody", () => {
  it("appends the consultation number for queue_patient_ready", () => {
    const result = notificationBody(t, { notificationType: "queue_patient_ready", data: { consultationNumber: "C-2026-0001" } });
    expect(result).toBe("notificationQueuePatientReadyBody C-2026-0001");
  });

  it("falls back to the plain body when consultationNumber is missing", () => {
    const result = notificationBody(t, { notificationType: "queue_patient_ready", data: {} });
    expect(result).toBe("notificationQueuePatientReadyBody");
  });

  it("appends exam names for lab_result_ready", () => {
    const result = notificationBody(t, { notificationType: "lab_result_ready", data: { examNames: "NFS, Créatinine" } });
    expect(result).toBe("notificationLabResultReadyBody NFS, Créatinine");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/notifications.test.ts --config vitest.config.ts`
Expected: FAIL with "Cannot find module './notifications'" (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/notifications.ts`:

```ts
import type { AppNotification, NotificationType } from "@shared/schema";

export function isNotificationDoc(doc: unknown, userId: string): doc is AppNotification & { _id: string } {
  if (!doc || typeof doc !== "object") return false;
  const candidate = doc as Record<string, unknown>;
  return candidate.type === "notification" && candidate.recipientUserId === userId && !candidate._deleted;
}

export function notificationTitle(t: (key: string) => string, notification: { notificationType: NotificationType }): string {
  return notification.notificationType === "queue_patient_ready"
    ? t("notificationQueuePatientReadyTitle")
    : t("notificationLabResultReadyTitle");
}

export function notificationBody(
  t: (key: string) => string,
  notification: { notificationType: NotificationType; data?: { consultationNumber?: string; examNames?: string } }
): string {
  if (notification.notificationType === "queue_patient_ready") {
    const ref = notification.data?.consultationNumber;
    return ref ? `${t("notificationQueuePatientReadyBody")} ${ref}` : t("notificationQueuePatientReadyBody");
  }
  const exams = notification.data?.examNames;
  return exams ? `${t("notificationLabResultReadyBody")} ${exams}` : t("notificationLabResultReadyBody");
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/notifications.test.ts --config vitest.config.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/notifications.ts frontend/src/lib/notifications.test.ts
git commit -m "feat(notifications): add pure notification rendering/filtering functions"
```

---

### Task 8: Bell-icon dropdown (REST + react-query)

**Files:**
- Create: `frontend/src/hooks/useNotifications.ts`
- Create: `frontend/src/components/NotificationBell.tsx`
- Modify: `frontend/src/components/Header.tsx`

**Interfaces:**
- Consumes: `offlineApiRequest` (`@/lib/offlineApiRequest`), default react-query `queryFn` (registered on `queryClient`, resolves `queryKey: ["/api/notifications"]` to `GET /api/notifications`), `useTenant` (`@/contexts/TenantContext`), `notificationTitle`/`notificationBody` (Task 7), `Button`/`Badge`/`DropdownMenu*` (`@/components/ui/`).
- Produces: `useNotifications()` returning `{ notifications: AppNotification[]; unreadCount: number; isLoading: boolean; markRead: (id: string) => void }` — consumed by `NotificationBell` here and reused by Task 10's invalidation call.

- [ ] **Step 1: Write the hook**

Create `frontend/src/hooks/useNotifications.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { offlineApiRequest } from "@/lib/offlineApiRequest";
import { useTenant } from "@/contexts/TenantContext";
import type { AppNotification } from "@shared/schema";

export const useNotifications = () => {
  const { currentTenant } = useTenant();
  const queryClient = useQueryClient();

  const query = useQuery<AppNotification[]>({
    queryKey: ["/api/notifications"],
    enabled: Boolean(currentTenant),
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await offlineApiRequest("PATCH", `/api/notifications/${id}/read`, undefined, { collection: "notifications" });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const notifications = query.data ?? [];
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    markRead: markReadMutation.mutate,
  };
};
```

- [ ] **Step 2: Write the bell component**

Create `frontend/src/components/NotificationBell.tsx`:

```tsx
import React from "react";
import { Bell } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationTitle, notificationBody } from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const NotificationBell: React.FC = () => {
  const { t } = useTranslation();
  const { notifications, unreadCount, markRead } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-accent" aria-label={t("notifications")} data-testid="notification-bell">
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]"
              data-testid="notification-unread-count">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>{t("notifications")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">{t("noNotifications")}</div>
        )}
        {notifications.map((notification) => (
          <DropdownMenuItem
            key={notification.id}
            className={notification.readAt ? "opacity-60" : undefined}
            onClick={() => {
              if (!notification.readAt) markRead(notification.id);
            }}
            data-testid={`notification-item-${notification.id}`}>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">{notificationTitle(t, notification)}</span>
              <span className="text-xs text-muted-foreground">{notificationBody(t, notification)}</span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
```

- [ ] **Step 3: Wire it into the header**

In `frontend/src/components/Header.tsx`, add the import after `import { OfflineIndicator } from "./OfflineIndicator";`:

```ts
import { NotificationBell } from "./NotificationBell";
```

Add `<NotificationBell />` right after `<OfflineIndicator />` (before the `{/* Language Toggle */}` comment):

```tsx
          <OfflineIndicator />

          <NotificationBell />

          {/* Language Toggle */}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manually verify in the browser**

Per this project's UI-change convention, don't just typecheck — actually look at it. Start nothing new if a dev server is already running (never auto-start one); if the user has one running, ask them to check that the bell icon appears in the header, opens an (empty, since no notifications exist yet) dropdown, and shows "No notifications yet." / "Aucune notification pour le moment." depending on language.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useNotifications.ts frontend/src/components/NotificationBell.tsx frontend/src/components/Header.tsx
git commit -m "feat(notifications): add bell-icon notification dropdown"
```

---

### Task 9: Customizable notification sound

**Files:**
- Create: `frontend/src/lib/notificationSound.ts`
- Create: `frontend/src/lib/notificationSound.test.ts`
- Modify: `frontend/src/components/NotificationBell.tsx`

**Interfaces:**
- Consumes: `notificationSoundLabel`/`notificationSoundDefault`/`notificationSoundChime`/`notificationSoundPing`/`notificationSoundNone` i18n keys (Task 6); `ToggleGroup`/`ToggleGroupItem` (`@/components/ui/toggle-group`).
- Produces: `NotificationSoundPreset` type, `getNotificationSoundPreset(): NotificationSoundPreset`, `setNotificationSoundPreset(preset): void`, `playNotificationSound(preset?): void` — consumed by Task 10 (`useNotificationSignal`, plays the sound alongside the toast) and here (the picker calls it for an immediate preview).

Per-device preference, stored in `localStorage` rather than the backend `Setting` system: `Setting` documents are tenant-wide (shared by every user of that tenant — company name, currency, tax rate), which is the wrong shape for "how *I* personally want to be alerted." No native OS notification API reliably supports a custom sound across macOS/Windows/Linux/browsers, so this synthesizes short tones with the standard Web Audio API instead of bundling audio files — works identically in the Tauri webview and any browser, no licensing, no assets to ship.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/notificationSound.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { getNotificationSoundPreset, playNotificationSound, setNotificationSoundPreset } from "./notificationSound";

// This project's vitest config runs with environment: "node" (no jsdom), so
// `window` is genuinely undefined here — these tests exercise the same
// fallback path a non-browser context (e.g. SSR, or a future test runner
// change) would hit, and every function must degrade safely rather than
// throwing.
describe("notificationSound without a window global", () => {
  it("getNotificationSoundPreset falls back to default", () => {
    expect(getNotificationSoundPreset()).toBe("default");
  });

  it("setNotificationSoundPreset does not throw", () => {
    expect(() => setNotificationSoundPreset("chime")).not.toThrow();
  });

  it("playNotificationSound does not throw for a tone preset", () => {
    expect(() => playNotificationSound("chime")).not.toThrow();
  });

  it("playNotificationSound does not throw for the none preset", () => {
    expect(() => playNotificationSound("none")).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/notificationSound.test.ts --config vitest.config.ts`
Expected: FAIL with "Cannot find module './notificationSound'" (the file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/notificationSound.ts`:

```ts
export type NotificationSoundPreset = "default" | "chime" | "ping" | "none";

const STORAGE_KEY = "notificationSoundPreset";
const VALID_PRESETS: NotificationSoundPreset[] = ["default", "chime", "ping", "none"];

export function getNotificationSoundPreset(): NotificationSoundPreset {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return (VALID_PRESETS as string[]).includes(stored ?? "") ? (stored as NotificationSoundPreset) : "default";
}

export function setNotificationSoundPreset(preset: NotificationSoundPreset): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, preset);
}

// Short tone sequences per preset, synthesized with the Web Audio API — no
// bundled audio files, works identically in the Tauri webview and any
// browser.
const TONES: Record<Exclude<NotificationSoundPreset, "none">, { frequency: number; durationMs: number }[]> = {
  default: [{ frequency: 660, durationMs: 150 }],
  chime: [
    { frequency: 523.25, durationMs: 120 },
    { frequency: 783.99, durationMs: 180 },
  ],
  ping: [{ frequency: 987.77, durationMs: 100 }],
};

export function playNotificationSound(preset: NotificationSoundPreset = getNotificationSoundPreset()): void {
  if (preset === "none" || typeof window === "undefined") return;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return;

  try {
    const context = new AudioContextClass();
    let startTime = context.currentTime;
    for (const { frequency, durationMs } of TONES[preset]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + durationMs / 1000);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startTime);
      oscillator.stop(startTime + durationMs / 1000);
      startTime += durationMs / 1000 + 0.02;
    }
    setTimeout(() => context.close(), (startTime - context.currentTime + 0.5) * 1000);
  } catch (error) {
    console.error("Failed to play notification sound:", error);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/notificationSound.test.ts --config vitest.config.ts`
Expected: all tests PASS.

- [ ] **Step 5: Add the sound picker to the bell dropdown**

In `frontend/src/components/NotificationBell.tsx`, add the imports:

```ts
import { useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getNotificationSoundPreset, playNotificationSound, setNotificationSoundPreset, type NotificationSoundPreset } from "@/lib/notificationSound";
```

(`React` is still imported as a default import per the existing `import React from "react"` line — add the `useState` named import alongside it: `import React, { useState } from "react";`.)

Add local state and a change handler inside the component, right after `const { notifications, unreadCount, markRead } = useNotifications();`:

```ts
  const [soundPreset, setSoundPreset] = useState<NotificationSoundPreset>(() => getNotificationSoundPreset());

  const handleSoundChange = (value: string) => {
    if (!value) return;
    const preset = value as NotificationSoundPreset;
    setSoundPreset(preset);
    setNotificationSoundPreset(preset);
    playNotificationSound(preset);
  };
```

Add a sound-picker row right before the closing `</DropdownMenuContent>` (after the `{notifications.map(...)}` block, as a plain row — not a `DropdownMenuItem` — so clicking a toggle button doesn't trigger the menu's close-on-select behavior):

```tsx
        <DropdownMenuSeparator />
        <div className="px-2 py-1.5">
          <div className="mb-1.5 text-xs text-muted-foreground">{t("notificationSoundLabel")}</div>
          <ToggleGroup type="single" value={soundPreset} onValueChange={handleSoundChange} className="justify-start">
            <ToggleGroupItem value="default" size="sm" className="text-xs" data-testid="notification-sound-default">
              {t("notificationSoundDefault")}
            </ToggleGroupItem>
            <ToggleGroupItem value="chime" size="sm" className="text-xs" data-testid="notification-sound-chime">
              {t("notificationSoundChime")}
            </ToggleGroupItem>
            <ToggleGroupItem value="ping" size="sm" className="text-xs" data-testid="notification-sound-ping">
              {t("notificationSoundPing")}
            </ToggleGroupItem>
            <ToggleGroupItem value="none" size="sm" className="text-xs" data-testid="notification-sound-none">
              {t("notificationSoundNone")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
```

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Manually verify in the browser**

Don't just typecheck — actually look at it (per this project's UI-change convention; don't start a dev server yourself, ask the user to check on their already-running one). Open the bell dropdown, confirm the sound row renders with 4 options, clicking one plays an audible tone immediately and stays selected after closing/reopening the dropdown (i.e. the `localStorage` write round-trips).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/notificationSound.ts frontend/src/lib/notificationSound.test.ts frontend/src/components/NotificationBell.tsx
git commit -m "feat(notifications): add a customizable notification sound"
```

---

### Task 10: Live toast on new notification (PouchDB changes signal)

**Files:**
- Create: `frontend/src/hooks/useNotificationSignal.ts`
- Create: `frontend/src/components/GlobalNotifications.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `createPouchDB` (`@/lib/pouchdb`), `useAuth` (`@/contexts/AuthContext`), `useTenant` (`@/contexts/TenantContext`), `useTranslation` (`@/lib/i18n`), `isNotificationDoc`/`notificationTitle`/`notificationBody` (Task 7), `playNotificationSound` (Task 9), `@tauri-apps/plugin-notification` (Task 11 adds this dependency — this task's code compiles against it either way since it's a type-only concern at build time for the desktop bundle; see note in Step 4).

- [ ] **Step 1: Write the hook**

Create `frontend/src/hooks/useNotificationSignal.ts`:

```ts
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { createPouchDB } from "@/lib/pouchdb";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useTranslation } from "@/lib/i18n";
import { isNotificationDoc, notificationBody, notificationTitle } from "@/lib/notifications";
import { playNotificationSound } from "@/lib/notificationSound";

// `withGlobalTauri: true` in tauri.conf.json guarantees `window.__TAURI__`
// exists inside the desktop shell and nowhere else, so this is a reliable
// way to tell the Tauri build apart from the same bundle opened in a plain
// browser tab (e.g. a central-server web deployment).
function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

async function notifyOS(title: string, body: string): Promise<void> {
  if (isTauriRuntime()) {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        granted = (await requestPermission()) === "granted";
      }
      if (granted) sendNotification({ title, body });
    } catch (error) {
      console.error("Failed to show native notification:", error);
    }
    return;
  }

  // Browser fallback: the standard Web Notifications API. No service worker,
  // no push subscription, no third-party service — just the browser's own
  // OS-level toast. Only fires while the tab is open (a closed tab stops all
  // JS, so there is no way to deliver anything after that without a real
  // push service, which this feature deliberately does not use).
  if (typeof window === "undefined" || !("Notification" in window)) return;
  try {
    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }
    if (permission === "granted") {
      new Notification(title, { body });
    }
  } catch (error) {
    console.error("Failed to show browser notification:", error);
  }
}

export const useNotificationSignal = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const changesRef = useRef<PouchDB.Core.Changes<any> | null>(null);

  useEffect(() => {
    if (!user || !currentTenant) return;
    let cancelled = false;

    const start = async () => {
      const db = await createPouchDB(`medicalconnect_${currentTenant.id}`);
      if (cancelled) return;

      const changes = (db as any).changes({ since: "now", live: true, include_docs: true });
      changesRef.current = changes;
      changes.on("change", (change: any) => {
        const doc = change.doc;
        if (!isNotificationDoc(doc, user.id)) return;
        notifyOS(notificationTitle(t, doc), notificationBody(t, doc));
        playNotificationSound();
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      });
    };

    start();

    return () => {
      cancelled = true;
      changesRef.current?.cancel();
      changesRef.current = null;
    };
  }, [user, currentTenant, t, queryClient]);
};
```

- [ ] **Step 2: Write the global mounting component**

Create `frontend/src/components/GlobalNotifications.tsx`:

```tsx
import { useNotificationSignal } from "../hooks/useNotificationSignal";

/**
 * Global component that turns newly-synced notification documents into
 * native OS toasts. Should be mounted once, high in the component tree,
 * alongside GlobalOfflineSync.
 */
export const GlobalNotifications: React.FC = () => {
  useNotificationSignal();
  return null;
};
```

- [ ] **Step 3: Mount it in `App.tsx`**

In `frontend/src/App.tsx`, add the import next to `import { GlobalNativeLANAgent } from "./components/GlobalNativeLANAgent";`:

```ts
import { GlobalNotifications } from "./components/GlobalNotifications";
```

Add `<GlobalNotifications />` right after `<GlobalNativeLANAgent />`:

```tsx
                    <GlobalOfflineSync />
                    <GlobalNativeLANAgent />
                    <GlobalNotifications />
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: error about `@tauri-apps/plugin-notification` not being found — this is expected until Task 11 installs it. Proceed to Task 11 before verifying this task compiles clean; do not attempt to fix it here.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useNotificationSignal.ts frontend/src/components/GlobalNotifications.tsx frontend/src/App.tsx
git commit -m "feat(notifications): turn newly-synced notifications into native OS toasts"
```

---

### Task 11: Tauri notification plugin + tray + close-to-hide

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/src-tauri/Cargo.toml`
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src-tauri/capabilities/default.json`

**Interfaces:**
- Consumes: nothing new from earlier tasks (this is the native-shell counterpart Task 9 depends on for `@tauri-apps/plugin-notification`).
- Produces: OS notification permission plumbing for Task 9; a tray icon with a "Quit" item; window-close now hides instead of quitting, so `useNotificationSignal`'s PouchDB `changes()` listener (Task 9) keeps running.

- [ ] **Step 1: Install the JS plugin package**

Run: `cd frontend && npm install @tauri-apps/plugin-notification@^2`
Expected: `frontend/package.json` and `frontend/package-lock.json` gain the new dependency.

- [ ] **Step 2: Add the Rust plugin dependency and the tray-icon feature flag**

In `frontend/src-tauri/Cargo.toml`, change:

```toml
tauri = { version = "2", features = [] }
```

to:

```toml
tauri = { version = "2", features = ["tray-icon"] }
```

And add this line to `[dependencies]` (alphabetical position, after `tauri-plugin-opener`):

```toml
tauri-plugin-notification = "2"
```

- [ ] **Step 3: Add the notification permission to the desktop capability**

In `frontend/src-tauri/capabilities/default.json`, change:

```json
  "permissions": ["core:default", "opener:default"]
```

to:

```json
  "permissions": ["core:default", "opener:default", "notification:default"]
```

- [ ] **Step 4: Register the plugin, tray icon, and close-to-hide behavior in `lib.rs`**

In `frontend/src-tauri/src/lib.rs`, change the `use` line:

```rust
use tauri::WebviewWindowBuilder;
```

to:

```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewWindowBuilder, WindowEvent,
};
```

Add `.plugin(tauri_plugin_notification::init())` to the builder chain, right after `.plugin(tauri_plugin_opener::init())`:

```rust
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
```

Inside the existing `.setup(|app| { ... Ok(()) })` closure, right before the final `Ok(())`, add:

```rust
            let quit_item = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&quit_item])?;
            TrayIconBuilder::new()
                .menu(&tray_menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| {
                    if event.id() == "quit" {
                        app.exit(0);
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let window_clone = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_default();
                        let _ = window_clone.hide();
                    }
                });
            }
```

- [ ] **Step 5: Build to verify the Rust side compiles**

Run: `cd frontend && npm run desktop:build -- --debug` (or, faster during iteration: `cd frontend/src-tauri && cargo check`)
Expected: compiles with no errors. Tauri v2's tray/menu API surface (`TrayIconBuilder`, `Menu::with_items`, `MenuItem::with_id`, `WindowEvent::CloseRequested`) is stable, but if the installed `tauri` crate version resolves slightly differently, adjust the exact method names against the compiler's suggestions — this is real Rust code to fix, not a placeholder to fill in blind.

- [ ] **Step 6: Verify the frontend typechecks clean now that the plugin package exists**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors (the `@tauri-apps/plugin-notification` import in Task 9's `useNotificationSignal.ts` now resolves).

- [ ] **Step 7: Manually verify tray/close/notification behavior**

Per this project's convention, don't just build — actually run it. Ask the user to launch the desktop simulator (`npm run desktop:simulator:caisse1` from `frontend/`, or their usual dev flow — do not start it yourself) and confirm: (a) closing the main window leaves a tray icon behind instead of quitting the app, (b) the tray's "Quitter" item actually exits, (c) triggering a queue "arrived" event for a consultation assigned to the logged-in user produces a native OS toast even with the window closed.

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src-tauri/Cargo.toml frontend/src-tauri/Cargo.lock frontend/src-tauri/capabilities/default.json frontend/src-tauri/src/lib.rs
git commit -m "feat(notifications): add tray icon, close-to-hide, and native notification plugin"
```

---

## Self-Review Notes

- **Spec coverage:** data model → Task 1; backend module + triggers → Tasks 2–5; frontend REST/UI → Tasks 6–8; live signal → Task 10; tray/background → Task 11. All spec sections have a task.
- **Post-spec additions, agreed with the user after the spec was written (not in `docs/superpowers/specs/2026-09-03-medical-connect-push-notifications-design.md`, added directly to this plan):**
  - **Browser fallback (Task 10):** the design spec assumed the Tauri desktop shell; the user asked what happens if someone opens the same app in a plain browser tab (e.g. a central-server web deployment). `@tauri-apps/plugin-notification` silently no-ops outside Tauri, so `notifyOS` now branches on `isTauriRuntime()` (checks `window.__TAURI__`, guaranteed present by `withGlobalTauri: true` in `tauri.conf.json`) and falls back to the standard Web Notifications API. Real, unavoidable limitation communicated to the user: a closed browser tab stops all JS, so there is no browser equivalent of the desktop's tray/close-to-hide persistence — notifications only fire while the tab is open, in either runtime without a real push service.
  - **Customizable notification sound (Task 9):** requested by the user after confirming no subscription is needed. Implemented as a per-device `localStorage` preference (not the tenant-wide `Setting` system, which is the wrong shape for a personal "how I want to be alerted" choice) with tones synthesized via the Web Audio API rather than bundled audio files, since no native notification API reliably supports custom sounds across macOS/Windows/Linux/browsers. Placed as plain buttons (`ToggleGroup`), not a nested `Select`, inside the bell dropdown to avoid a known Radix issue where a `Select`'s portaled popover can be treated as "outside click" by a parent `DropdownMenu` and close it prematurely.
- **Deliberate spec deviations, corrected during research (not placeholders — verified against actual code):**
  - The spec said lab results trigger on status `"validated"`; the actual `LabOrderStatus` enum uses `"termine"` (confirmed in `backend/src/shared/schema.ts`) — Tasks 5 uses `"termine"`/`enteringTermine`, which `LabOrdersRepository.update()` already computes.
  - The spec's `AppNotification.title`/`body` free-text fields were replaced with `notificationType` + a small structured `data` object, rendered client-side through `t()`. Storing pre-rendered English/French strings from the backend would violate this project's i18n rule (`t("key")` for all user-facing text) since the backend doesn't know the recipient's language preference.
  - The spec's "or a problem report is filed" parenthetical for the lab trigger was dropped — it wasn't a concretely scoped trigger the user confirmed, and `update()`'s `problemReport` field doesn't have its own status transition distinct from the general `update()` call already covered.
- **Type consistency:** `notificationType`/`data`/`relatedEntity` field names match exactly across Task 1 (schema), Task 2 (repository), Tasks 4–5 (call sites), Task 7 (rendering functions); `NotificationSoundPreset`/`getNotificationSoundPreset`/`setNotificationSoundPreset`/`playNotificationSound` match exactly across Task 9 (definition) and Task 10 (`useNotificationSignal`'s import) — verified by re-reading each task's code together while writing this plan.
- **Testing convention:** matched the actual repository-level spec pattern used by `queue`/`lab-orders` (not the more generic `*.service.spec.ts` guidance) after confirming via `find backend/src/modules -iname "*.service.spec.ts"` that those two specific modules only have repository/policy specs.
