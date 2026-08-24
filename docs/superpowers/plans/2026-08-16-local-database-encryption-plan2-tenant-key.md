# Tenant Data Key & Server-Mediated Device Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate one AES-256 Tenant Data Key per tenant, store it encrypted at rest on the server, and let an admin device retrieve it only after another already-authorized device (or the tenant's bootstrap secret) explicitly approves it — never on login alone.

**Architecture:** A new `device-authorization` NestJS module owns two CouchDB document types in the existing system-wide `stockflow_identity` database (not the tenant's own business database, so an unauthorized device is never in the position of needing access to a database it isn't authorized for just to check its own status): `tenant_data_key` (one per tenant, AES-256-GCM-wrapped under a server master secret) and `device_authorization` (`pending`/`approved`/`revoked` per device). Bootstrap is gated by a `tenants.initialized` flag plus a single-use provisioning secret generated when a tenant is created, both added to the existing `tenants.repository.ts`. Once bootstrapped, every further device goes through an explicit admin approval, delivered via an X25519 ECDH + HKDF + AES-256-GCM sealed box so the Tenant Data Key is never visible in transit or in server logs beyond TLS. A Settings page card lists and revokes authorized devices.

**Tech Stack:** NestJS (Fastify), `nano` (CouchDB client, **not** Drizzle/Postgres — this backend has already fully migrated off Postgres, see the correction in Task 1), Node's built-in `crypto.webcrypto.subtle` (X25519/HKDF/AES-GCM — verified interoperable with the WebCrypto calls Plan 1 already uses on the frontend), `class-validator` DTOs, Jest with directly-constructed services (no `TestingModule`), React + `@tanstack/react-query` for the Settings card.

**Spec:** `docs/superpowers/specs/2026-08-16-local-database-encryption-design.md` — this plan implements §4.2 (Tenant Data Key), §5.1 (bootstrap), §5.2 (Chemin A), and the "Révocation" half of §9 (listing/revoking `device_authorizations` — the recovery/rebuild-replica half of §9 only becomes relevant once `stockflow_<tenantId>` exists, which is not yet the case). §5.3 (Chemin B, LAN peer-to-peer) and the Approval Capability are explicitly out of scope — Plan 3.

## Global Constraints

- **This backend has no Postgres/Drizzle** — `backend/src/shared/schema.ts` is plain TypeScript interfaces + Zod, not `pgTable`; all persistence goes through `CouchDBService` (`nano`) against per-tenant (`stockflow_<tenantId>`) or system-wide (`stockflow_identity`) CouchDB databases. Every existing repository (`SettingsRepository`, `TenantsRepository`) is the pattern to match — CLAUDE.md's description of a Drizzle/Postgres layer is stale for this part of the codebase.
- Never store the Tenant Data Key, the provisioning secret, or any wrapped/delivered form of the key in plaintext at rest — the key is AES-256-GCM-wrapped under `TENANT_DATA_KEY_ENCRYPTION_SECRET` server-side (spec §4.2); the provisioning secret is SHA-256-hashed, never stored in plaintext (spec §5.1, matching `generateRecoveryCode()`'s hash-only storage in `frontend/src/lib/localAuth.ts`).
- `TENANT_DATA_KEY_ENCRYPTION_SECRET` follows the exact same required-in-production / ephemeral-with-warning-in-dev pattern already implemented in `backend/src/modules/lan-identity/lan-identity.service.ts:37-54` for `LAN_CERTIFICATE_PRIVATE_KEY` — don't invent a different fallback shape.
- Tenant scope is always derived from `request.user.tenantId` (JWT), never from a client-supplied field — same guard already enforced in `SettingsController`/`LanIdentityController` (verified: `SettingsController` rejects a mismatched client-supplied `tenantId` with `ForbiddenException`).
- Auto-approval requires **both** `tenants.initialized === false` **and** a valid, unexpired, unused provisioning secret — never ordering/first-request-wins alone (spec §5.1).
- Getting the Tenant Data Key requires an `approved` `device_authorization` row for that specific `deviceId` — authentication (a valid JWT) is necessary but never sufficient on its own.
- Backend service specs construct the class directly with `jest.fn()`-mocked dependencies (`new Service(mockedDep as any)`), not `TestingModule` — match `settings.service.spec.ts`/`settings.repository.spec.ts`/`settings.controller.spec.ts` exactly.
- Every request body goes through a `class-validator` DTO — match `create-setting.dto.ts`'s style.
- This project isn't deployed yet (no shipped clients) — `POST /api/tenants`'s response shape can change without a `/v2` route; this plan does change it (Task 2) to add the one-time provisioning secret.

---

### Task 1: Backend — Tenant Data Key repository (get-or-create, race-safe, encrypted at rest)

**Files:**
- Create: `backend/src/modules/device-authorization/tenant-data-key.repository.ts`
- Create: `backend/src/modules/device-authorization/tenant-data-key.repository.spec.ts`

**Interfaces:**
- Consumes: `CouchDBService` (existing, `../../database/couchdb.service`), `identityDatabaseName` (existing, `../../database/couchdb-naming`).
- Produces: `TenantDataKeyRepository.getOrCreate(tenantId: string): Promise<Buffer>` (raw 32-byte key) — consumed by Task 5's service.

Corrected assumption, verified against the live codebase before writing this task: the spec's §4.2 says "nouvelle table Postgres (`tenant_data_keys`)" — that phrasing predates discovering this backend has no Postgres at all (see Global Constraints). This task stores the Tenant Data Key as a CouchDB document in `stockflow_identity` instead, using CouchDB's own `_id` uniqueness as the race-prevention mechanism (an `insert()` with a colliding `_id` returns HTTP 409, exactly the same conflict CouchDB already returns and that `SettingsRepository`/`TenantsRepository` already handle) — no new "uniqueness constraint" concept needed, CouchDB already provides it.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/device-authorization/tenant-data-key.repository.spec.ts`:

```ts
import { TenantDataKeyRepository } from "./tenant-data-key.repository";

const ORIGINAL_ENV = process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET;

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    get: jest.fn(),
    insert: jest.fn().mockResolvedValue({ ok: true }),
    ...overrides,
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
  };
  return {
    db,
    couchDBService,
    repository: new TenantDataKeyRepository(couchDBService as any),
  };
}

describe("TenantDataKeyRepository", () => {
  beforeEach(() => {
    process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET = "test-secret-not-for-production";
  });

  afterAll(() => {
    process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET = ORIGINAL_ENV;
  });

  it("creates a new 32-byte key on first call and stores it wrapped, never in plaintext", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const { repository, db, couchDBService } = harness({
      get: jest.fn().mockRejectedValue(notFound),
    });

    const key = await repository.getOrCreate("tenant-1");

    expect(key).toHaveLength(32);
    expect(couchDBService.getDatabase).toHaveBeenCalledWith("stockflow_identity");
    expect(db.insert).toHaveBeenCalledTimes(1);
    const stored = db.insert.mock.calls[0][0];
    expect(stored._id).toBe("tenant-data-key:tenant-1");
    expect(stored.type).toBe("tenant_data_key");
    expect(stored.tenantId).toBe("tenant-1");
    expect(typeof stored.wrappedKey).toBe("string");
    expect(typeof stored.iv).toBe("string");
    expect(Buffer.from(stored.wrappedKey, "base64").equals(key)).toBe(false);
  });

  it("returns the same key on a second call by unwrapping the stored document", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const { repository, db } = harness({
      get: jest.fn().mockRejectedValueOnce(notFound),
    });

    const firstKey = await repository.getOrCreate("tenant-1");
    const storedDoc = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(storedDoc);

    const secondKey = await repository.getOrCreate("tenant-1");

    expect(secondKey.equals(firstKey)).toBe(true);
  });

  it("recovers from a concurrent-creation race by re-reading instead of erroring", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const conflict = Object.assign(new Error("conflict"), { statusCode: 409 });

    // Simulate: this request's own get() finds nothing, but by the time it
    // tries to insert, another concurrent request already won - the insert
    // conflicts, and the repository must fall back to reading what the
    // winner wrote rather than surfacing the 409.
    let getCallCount = 0;
    const winnerDoc = {
      _id: "tenant-data-key:tenant-1",
      type: "tenant_data_key",
      tenantId: "tenant-1",
      wrappedKey: "",
      iv: "",
      createdAt: new Date().toISOString(),
    };
    const { repository, db } = harness({
      get: jest.fn().mockImplementation(async () => {
        getCallCount += 1;
        if (getCallCount === 1) throw notFound;
        return winnerDoc;
      }),
      insert: jest.fn().mockRejectedValue(conflict),
    });

    // Pre-populate winnerDoc with a validly wrapped key using the same
    // repository instance's own wrap logic, by creating it once against a
    // fresh mock where insert succeeds.
    const seeder = harness({ get: jest.fn().mockRejectedValue(notFound) });
    const seededKey = await seeder.repository.getOrCreate("tenant-1");
    winnerDoc.wrappedKey = seeder.db.insert.mock.calls[0][0].wrappedKey;
    winnerDoc.iv = seeder.db.insert.mock.calls[0][0].iv;

    const key = await repository.getOrCreate("tenant-1");

    expect(key.equals(seededKey)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest tenant-data-key.repository`
Expected: FAIL because `./tenant-data-key.repository` does not exist.

- [ ] **Step 3: Implement the repository**

Create `backend/src/modules/device-authorization/tenant-data-key.repository.ts`:

```ts
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHash, webcrypto } from "crypto";
import { CouchDBService } from "../../database/couchdb.service";
import { identityDatabaseName } from "../../database/couchdb-naming";

const { subtle } = webcrypto;

interface TenantDataKeyDocument {
  _id: string;
  _rev?: string;
  type: "tenant_data_key";
  tenantId: string;
  wrappedKey: string;
  iv: string;
  createdAt: string;
}

@Injectable()
export class TenantDataKeyRepository {
  private readonly logger = new Logger(TenantDataKeyRepository.name);
  private wrapKeyPromise: Promise<CryptoKey> | null = null;

  constructor(private readonly couchDBService: CouchDBService) {}

  async getOrCreate(tenantId: string): Promise<Buffer> {
    const db = await this.database();
    const id = this.documentId(tenantId);

    try {
      const existing = (await db.get(id)) as unknown as TenantDataKeyDocument;
      return this.unwrap(existing);
    } catch (error) {
      if (this.statusCode(error) !== 404) throw this.unavailable(error);
    }

    const raw = new Uint8Array(32);
    webcrypto.getRandomValues(raw);
    const { wrappedKey, iv } = await this.wrap(Buffer.from(raw));

    const doc: TenantDataKeyDocument = {
      _id: id,
      type: "tenant_data_key",
      tenantId,
      wrappedKey,
      iv,
      createdAt: new Date().toISOString(),
    };

    try {
      await db.insert(doc as any);
      return Buffer.from(raw);
    } catch (error) {
      if (this.statusCode(error) !== 409) throw this.unavailable(error);
      // Another concurrent request already created the tenant's key between
      // this request's get() and insert() - re-read what it wrote instead
      // of erroring or silently minting a second, divergent key.
      const winner = (await db.get(id)) as unknown as TenantDataKeyDocument;
      return this.unwrap(winner);
    }
  }

  private async wrap(raw: Buffer): Promise<{ wrappedKey: string; iv: string }> {
    const key = await this.wrapKey();
    const iv = new Uint8Array(12);
    webcrypto.getRandomValues(iv);
    const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, key, raw);
    return {
      wrappedKey: Buffer.from(ciphertext).toString("base64"),
      iv: Buffer.from(iv).toString("base64"),
    };
  }

  private async unwrap(doc: TenantDataKeyDocument): Promise<Buffer> {
    const key = await this.wrapKey();
    const iv = Buffer.from(doc.iv, "base64");
    const ciphertext = Buffer.from(doc.wrappedKey, "base64");
    const plaintext = await subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
    return Buffer.from(plaintext);
  }

  private wrapKey(): Promise<CryptoKey> {
    if (!this.wrapKeyPromise) {
      const secret = process.env.TENANT_DATA_KEY_ENCRYPTION_SECRET;
      let keyMaterial: Buffer;
      if (secret) {
        keyMaterial = createHash("sha256").update(secret).digest();
      } else {
        if (process.env.NODE_ENV === "production") {
          throw new Error(
            "TENANT_DATA_KEY_ENCRYPTION_SECRET is required in production"
          );
        }
        keyMaterial = createHash("sha256")
          .update(Buffer.from(webcrypto.getRandomValues(new Uint8Array(32))))
          .digest();
        this.logger.warn(
          "Using an ephemeral TENANT_DATA_KEY_ENCRYPTION_SECRET; configure it for persistent tenant data keys"
        );
      }
      this.wrapKeyPromise = subtle.importKey(
        "raw",
        keyMaterial,
        "AES-GCM",
        false,
        ["encrypt", "decrypt"]
      );
    }
    return this.wrapKeyPromise;
  }

  private documentId(tenantId: string): string {
    return `tenant-data-key:${tenantId}`;
  }

  private async database() {
    try {
      return await this.couchDBService.getDatabase(identityDatabaseName());
    } catch (error) {
      throw this.unavailable(error);
    }
  }

  private statusCode(error: unknown): number | undefined {
    return typeof error === "object" && error !== null && "statusCode" in error
      ? Number((error as any).statusCode)
      : undefined;
  }

  private unavailable(error: unknown): ServiceUnavailableException {
    return new ServiceUnavailableException("CouchDB is unavailable", {
      cause: error,
    });
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd backend && npx jest tenant-data-key.repository`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/device-authorization/tenant-data-key.repository.ts backend/src/modules/device-authorization/tenant-data-key.repository.spec.ts
git commit -m "feat: generate and store the Tenant Data Key, encrypted at rest, race-safe"
```

---

### Task 2: Backend — tenant bootstrap: `initialized` flag and provisioning secret

**Files:**
- Modify: `backend/src/modules/identity/tenants.repository.ts`
- Create: `backend/src/modules/identity/tenants.repository.spec.ts`
- Modify: `backend/src/modules/tenants/tenants.service.ts`
- Modify: `backend/src/modules/tenants/tenants.controller.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `TenantsRepository.create(data): Promise<{ tenant: Tenant; provisioningSecret: string }>` (return type changes — see the constraint on `POST /api/tenants`'s response shape below), `TenantsRepository.verifyAndConsumeProvisioningSecret(tenantId: string, secret: string): Promise<boolean>`, `TenantsRepository.markInitialized(tenantId: string): Promise<void>`, `TenantsRepository.isInitialized(tenantId: string): Promise<boolean>` — all consumed by Task 5's `DeviceAuthorizationService`.

The public `Tenant` interface in `backend/src/shared/schema.ts` is **not** touched by this task — it's the shape returned from `/api/auth/me`, `GET /api/tenants`, etc., and the bootstrap fields (especially the secret's hash) must never appear there. They live only on the CouchDB document and on a repository-internal type.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/identity/tenants.repository.spec.ts`:

```ts
import { TenantsRepository } from "./tenants.repository";

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    get: jest.fn(),
    insert: jest.fn().mockResolvedValue({ ok: true }),
    find: jest.fn().mockResolvedValue({ docs: [] }),
    ...overrides,
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
  };
  return {
    db,
    couchDBService,
    repository: new TenantsRepository(couchDBService as any),
  };
}

describe("TenantsRepository bootstrap fields", () => {
  it("creates a tenant with initialized false and a hashed, never-plaintext provisioning secret", async () => {
    const { repository, db } = harness();

    const { tenant, provisioningSecret } = await repository.create({
      name: "Boutique Test",
    } as any);

    expect(tenant).not.toHaveProperty("initialized");
    expect(tenant).not.toHaveProperty("provisioningSecretHash");
    expect(provisioningSecret).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const stored = db.insert.mock.calls[0][0];
    expect(stored.initialized).toBe(false);
    expect(stored.provisioningSecretHash).toBeTruthy();
    expect(stored.provisioningSecretHash).not.toBe(provisioningSecret);
    expect(stored.provisioningSecretUsedAt).toBeNull();
    expect(new Date(stored.provisioningSecretExpiresAt).getTime()).toBeGreaterThan(
      Date.now()
    );
  });

  it("verifies and consumes a matching, unexpired, unused secret exactly once", async () => {
    const { repository, db } = harness();
    const { provisioningSecret } = await repository.create({
      name: "Boutique Test",
    } as any);
    const stored = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(stored);

    const firstAttempt = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      provisioningSecret
    );
    expect(firstAttempt).toBe(true);
    expect(db.insert).toHaveBeenCalledTimes(2); // create + consume
    const consumed = db.insert.mock.calls[1][0];
    expect(consumed.provisioningSecretUsedAt).not.toBeNull();

    db.get.mockResolvedValue(consumed);
    const secondAttempt = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      provisioningSecret
    );
    expect(secondAttempt).toBe(false);
  });

  it("rejects a wrong secret without consuming the real one", async () => {
    const { repository, db } = harness();
    await repository.create({ name: "Boutique Test" } as any);
    const stored = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(stored);

    const result = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      "WRONG-CODE-0000"
    );

    expect(result).toBe(false);
    expect(db.insert).toHaveBeenCalledTimes(1); // only the original create
  });

  it("rejects an expired secret", async () => {
    const { repository, db } = harness();
    const { provisioningSecret } = await repository.create({
      name: "Boutique Test",
    } as any);
    const stored = db.insert.mock.calls[0][0];
    stored.provisioningSecretExpiresAt = new Date(Date.now() - 1000).toISOString();
    db.get.mockResolvedValue(stored);

    const result = await repository.verifyAndConsumeProvisioningSecret(
      stored.id,
      provisioningSecret
    );

    expect(result).toBe(false);
  });

  it("reports and updates the initialized flag", async () => {
    const { repository, db } = harness();
    await repository.create({ name: "Boutique Test" } as any);
    const stored = db.insert.mock.calls[0][0];
    db.get.mockResolvedValue(stored);

    expect(await repository.isInitialized(stored.id)).toBe(false);

    await repository.markInitialized(stored.id);
    const updated = db.insert.mock.calls[1][0];
    expect(updated.initialized).toBe(true);

    db.get.mockResolvedValue(updated);
    expect(await repository.isInitialized(stored.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest tenants.repository`
Expected: FAIL — `create` doesn't return `{ tenant, provisioningSecret }` yet, and the new methods don't exist.

- [ ] **Step 3: Implement the changes**

Replace the full contents of `backend/src/modules/identity/tenants.repository.ts`:

```ts
import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { randomInt, randomUUID, createHash } from "crypto";
import type { InsertTenant, Tenant } from "@shared/schema";
import { CouchDBService } from "../../database/couchdb.service";
import { identityDatabaseName } from "../../database/couchdb-naming";

const PROVISIONING_SECRET_TTL_MS = 48 * 60 * 60 * 1000;
const PROVISIONING_SECRET_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";

interface TenantDocument {
  _id: string;
  _rev?: string;
  type: "tenant";
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  settings: unknown;
  isActive: boolean;
  createdAt: string;
  initialized: boolean;
  provisioningSecretHash: string | null;
  provisioningSecretExpiresAt: string | null;
  provisioningSecretUsedAt: string | null;
}

@Injectable()
export class TenantsRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async findById(id: string): Promise<Tenant | undefined> {
    const doc = await this.findDocumentById(id);
    return doc ? this.hydrate(doc) : undefined;
  }

  async findAll(): Promise<Tenant[]> {
    const result = await (await this.db()).find({ selector: { type: "tenant" }, limit: 1000 });
    return (result.docs as unknown as TenantDocument[]).map((doc) => this.hydrate(doc));
  }

  async create(
    data: InsertTenant
  ): Promise<{ tenant: Tenant; provisioningSecret: string }> {
    const input = data as InsertTenant & { id?: string };
    const id = input.id ?? randomUUID();
    const provisioningSecret = this.generateProvisioningSecret();
    const doc: TenantDocument = {
      _id: `tenant:${id}`,
      id,
      type: "tenant",
      name: input.name,
      address: input.address ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      settings: input.settings ?? null,
      isActive: input.isActive !== false,
      createdAt: new Date().toISOString(),
      initialized: false,
      provisioningSecretHash: this.hashSecret(provisioningSecret),
      provisioningSecretExpiresAt: new Date(
        Date.now() + PROVISIONING_SECRET_TTL_MS
      ).toISOString(),
      provisioningSecretUsedAt: null,
    };
    await (await this.db()).insert(doc as any);
    return { tenant: this.hydrate(doc), provisioningSecret };
  }

  async update(id: string, data: Partial<InsertTenant>): Promise<Tenant> {
    const db = await this.db();
    const current = await this.getDocumentOrThrow(id);
    const updated: TenantDocument = { ...current, ...data, id, type: "tenant" };
    await db.insert(updated as any);
    return this.hydrate(updated);
  }

  async isInitialized(id: string): Promise<boolean> {
    const doc = await this.findDocumentById(id);
    return doc?.initialized === true;
  }

  async markInitialized(id: string): Promise<void> {
    const db = await this.db();
    const current = await this.getDocumentOrThrow(id);
    await db.insert({ ...current, initialized: true } as any);
  }

  async verifyAndConsumeProvisioningSecret(
    id: string,
    secret: string
  ): Promise<boolean> {
    const doc = await this.findDocumentById(id);
    if (!doc || !doc.provisioningSecretHash || doc.provisioningSecretUsedAt) {
      return false;
    }
    if (
      doc.provisioningSecretExpiresAt &&
      new Date(doc.provisioningSecretExpiresAt).getTime() < Date.now()
    ) {
      return false;
    }
    if (doc.provisioningSecretHash !== this.hashSecret(secret)) {
      return false;
    }
    const db = await this.db();
    await db.insert({
      ...doc,
      provisioningSecretUsedAt: new Date().toISOString(),
    } as any);
    return true;
  }

  private generateProvisioningSecret(): string {
    const groups: string[] = [];
    for (let g = 0; g < 3; g += 1) {
      let group = "";
      for (let i = 0; i < 4; i += 1) {
        group += PROVISIONING_SECRET_ALPHABET[randomInt(PROVISIONING_SECRET_ALPHABET.length)];
      }
      groups.push(group);
    }
    return groups.join("-");
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret).digest("hex");
  }

  private async findDocumentById(id: string): Promise<TenantDocument | undefined> {
    try {
      return (await (await this.db()).get(`tenant:${id}`)) as unknown as TenantDocument;
    } catch (error) {
      if ((error as any)?.statusCode === 404) return undefined;
      throw new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
    }
  }

  private async getDocumentOrThrow(id: string): Promise<TenantDocument> {
    const doc = await this.findDocumentById(id);
    if (!doc) throw new NotFoundException("Tenant not found");
    return doc;
  }

  private db() {
    return this.couchDBService.getDatabase(identityDatabaseName());
  }

  private hydrate(doc: TenantDocument): Tenant {
    return {
      id: doc.id,
      name: doc.name,
      address: doc.address,
      phone: doc.phone,
      email: doc.email,
      settings: doc.settings,
      isActive: doc.isActive,
      createdAt: new Date(doc.createdAt),
    };
  }
}
```

`hydrate()` now explicitly whitelists the public `Tenant` fields instead of spreading the whole document — this is deliberate: it's what keeps `initialized`, `provisioningSecretHash`, `provisioningSecretExpiresAt`, and `provisioningSecretUsedAt` from ever leaking into `/api/auth/me`, `GET /api/tenants`, or anywhere else `Tenant` objects are returned.

- [ ] **Step 4: Update `TenantsService` and `TenantsController` for the new `create()` return shape**

In `backend/src/modules/tenants/tenants.service.ts`, replace:

```ts
  async create(data: InsertTenant): Promise<Tenant> {
    return this.tenantsRepository.create(data);
  }
```

with:

```ts
  async create(
    data: InsertTenant
  ): Promise<{ tenant: Tenant; provisioningSecret: string }> {
    return this.tenantsRepository.create(data);
  }
```

`TenantsController.create()` (`backend/src/modules/tenants/tenants.controller.ts`) already just returns `this.tenantsService.create(createTenantDto)` directly — no change needed there, but note for the manual verification step: `POST /api/tenants`'s response body now includes `provisioningSecret`, which the admin creating the tenant needs to hand to whoever sets up the tenant's first device (spec §5.1). This is the one intentional response-shape change this plan makes; per the Global Constraints, that's acceptable since nothing is deployed yet.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `cd backend && npx jest tenants.repository`
Expected: PASS — 5 tests.

- [ ] **Step 6: Run the full backend test suite to catch any other caller of the old `create()` shape**

Run: `cd backend && npx jest`
Expected: PASS. If any other spec asserts `tenantsService.create(...)` resolves to a bare `Tenant`, update its assertion to destructure `{ tenant }` — this is the one call site this task is expected to touch beyond what's listed above.

- [ ] **Step 7: Commit**

```bash
git add backend/src/modules/identity/tenants.repository.ts backend/src/modules/identity/tenants.repository.spec.ts backend/src/modules/tenants/tenants.service.ts
git commit -m "feat: add tenant bootstrap state and a single-use provisioning secret"
```

---

### Task 3: Backend — device authorization repository

**Files:**
- Create: `backend/src/modules/device-authorization/device-authorization.repository.ts`
- Create: `backend/src/modules/device-authorization/device-authorization.repository.spec.ts`

**Interfaces:**
- Consumes: `CouchDBService`, `identityDatabaseName`.
- Produces: `DeviceAuthorization` type, `DeviceAuthorizationRepository` with `findByDevice(tenantId, deviceId)`, `create(input)`, `approve(tenantId, deviceId, decidedByUserId)`, `revoke(tenantId, deviceId, decidedByUserId)`, `listByTenant(tenantId)` — consumed by Task 5's service.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/device-authorization/device-authorization.repository.spec.ts`:

```ts
import { DeviceAuthorizationRepository } from "./device-authorization.repository";

function harness(overrides: Record<string, unknown> = {}) {
  const db = {
    get: jest.fn(),
    insert: jest.fn().mockResolvedValue({ ok: true }),
    find: jest.fn().mockResolvedValue({ docs: [] }),
    ...overrides,
  };
  const couchDBService = {
    getDatabase: jest.fn().mockResolvedValue(db),
    ensureIndex: jest.fn().mockResolvedValue(undefined),
  };
  return {
    db,
    couchDBService,
    repository: new DeviceAuthorizationRepository(couchDBService as any),
  };
}

describe("DeviceAuthorizationRepository", () => {
  it("creates a pending authorization with a deterministic id", async () => {
    const { repository, db, couchDBService } = harness();

    const created = await repository.create({
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "base64-x25519-pubkey",
    });

    expect(couchDBService.getDatabase).toHaveBeenCalledWith("stockflow_identity");
    expect(created.status).toBe("pending");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: "device-authorization:tenant-1:device-a",
        type: "device_authorization",
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: "base64-x25519-pubkey",
        status: "pending",
      })
    );
  });

  it("finds an existing authorization by tenant and device", async () => {
    const doc = {
      _id: "device-authorization:tenant-1:device-a",
      _rev: "1-a",
      type: "device_authorization",
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "key",
      status: "approved",
      requestedAt: "2026-08-16T00:00:00.000Z",
      decidedAt: "2026-08-16T00:01:00.000Z",
      decidedByUserId: "user-1",
    };
    const { repository } = harness({ get: jest.fn().mockResolvedValue(doc) });

    const found = await repository.findByDevice("tenant-1", "device-a");

    expect(found?.status).toBe("approved");
    expect(found).not.toHaveProperty("_rev");
  });

  it("returns undefined when no authorization exists yet", async () => {
    const notFound = Object.assign(new Error("missing"), { statusCode: 404 });
    const { repository } = harness({ get: jest.fn().mockRejectedValue(notFound) });

    expect(await repository.findByDevice("tenant-1", "device-a")).toBeUndefined();
  });

  it("approves a pending authorization", async () => {
    const doc = {
      _id: "device-authorization:tenant-1:device-a",
      _rev: "1-a",
      type: "device_authorization",
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "key",
      status: "pending",
      requestedAt: "2026-08-16T00:00:00.000Z",
      decidedAt: null,
      decidedByUserId: null,
    };
    const { repository, db } = harness({ get: jest.fn().mockResolvedValue(doc) });

    const approved = await repository.approve("tenant-1", "device-a", "user-1");

    expect(approved.status).toBe("approved");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", decidedByUserId: "user-1" })
    );
  });

  it("revokes an approved authorization", async () => {
    const doc = {
      _id: "device-authorization:tenant-1:device-a",
      _rev: "2-b",
      type: "device_authorization",
      tenantId: "tenant-1",
      deviceId: "device-a",
      devicePublicKey: "key",
      status: "approved",
      requestedAt: "2026-08-16T00:00:00.000Z",
      decidedAt: "2026-08-16T00:01:00.000Z",
      decidedByUserId: "user-1",
    };
    const { repository, db } = harness({ get: jest.fn().mockResolvedValue(doc) });

    const revoked = await repository.revoke("tenant-1", "device-a", "user-2");

    expect(revoked.status).toBe("revoked");
    expect(db.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "revoked", decidedByUserId: "user-2" })
    );
  });

  it("lists every authorization for a tenant", async () => {
    const { repository, db } = harness({
      find: jest.fn().mockResolvedValue({
        docs: [
          {
            _id: "device-authorization:tenant-1:device-a",
            type: "device_authorization",
            tenantId: "tenant-1",
            deviceId: "device-a",
            devicePublicKey: "key",
            status: "approved",
            requestedAt: "2026-08-16T00:00:00.000Z",
            decidedAt: "2026-08-16T00:01:00.000Z",
            decidedByUserId: "user-1",
          },
        ],
      }),
    });

    const list = await repository.listByTenant("tenant-1");

    expect(db.find).toHaveBeenCalledWith({
      selector: { type: "device_authorization", tenantId: "tenant-1" },
      limit: 1000,
    });
    expect(list).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest device-authorization.repository`
Expected: FAIL because `./device-authorization.repository` does not exist.

- [ ] **Step 3: Implement the repository**

Create `backend/src/modules/device-authorization/device-authorization.repository.ts`:

```ts
import { Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { CouchDBService } from "../../database/couchdb.service";
import { identityDatabaseName } from "../../database/couchdb-naming";

export type DeviceAuthorizationStatus = "pending" | "approved" | "revoked";

export interface DeviceAuthorization {
  tenantId: string;
  deviceId: string;
  devicePublicKey: string;
  status: DeviceAuthorizationStatus;
  requestedAt: Date;
  decidedAt: Date | null;
  decidedByUserId: string | null;
}

interface DeviceAuthorizationDocument {
  _id: string;
  _rev?: string;
  type: "device_authorization";
  tenantId: string;
  deviceId: string;
  devicePublicKey: string;
  status: DeviceAuthorizationStatus;
  requestedAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
}

@Injectable()
export class DeviceAuthorizationRepository {
  constructor(private readonly couchDBService: CouchDBService) {}

  async create(input: {
    tenantId: string;
    deviceId: string;
    devicePublicKey: string;
  }): Promise<DeviceAuthorization> {
    const doc: DeviceAuthorizationDocument = {
      _id: this.documentId(input.tenantId, input.deviceId),
      type: "device_authorization",
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      devicePublicKey: input.devicePublicKey,
      status: "pending",
      requestedAt: new Date().toISOString(),
      decidedAt: null,
      decidedByUserId: null,
    };
    await (await this.db()).insert(doc as any);
    return this.hydrate(doc);
  }

  async findByDevice(
    tenantId: string,
    deviceId: string
  ): Promise<DeviceAuthorization | undefined> {
    const doc = await this.findDocument(tenantId, deviceId);
    return doc ? this.hydrate(doc) : undefined;
  }

  async approve(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.decide(tenantId, deviceId, "approved", decidedByUserId);
  }

  async revoke(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.decide(tenantId, deviceId, "revoked", decidedByUserId);
  }

  async listByTenant(tenantId: string): Promise<DeviceAuthorization[]> {
    const dbName = identityDatabaseName();
    const db = await this.db();
    await this.couchDBService.ensureIndex(dbName, "device_authorizations_by_tenant", [
      "type",
      "tenantId",
    ]);
    const result = await db.find({
      selector: { type: "device_authorization", tenantId },
      limit: 1000,
    });
    return (result.docs as unknown as DeviceAuthorizationDocument[]).map((doc) =>
      this.hydrate(doc)
    );
  }

  private async decide(
    tenantId: string,
    deviceId: string,
    status: DeviceAuthorizationStatus,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    const db = await this.db();
    const current = await this.findDocument(tenantId, deviceId);
    if (!current) throw new NotFoundException("Device authorization not found");
    const updated: DeviceAuthorizationDocument = {
      ...current,
      status,
      decidedAt: new Date().toISOString(),
      decidedByUserId,
    };
    await db.insert(updated as any);
    return this.hydrate(updated);
  }

  private async findDocument(
    tenantId: string,
    deviceId: string
  ): Promise<DeviceAuthorizationDocument | undefined> {
    try {
      return (await (await this.db()).get(
        this.documentId(tenantId, deviceId)
      )) as unknown as DeviceAuthorizationDocument;
    } catch (error) {
      if ((error as any)?.statusCode === 404) return undefined;
      throw new ServiceUnavailableException("CouchDB is unavailable", { cause: error });
    }
  }

  private documentId(tenantId: string, deviceId: string): string {
    return `device-authorization:${tenantId}:${deviceId}`;
  }

  private db() {
    return this.couchDBService.getDatabase(identityDatabaseName());
  }

  private hydrate(doc: DeviceAuthorizationDocument): DeviceAuthorization {
    return {
      tenantId: doc.tenantId,
      deviceId: doc.deviceId,
      devicePublicKey: doc.devicePublicKey,
      status: doc.status,
      requestedAt: new Date(doc.requestedAt),
      decidedAt: doc.decidedAt ? new Date(doc.decidedAt) : null,
      decidedByUserId: doc.decidedByUserId,
    };
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd backend && npx jest device-authorization.repository`
Expected: PASS — 6 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/device-authorization/device-authorization.repository.ts backend/src/modules/device-authorization/device-authorization.repository.spec.ts
git commit -m "feat: add device authorization repository"
```

---

### Task 4: Backend — X25519 sealed-box crypto for delivering the Tenant Data Key

**Files:**
- Create: `backend/src/modules/device-authorization/sealed-box.ts`
- Create: `backend/src/modules/device-authorization/sealed-box.spec.ts`

**Interfaces:**
- Consumes: nothing (pure crypto module).
- Produces: `sealForDevice(plaintext: Buffer, devicePublicKeyBase64: string): Promise<{ ephemeralPublicKey: string; iv: string; ciphertext: string }>` — consumed by Task 5's service. Verified against a running Node process before writing this task (not assumed): Node's `crypto.webcrypto.subtle` supports raw-format X25519 `generateKey`/`exportKey`/`importKey`/`deriveBits` and interoperates byte-for-byte with the same WebCrypto calls Plan 1's frontend code already uses for HKDF/AES-GCM — using the same API on both ends avoids any DER/raw key-format mismatch between Node's legacy `crypto.diffieHellman` (DER-based) and a browser's WebCrypto (raw-based).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/device-authorization/sealed-box.spec.ts`:

```ts
import { webcrypto } from "crypto";
import { sealForDevice } from "./sealed-box";

const { subtle } = webcrypto;

async function generateDeviceKeyPair() {
  const keyPair = await subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
  const publicKeyRaw = Buffer.from(await subtle.exportKey("raw", keyPair.publicKey));
  return { keyPair, publicKeyBase64: publicKeyRaw.toString("base64") };
}

async function openSealedBox(
  sealed: { ephemeralPublicKey: string; iv: string; ciphertext: string },
  devicePrivateKey: CryptoKey
): Promise<Buffer> {
  const ephemeralPublicKey = await subtle.importKey(
    "raw",
    Buffer.from(sealed.ephemeralPublicKey, "base64"),
    { name: "X25519" },
    false,
    []
  );
  const sharedBits = await subtle.deriveBits(
    { name: "X25519", public: ephemeralPublicKey },
    devicePrivateKey,
    256
  );
  const baseKey = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const wrapKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("stockflow-tenant-key-wrap-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );
  const plaintext = await subtle.decrypt(
    { name: "AES-GCM", iv: Buffer.from(sealed.iv, "base64") },
    wrapKey,
    Buffer.from(sealed.ciphertext, "base64")
  );
  return Buffer.from(plaintext);
}

describe("sealForDevice", () => {
  it("produces a box only the target device's private key can open", async () => {
    const { keyPair, publicKeyBase64 } = await generateDeviceKeyPair();
    const tenantDataKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)));

    const sealed = await sealForDevice(tenantDataKey, publicKeyBase64);
    const opened = await openSealedBox(sealed, keyPair.privateKey);

    expect(opened.equals(tenantDataKey)).toBe(true);
  });

  it("cannot be opened by a different device's private key", async () => {
    const { publicKeyBase64 } = await generateDeviceKeyPair();
    const { keyPair: otherDeviceKeyPair } = await generateDeviceKeyPair();
    const tenantDataKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)));

    const sealed = await sealForDevice(tenantDataKey, publicKeyBase64);

    await expect(openSealedBox(sealed, otherDeviceKeyPair.privateKey)).rejects.toThrow();
  });

  it("uses a fresh ephemeral key pair on every call", async () => {
    const { publicKeyBase64 } = await generateDeviceKeyPair();
    const tenantDataKey = Buffer.from(webcrypto.getRandomValues(new Uint8Array(32)));

    const first = await sealForDevice(tenantDataKey, publicKeyBase64);
    const second = await sealForDevice(tenantDataKey, publicKeyBase64);

    expect(first.ephemeralPublicKey).not.toBe(second.ephemeralPublicKey);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest sealed-box`
Expected: FAIL because `./sealed-box` does not exist.

- [ ] **Step 3: Implement the module**

Create `backend/src/modules/device-authorization/sealed-box.ts`:

```ts
import { webcrypto } from "crypto";

const { subtle } = webcrypto;

export async function sealForDevice(
  plaintext: Buffer,
  devicePublicKeyBase64: string
): Promise<{ ephemeralPublicKey: string; iv: string; ciphertext: string }> {
  const devicePublicKey = await subtle.importKey(
    "raw",
    Buffer.from(devicePublicKeyBase64, "base64"),
    { name: "X25519" },
    false,
    []
  );

  const ephemeralKeyPair = await subtle.generateKey({ name: "X25519" }, true, [
    "deriveBits",
  ]);
  const sharedBits = await subtle.deriveBits(
    { name: "X25519", public: devicePublicKey },
    ephemeralKeyPair.privateKey,
    256
  );

  const baseKey = await subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const wrapKey = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("stockflow-tenant-key-wrap-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = new Uint8Array(12);
  webcrypto.getRandomValues(iv);
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, plaintext);

  const ephemeralPublicKeyRaw = await subtle.exportKey(
    "raw",
    ephemeralKeyPair.publicKey
  );

  return {
    ephemeralPublicKey: Buffer.from(ephemeralPublicKeyRaw).toString("base64"),
    iv: Buffer.from(iv).toString("base64"),
    ciphertext: Buffer.from(ciphertext).toString("base64"),
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd backend && npx jest sealed-box`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/device-authorization/sealed-box.ts backend/src/modules/device-authorization/sealed-box.spec.ts
git commit -m "feat: add X25519 sealed-box crypto for delivering the Tenant Data Key"
```

---

### Task 5: Backend — `DeviceAuthorizationService`

**Files:**
- Create: `backend/src/modules/device-authorization/device-authorization.service.ts`
- Create: `backend/src/modules/device-authorization/device-authorization.service.spec.ts`

**Interfaces:**
- Consumes: `TenantDataKeyRepository.getOrCreate` (Task 1), `TenantsRepository.isInitialized`/`markInitialized`/`verifyAndConsumeProvisioningSecret` (Task 2), `DeviceAuthorizationRepository` (Task 3), `sealForDevice` (Task 4), `SignalingService.broadcastToTenant` (existing, `../../websocket/services/signaling.service`).
- Produces: `DeviceAuthorizationService` with `request(tenantId, deviceId, devicePublicKey, provisioningSecret?)`, `approve(tenantId, deviceId, decidedByUserId)`, `revoke(tenantId, deviceId, decidedByUserId)`, `list(tenantId)`, `deliverKey(tenantId, deviceId)` — consumed by Task 6's controller.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/device-authorization/device-authorization.service.spec.ts`:

```ts
import { ForbiddenException } from "@nestjs/common";
import { DeviceAuthorizationService } from "./device-authorization.service";

function harness(overrides: Record<string, unknown> = {}) {
  const tenantDataKeyRepository = {
    getOrCreate: jest.fn().mockResolvedValue(Buffer.alloc(32, 7)),
  };
  const tenantsRepository = {
    isInitialized: jest.fn().mockResolvedValue(true),
    markInitialized: jest.fn().mockResolvedValue(undefined),
    verifyAndConsumeProvisioningSecret: jest.fn().mockResolvedValue(true),
  };
  const deviceAuthorizationRepository = {
    create: jest.fn().mockImplementation(async (input) => ({
      ...input,
      status: "pending",
      requestedAt: new Date(),
      decidedAt: null,
      decidedByUserId: null,
    })),
    findByDevice: jest.fn().mockResolvedValue(undefined),
    approve: jest.fn(),
    revoke: jest.fn(),
    listByTenant: jest.fn().mockResolvedValue([]),
  };
  const signalingService = { broadcastToTenant: jest.fn() };
  const service = new DeviceAuthorizationService(
    { ...tenantDataKeyRepository, ...overrides.tenantDataKeyRepository } as any,
    { ...tenantsRepository, ...overrides.tenantsRepository } as any,
    { ...deviceAuthorizationRepository, ...overrides.deviceAuthorizationRepository } as any,
    signalingService as any
  );
  return {
    service,
    tenantDataKeyRepository,
    tenantsRepository,
    deviceAuthorizationRepository,
    signalingService,
  };
}

describe("DeviceAuthorizationService", () => {
  describe("request", () => {
    it("auto-approves the first device when the tenant is uninitialized and the secret is valid", async () => {
      const { service, tenantsRepository, deviceAuthorizationRepository } = harness({
        tenantsRepository: { isInitialized: jest.fn().mockResolvedValue(false) },
      });

      const result = await service.request("tenant-1", "device-a", "pubkey", "SECRET-CODE-0000");

      expect(tenantsRepository.verifyAndConsumeProvisioningSecret).toHaveBeenCalledWith(
        "tenant-1",
        "SECRET-CODE-0000"
      );
      expect(tenantsRepository.markInitialized).toHaveBeenCalledWith("tenant-1");
      expect(deviceAuthorizationRepository.approve).toHaveBeenCalledWith(
        "tenant-1",
        "device-a",
        "bootstrap"
      );
      expect(result.status).toBe("pending"); // create() always starts pending, then gets approved
    });

    it("rejects bootstrap on an uninitialized tenant with a missing or wrong secret", async () => {
      const { service, tenantsRepository, deviceAuthorizationRepository } = harness({
        tenantsRepository: {
          isInitialized: jest.fn().mockResolvedValue(false),
          verifyAndConsumeProvisioningSecret: jest.fn().mockResolvedValue(false),
        },
      });

      await expect(
        service.request("tenant-1", "device-a", "pubkey", "WRONG")
      ).rejects.toThrow(ForbiddenException);
      expect(deviceAuthorizationRepository.approve).not.toHaveBeenCalled();
    });

    it("never auto-approves once the tenant is initialized, even with a correct-looking secret", async () => {
      const { service, tenantsRepository, deviceAuthorizationRepository, signalingService } =
        harness({ tenantsRepository: { isInitialized: jest.fn().mockResolvedValue(true) } });

      await service.request("tenant-1", "device-b", "pubkey", "SECRET-CODE-0000");

      expect(tenantsRepository.verifyAndConsumeProvisioningSecret).not.toHaveBeenCalled();
      expect(deviceAuthorizationRepository.approve).not.toHaveBeenCalled();
      expect(signalingService.broadcastToTenant).toHaveBeenCalledWith(
        "tenant-1",
        expect.objectContaining({ type: "device-authorization-requested", deviceId: "device-b" })
      );
    });

    it("returns the existing authorization instead of creating a duplicate request", async () => {
      const existing = {
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: "pubkey",
        status: "approved" as const,
        requestedAt: new Date(),
        decidedAt: new Date(),
        decidedByUserId: "user-1",
      };
      const { service, deviceAuthorizationRepository } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(existing) },
      });

      const result = await service.request("tenant-1", "device-a", "pubkey");

      expect(result).toBe(existing);
      expect(deviceAuthorizationRepository.create).not.toHaveBeenCalled();
    });
  });

  describe("deliverKey", () => {
    it("seals the Tenant Data Key for an approved device", async () => {
      const approved = {
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: Buffer.from("this-is-not-a-real-key-just-32b").toString("base64"),
        status: "approved" as const,
        requestedAt: new Date(),
        decidedAt: new Date(),
        decidedByUserId: "user-1",
      };
      const { service } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(approved) },
      });

      // Real X25519 raw public keys are exactly 32 bytes; this fixture's
      // base64 decodes to the right length so sealForDevice's importKey
      // step doesn't throw for a length mismatch.
      const sealed = await service.deliverKey("tenant-1", "device-a");
      expect(sealed).toHaveProperty("ephemeralPublicKey");
      expect(sealed).toHaveProperty("iv");
      expect(sealed).toHaveProperty("ciphertext");
    });

    it("refuses to deliver the key to a device that isn't approved", async () => {
      const pending = {
        tenantId: "tenant-1",
        deviceId: "device-a",
        devicePublicKey: "pubkey",
        status: "pending" as const,
        requestedAt: new Date(),
        decidedAt: null,
        decidedByUserId: null,
      };
      const { service } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(pending) },
      });

      await expect(service.deliverKey("tenant-1", "device-a")).rejects.toThrow(
        ForbiddenException
      );
    });

    it("refuses to deliver the key to an unknown device", async () => {
      const { service } = harness({
        deviceAuthorizationRepository: { findByDevice: jest.fn().mockResolvedValue(undefined) },
      });

      await expect(service.deliverKey("tenant-1", "device-a")).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  it("approve() delegates to the repository", async () => {
    const { service, deviceAuthorizationRepository } = harness();
    await service.approve("tenant-1", "device-a", "user-1");
    expect(deviceAuthorizationRepository.approve).toHaveBeenCalledWith(
      "tenant-1",
      "device-a",
      "user-1"
    );
  });

  it("revoke() delegates to the repository", async () => {
    const { service, deviceAuthorizationRepository } = harness();
    await service.revoke("tenant-1", "device-a", "user-1");
    expect(deviceAuthorizationRepository.revoke).toHaveBeenCalledWith(
      "tenant-1",
      "device-a",
      "user-1"
    );
  });

  it("list() delegates to the repository", async () => {
    const { service, deviceAuthorizationRepository } = harness();
    await service.list("tenant-1");
    expect(deviceAuthorizationRepository.listByTenant).toHaveBeenCalledWith("tenant-1");
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest device-authorization.service`
Expected: FAIL because `./device-authorization.service` does not exist.

- [ ] **Step 3: Implement the service**

Create `backend/src/modules/device-authorization/device-authorization.service.ts`:

```ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import { TenantDataKeyRepository } from "./tenant-data-key.repository";
import { TenantsRepository } from "../identity/tenants.repository";
import {
  DeviceAuthorization,
  DeviceAuthorizationRepository,
} from "./device-authorization.repository";
import { sealForDevice } from "./sealed-box";
import { SignalingService } from "../../websocket/services/signaling.service";

@Injectable()
export class DeviceAuthorizationService {
  constructor(
    private readonly tenantDataKeyRepository: TenantDataKeyRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly deviceAuthorizationRepository: DeviceAuthorizationRepository,
    private readonly signalingService: SignalingService
  ) {}

  async request(
    tenantId: string,
    deviceId: string,
    devicePublicKey: string,
    provisioningSecret?: string
  ): Promise<DeviceAuthorization> {
    const existing = await this.deviceAuthorizationRepository.findByDevice(
      tenantId,
      deviceId
    );
    if (existing) return existing;

    const created = await this.deviceAuthorizationRepository.create({
      tenantId,
      deviceId,
      devicePublicKey,
    });

    const tenantInitialized = await this.tenantsRepository.isInitialized(tenantId);
    if (!tenantInitialized) {
      const secretValid =
        !!provisioningSecret &&
        (await this.tenantsRepository.verifyAndConsumeProvisioningSecret(
          tenantId,
          provisioningSecret
        ));
      if (!secretValid) {
        throw new ForbiddenException(
          "A valid provisioning secret is required for the first device of a tenant"
        );
      }
      await this.tenantsRepository.markInitialized(tenantId);
      await this.deviceAuthorizationRepository.approve(tenantId, deviceId, "bootstrap");
      return created;
    }

    // Not a bootstrap request - notify already-approved devices so an admin
    // can review it. Best-effort: if nobody is currently connected, the
    // request still exists and the Settings page will show it on refetch.
    this.signalingService.broadcastToTenant(tenantId, {
      type: "device-authorization-requested",
      deviceId,
    });

    return created;
  }

  async approve(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.deviceAuthorizationRepository.approve(tenantId, deviceId, decidedByUserId);
  }

  async revoke(
    tenantId: string,
    deviceId: string,
    decidedByUserId: string
  ): Promise<DeviceAuthorization> {
    return this.deviceAuthorizationRepository.revoke(tenantId, deviceId, decidedByUserId);
  }

  async list(tenantId: string): Promise<DeviceAuthorization[]> {
    return this.deviceAuthorizationRepository.listByTenant(tenantId);
  }

  async deliverKey(
    tenantId: string,
    deviceId: string
  ): Promise<{ ephemeralPublicKey: string; iv: string; ciphertext: string }> {
    const authorization = await this.deviceAuthorizationRepository.findByDevice(
      tenantId,
      deviceId
    );
    if (!authorization || authorization.status !== "approved") {
      throw new ForbiddenException("This device is not authorized for this tenant");
    }
    const key = await this.tenantDataKeyRepository.getOrCreate(tenantId);
    return sealForDevice(key, authorization.devicePublicKey);
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd backend && npx jest device-authorization.service`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/device-authorization/device-authorization.service.ts backend/src/modules/device-authorization/device-authorization.service.spec.ts
git commit -m "feat: add DeviceAuthorizationService with bootstrap and Chemin A logic"
```

---

### Task 6: Backend — policy, controller, module, DTOs

**Files:**
- Create: `backend/src/modules/device-authorization/device-authorization.policy.ts`
- Create: `backend/src/modules/device-authorization/dto/request-device-authorization.dto.ts`
- Create: `backend/src/modules/device-authorization/dto/decide-device-authorization.dto.ts`
- Create: `backend/src/modules/device-authorization/device-authorization.controller.ts`
- Create: `backend/src/modules/device-authorization/device-authorization.controller.spec.ts`
- Create: `backend/src/modules/device-authorization/device-authorization.module.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `DeviceAuthorizationService` (Task 5), `BasePolicy` (existing), `JwtAuthGuard`/`PolicyGuard`/`CheckPolicy` (existing).
- Produces: `POST /api/device-authorization/request`, `POST /api/device-authorization/:deviceId/approve`, `POST /api/device-authorization/:deviceId/revoke`, `GET /api/device-authorization`, `POST /api/device-authorization/:deviceId/deliver-key` — consumed by Task 7's frontend.

- [ ] **Step 1: Implement the policy**

Create `backend/src/modules/device-authorization/device-authorization.policy.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class DeviceAuthorizationPolicy extends BasePolicy {
  list(): boolean {
    return this.isAdminOrManager();
  }

  approve(): boolean {
    return this.isAdmin();
  }

  revoke(): boolean {
    return this.isAdmin();
  }
}
```

`request` and `deliver-key` are intentionally not gated by this policy — every authenticated user's device must be able to *ask* for access (that's the whole point of the bootstrap and Chemin A flows), and `deliver-key` re-checks `approved` status itself in the service (Task 5) rather than relying on a role check.

- [ ] **Step 2: Write the DTOs**

Create `backend/src/modules/device-authorization/dto/request-device-authorization.dto.ts`:

```ts
import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class RequestDeviceAuthorizationDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsString()
  @IsNotEmpty()
  devicePublicKey: string;

  @IsString()
  @IsOptional()
  provisioningSecret?: string;
}
```

Create `backend/src/modules/device-authorization/dto/decide-device-authorization.dto.ts`:

```ts
export class DecideDeviceAuthorizationDto {}
```

(No body fields needed — the target device id comes from the route param and the tenant/acting user from the JWT. This DTO exists as a placeholder so the controller method has a typed, class-validator-compatible body parameter if a future field is ever needed, consistent with how every other write route in this codebase takes a DTO rather than reading the raw request object.)

- [ ] **Step 3: Write the failing controller tests**

Create `backend/src/modules/device-authorization/device-authorization.controller.spec.ts`:

```ts
import { DeviceAuthorizationController } from "./device-authorization.controller";

describe("DeviceAuthorizationController tenant scope", () => {
  const request = { user: { id: "user-1", tenantId: "tenant-1", role: "admin" } };

  it("derives the tenant and acting user from the JWT for every operation", async () => {
    const service = {
      request: jest.fn().mockResolvedValue({ status: "pending" }),
      approve: jest.fn().mockResolvedValue({ status: "approved" }),
      revoke: jest.fn().mockResolvedValue({ status: "revoked" }),
      list: jest.fn().mockResolvedValue([]),
      deliverKey: jest.fn().mockResolvedValue({
        ephemeralPublicKey: "e",
        iv: "i",
        ciphertext: "c",
      }),
    };
    const controller = new DeviceAuthorizationController(service as any);

    await controller.request(
      { deviceId: "device-a", devicePublicKey: "pubkey" } as any,
      request as any
    );
    await controller.approve("device-a", request as any);
    await controller.revoke("device-a", request as any);
    await controller.list(request as any);
    await controller.deliverKey("device-a", request as any);

    expect(service.request).toHaveBeenCalledWith(
      "tenant-1",
      "device-a",
      "pubkey",
      undefined
    );
    expect(service.approve).toHaveBeenCalledWith("tenant-1", "device-a", "user-1");
    expect(service.revoke).toHaveBeenCalledWith("tenant-1", "device-a", "user-1");
    expect(service.list).toHaveBeenCalledWith("tenant-1");
    expect(service.deliverKey).toHaveBeenCalledWith("tenant-1", "device-a");
  });
});
```

- [ ] **Step 4: Run the test and verify it fails**

Run: `cd backend && npx jest device-authorization.controller`
Expected: FAIL because `./device-authorization.controller` does not exist.

- [ ] **Step 5: Implement the controller**

Create `backend/src/modules/device-authorization/device-authorization.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { DeviceAuthorizationPolicy } from "./device-authorization.policy";
import { RequestDeviceAuthorizationDto } from "./dto/request-device-authorization.dto";
import { DecideDeviceAuthorizationDto } from "./dto/decide-device-authorization.dto";
import { DeviceAuthorizationService } from "./device-authorization.service";

@Controller("api/device-authorization")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class DeviceAuthorizationController {
  constructor(private readonly deviceAuthorizationService: DeviceAuthorizationService) {}

  @Post("request")
  async request(@Body() dto: RequestDeviceAuthorizationDto, @Req() req: any) {
    return this.deviceAuthorizationService.request(
      req.user.tenantId,
      dto.deviceId,
      dto.devicePublicKey,
      dto.provisioningSecret
    );
  }

  @Post(":deviceId/approve")
  @CheckPolicy(DeviceAuthorizationPolicy, "approve")
  async approve(
    @Param("deviceId") deviceId: string,
    @Req() req: any,
    @Body() _dto?: DecideDeviceAuthorizationDto
  ) {
    return this.deviceAuthorizationService.approve(req.user.tenantId, deviceId, req.user.id);
  }

  @Post(":deviceId/revoke")
  @CheckPolicy(DeviceAuthorizationPolicy, "revoke")
  async revoke(
    @Param("deviceId") deviceId: string,
    @Req() req: any,
    @Body() _dto?: DecideDeviceAuthorizationDto
  ) {
    return this.deviceAuthorizationService.revoke(req.user.tenantId, deviceId, req.user.id);
  }

  @Get()
  @CheckPolicy(DeviceAuthorizationPolicy, "list")
  async list(@Req() req: any) {
    return this.deviceAuthorizationService.list(req.user.tenantId);
  }

  @Post(":deviceId/deliver-key")
  async deliverKey(@Param("deviceId") deviceId: string, @Req() req: any) {
    return this.deviceAuthorizationService.deliverKey(req.user.tenantId, deviceId);
  }
}
```

- [ ] **Step 6: Run the controller test and verify it passes**

Run: `cd backend && npx jest device-authorization.controller`
Expected: PASS.

- [ ] **Step 7: Wire the module**

Create `backend/src/modules/device-authorization/device-authorization.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { DeviceAuthorizationController } from "./device-authorization.controller";
import { DeviceAuthorizationService } from "./device-authorization.service";
import { DeviceAuthorizationPolicy } from "./device-authorization.policy";
import { DeviceAuthorizationRepository } from "./device-authorization.repository";
import { TenantDataKeyRepository } from "./tenant-data-key.repository";
import { CouchDBModule } from "../../database/couchdb.module";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { WebSocketModule } from "../../websocket/websocket.module";

@Module({
  imports: [CouchDBModule, AuthModule, IdentityModule, WebSocketModule],
  controllers: [DeviceAuthorizationController],
  providers: [
    DeviceAuthorizationService,
    DeviceAuthorizationPolicy,
    DeviceAuthorizationRepository,
    TenantDataKeyRepository,
  ],
  exports: [DeviceAuthorizationService],
})
export class DeviceAuthorizationModule {}
```

Verified: `backend/src/modules/identity/identity.module.ts` already exports `TenantsRepository` (alongside `UsersRepository`), so no change is needed there for this to resolve.

Register the new module in `backend/src/app.module.ts`: add `import { DeviceAuthorizationModule } from "./modules/device-authorization/device-authorization.module";` to the imports at the top, and `DeviceAuthorizationModule` to the `imports` array (after `LanIdentityModule`, matching the existing list's ordering by when each module was added).

- [ ] **Step 8: Run the full backend test suite and build**

Run:

```bash
cd backend
npx jest
npm run build
```

Expected: all tests PASS, build exits 0 (this will surface the `IdentityModule` export issue from Step 7 immediately if it's needed and missing).

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/device-authorization backend/src/app.module.ts backend/src/modules/identity/identity.module.ts
git commit -m "feat: expose device authorization as a REST API"
```

---

### Task 7: Frontend — Settings authorized-devices card

**Files:**
- Create: `frontend/src/lib/policies/deviceAuthorization.policy.ts`
- Create: `frontend/src/components/DeviceAuthorizationCard.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/src/lib/i18nCompleteness.test.ts`

**Interfaces:**
- Consumes: `usePolicy`/`useCan`/`PolicyGuard` (existing, `@/hooks/usePolicy`, `@/components/PolicyGuard`), `BasePolicy` (existing, `@/lib/policies/base.policy`), `useAuth` (existing), `useToast` (existing), `useTranslation` (existing).
- Produces: `DeviceAuthorizationPolicy` (frontend mirror), `DeviceAuthorizationCard` component, mounted in `Settings.tsx`.

Scope note: this task covers only the admin-facing list/approve/revoke view. There is no "request access for this device" button yet — that trigger belongs to whichever future migration actually creates `stockflow_<tenantId>` and needs a device to be authorized before it can sync (vague-1, not yet shipped). The backend `request`/`deliver-key` endpoints built in Task 6 are complete and independently testable without that UI existing.

- [ ] **Step 1: Implement the frontend policy mirror**

Create `frontend/src/lib/policies/deviceAuthorization.policy.ts`:

```ts
import { BasePolicy } from "./base.policy";

export class DeviceAuthorizationPolicy extends BasePolicy {
  canList(): boolean {
    return this.isAdminOrManager();
  }

  canApprove(): boolean {
    return this.isAdmin();
  }

  canRevoke(): boolean {
    return this.isAdmin();
  }
}
```

- [ ] **Step 2: Add i18n keys**

In `frontend/src/lib/i18n.ts`, add to both the `en` and `fr` dictionaries:

```ts
  authorizedDevices: "Authorized Devices",
  authorizedDevicesDescription:
    "Devices that can decrypt this tenant's synced data. A device only gets access after an admin explicitly approves it.",
  deviceStatusPending: "Pending",
  deviceStatusApproved: "Approved",
  deviceStatusRevoked: "Revoked",
  approveDevice: "Approve",
  revokeDevice: "Revoke",
  noPendingOrApprovedDevices: "No devices yet.",
```

```ts
  authorizedDevices: "Appareils autorisés",
  authorizedDevicesDescription:
    "Appareils pouvant déchiffrer les données synchronisées de ce tenant. Un appareil n'obtient l'accès qu'après approbation explicite d'un administrateur.",
  deviceStatusPending: "En attente",
  deviceStatusApproved: "Approuvé",
  deviceStatusRevoked: "Révoqué",
  approveDevice: "Approuver",
  revokeDevice: "Révoquer",
  noPendingOrApprovedDevices: "Aucun appareil pour l'instant.",
```

Add to `frontend/src/lib/i18nCompleteness.test.ts`:

```ts
it("keeps the authorized devices card copy explicit", () => {
  expect(translations.fr.authorizedDevices).toBe("Appareils autorisés");
  expect(translations.fr.approveDevice).toBe("Approuver");
});
```

- [ ] **Step 3: Implement the card**

Create `frontend/src/components/DeviceAuthorizationCard.tsx`:

```tsx
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { PolicyGuard } from "@/components/PolicyGuard";
import { DeviceAuthorizationPolicy } from "@/lib/policies/deviceAuthorization.policy";

interface DeviceAuthorization {
  deviceId: string;
  status: "pending" | "approved" | "revoked";
  requestedAt: string;
  decidedAt: string | null;
}

async function fetchDevices(): Promise<DeviceAuthorization[]> {
  const response = await fetch("/api/device-authorization", { credentials: "include" });
  if (!response.ok) throw new Error("Failed to load authorized devices");
  return response.json();
}

async function decideDevice(deviceId: string, action: "approve" | "revoke"): Promise<void> {
  const response = await fetch(`/api/device-authorization/${deviceId}/${action}`, {
    method: "POST",
    credentials: "include",
  });
  if (!response.ok) throw new Error(`Failed to ${action} device`);
}

function statusVariant(status: DeviceAuthorization["status"]) {
  if (status === "approved") return "default" as const;
  if (status === "revoked") return "destructive" as const;
  return "secondary" as const;
}

export const DeviceAuthorizationCard: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: devices = [] } = useQuery({
    queryKey: ["/api/device-authorization"],
    queryFn: fetchDevices,
  });

  const mutation = useMutation({
    mutationFn: ({ deviceId, action }: { deviceId: string; action: "approve" | "revoke" }) =>
      decideDevice(deviceId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/device-authorization"] });
    },
    onError: () => {
      toast({ title: t("validationError"), variant: "destructive" });
    },
  });

  return (
    <PolicyGuard policy={DeviceAuthorizationPolicy} action="canList">
      <Card className="glass-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>{t("authorizedDevices")}</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">{t("authorizedDevicesDescription")}</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {devices.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("noPendingOrApprovedDevices")}</p>
          )}
          {devices.map((device) => (
            <div
              key={device.deviceId}
              className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              data-testid={`device-row-${device.deviceId}`}>
              <div className="space-y-1">
                <p className="font-medium">{device.deviceId}</p>
                <Badge variant={statusVariant(device.status)}>
                  {t(
                    device.status === "approved"
                      ? "deviceStatusApproved"
                      : device.status === "revoked"
                        ? "deviceStatusRevoked"
                        : "deviceStatusPending"
                  )}
                </Badge>
              </div>
              <PolicyGuard policy={DeviceAuthorizationPolicy} action="canApprove">
                <div className="flex gap-2">
                  {device.status === "pending" && (
                    <Button
                      size="sm"
                      data-testid={`button-approve-${device.deviceId}`}
                      onClick={() => mutation.mutate({ deviceId: device.deviceId, action: "approve" })}>
                      {t("approveDevice")}
                    </Button>
                  )}
                  {device.status !== "revoked" && (
                    <Button
                      size="sm"
                      variant="destructive"
                      data-testid={`button-revoke-${device.deviceId}`}
                      onClick={() => mutation.mutate({ deviceId: device.deviceId, action: "revoke" })}>
                      {t("revokeDevice")}
                    </Button>
                  )}
                </div>
              </PolicyGuard>
            </div>
          ))}
        </CardContent>
      </Card>
    </PolicyGuard>
  );
};
```

- [ ] **Step 4: Mount the card in Settings**

In `frontend/src/pages/Settings.tsx`, add the import:

```ts
import { DeviceAuthorizationCard } from "@/components/DeviceAuthorizationCard";
```

Add `<DeviceAuthorizationCard />` immediately after `<NativeLANDiagnosticsCard />` (before the "Offline Data Management" card), matching the existing pattern of standalone cards composed directly into the page.

- [ ] **Step 5: Run the frontend checks**

Run:

```bash
cd frontend
npm run test:unit -- src/lib/i18nCompleteness.test.ts
npm run check
npm run build
```

Expected: the new i18n test PASSES, TypeScript exits 0, Vite build exits 0. (`DeviceAuthorizationCard.tsx` has no dedicated test file — it's thin glue over `@tanstack/react-query` and `fetch`, matching this project's no-RTL/jsdom convention; nothing in it is pure logic worth extracting and unit-testing on its own.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/policies/deviceAuthorization.policy.ts frontend/src/components/DeviceAuthorizationCard.tsx frontend/src/pages/Settings.tsx frontend/src/lib/i18n.ts frontend/src/lib/i18nCompleteness.test.ts
git commit -m "feat: list and revoke authorized devices in Settings"
```

---

## Self-Review

**Spec coverage:**
- §4.2 (Tenant Data Key generation, race-safe uniqueness, at-rest encryption under a server secret matching the `LAN_CERTIFICATE_PRIVATE_KEY` pattern) — Task 1, corrected from Postgres to CouchDB after verifying the backend has no Postgres/Drizzle at all.
- §5.1 (bootstrap: `tenants.initialized` + single-use provisioning secret, generated at tenant creation) — Task 2, corrected from `/api/auth/register` (which only creates a user within an already-existing tenant) to `TenantsRepository.create()`/`POST /api/tenants` (the actual tenant-creation entry point, verified by reading `auth.service.ts`'s `register()`, which requires `tenantId` to already resolve to an existing tenant).
- §5.2 Chemin A (request/approve/revoke/deliver, X25519 + HKDF + AES-GCM sealed box, `request.user.tenantId` derivation, `broadcastToTenant` notification) — Tasks 3, 4, 5, 6.
- §9's "Révocation" listing/revoke UI — Task 7.
- §5.3 (Chemin B), the Approval Capability, and wiring `stockflow_<tenantId>` itself to the Tenant Data Key are explicitly out of scope, per the Goal/Architecture section — Plan 3 and the still-unshipped vague-1 migration respectively.

**Placeholder scan:** no TBD/TODO markers. `DecideDeviceAuthorizationDto` (Task 6) is an intentionally empty class with a comment explaining why — not a placeholder for unfinished work, a documented design choice matching this codebase's convention of every write route taking a DTO.

**Type consistency:** `TenantDataKeyRepository.getOrCreate` (Task 1) returns `Buffer`, matching its use in `DeviceAuthorizationService.deliverKey` (Task 5). `DeviceAuthorization`'s shape (Task 3) matches every place it's consumed in Task 5 and the controller test in Task 6. `sealForDevice`'s return shape (Task 4: `{ephemeralPublicKey, iv, ciphertext}`) matches `deliverKey`'s return type (Task 5) and the frontend's expectations (Task 7, though the card doesn't yet call `deliver-key` — no UI trigger exists for it in this plan's scope, as noted in Task 7). `TenantsRepository.create()`'s new `{tenant, provisioningSecret}` return shape (Task 2) is threaded through `TenantsService.create()` correctly.
