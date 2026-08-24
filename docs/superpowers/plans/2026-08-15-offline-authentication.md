# Authentification 100% locale — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an installation of StockFlow run entirely offline, with local multi-account authentication (admin/manager/cashier roles) and no dependency on the central server, from the very first launch.

**Architecture:** A new `installMode` ("local" | "connected") is chosen once on first launch and persisted in `localStorage`. In local mode, `AuthContext` delegates to a new local module instead of `fetch`-ing the backend — accounts live in a dedicated PouchDB database (`stockflow_local_accounts`, never replicated), passwords and single-use recovery codes are hashed with argon2id. `AuthContext`'s public interface (`user`/`tenant`/`login`/`logout`/`checkAuth`) is unchanged, so the rest of the app (Sidebar, `usePolicy` guards, pages) needs no modification. Every other place that independently contacts the central server (`TenantContext`, `GlobalNativeLANAgent`) is explicitly suppressed in local mode too, so "offline" is actually enforced app-wide, not just at the login screen.

**Tech Stack:** React + TypeScript, PouchDB (existing `createPouchDB` helper), `hash-wasm` (new dependency, argon2id), wouter routing, vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-08-15-offline-authentication-design.md`

**Revision note:** This plan was reviewed before execution. Confirmed issues from that review are folded into the tasks below (mock-database detection, task ordering, app-wide server-contact suppression, password-policy centralization, conflict-error translation, last-admin protection in local mode, unhandled failure paths, misleading Staff edit fields, recovery-code sampling bias, unprotected online-only routes). Two points were decided explicitly rather than assumed: `localAccountsStore.ts` stays unit-untested (matches the codebase's existing PouchDB I/O convention — see Global Constraints), and last-admin protection is added **only** for local mode, since the existing connected/backend mode has no such guard today either and this plan ports Staff functionality, it doesn't redesign it app-wide.

## Global Constraints

- Hashing: argon2id via `hash-wasm`, params `{ parallelism: 1, iterations: 3, memorySize: 19456, hashLength: 32 }`, `outputType: "encoded"` (salt + params embedded in the stored hash string). Same params for passwords and recovery codes.
- Minimum password length for local accounts: 6 characters, enforced centrally in `lib/localAuth.ts` (not just in page-level UI checks), so every entry point (bootstrap, Staff creation, recovery) gets the same floor for free.
- Local accounts live in a dedicated PouchDB database `stockflow_local_accounts`, distinct from the tenant-scoped sync databases (`stockflow_<tenantId>`) — this database is never replicated anywhere.
- If PouchDB initialization silently falls back to the in-memory mock (see `lib/pouchdb.ts`), local-mode account operations must fail loudly (throw), never silently pretend to persist — a mock `put()` resolves `{ok:true}` while `get()`/`info()` never see the write, which would otherwise present as vanished accounts.
- Recovery codes: format `XXXX-XXXX-XXXX`, alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no `0/O/1/I/L`), generated via `crypto.getRandomValues` with rejection sampling (not `byte % alphabet.length`, which is measurably non-uniform for a 31-symbol alphabet: `256 % 31 = 8`). A code is consumed **only on a successful** password reset (a wrong guess does not burn it), and a new code is generated immediately after every successful reset.
- `AuthContext`'s public interface (`user`, `tenant`, `tenants`, `isAuthenticated`, `isLoading`, `login`, `logout`, `register`, `checkAuth`) must not change — every other file that reads it (Sidebar, `usePolicy`, pages) is out of scope for this plan.
- **Local mode must never contact the central server**, not just through `AuthContext`: `TenantContext`'s `/api/tenants` fetch (used for the connected-mode registration page) and `GlobalNativeLANAgent`'s enrollment + periodic `/api/auth/me` polling both currently fire for *any* authenticated user regardless of how that session was established — both are suppressed in local mode (Task 5).
- Install mode choice (`/setup`) is persisted once and not meant to change afterward; migrating a poste from one mode to the other is explicitly out of scope (per spec §4). Connected-mode-only routes (`/register`, `/reset-password`, `/request-password-reset`) redirect away when in local mode, same as `/setup*` redirects away once local mode is already configured.
- Last-admin protection (can't deactivate/demote the only active admin, including yourself) is enforced in local mode only, inside `localAccountsStore.ts` — this is a deliberate scope decision, not an oversight: the existing connected-mode backend (`backend/src/modules/staff/staff.service.ts`) has no equivalent guard today.
- All new user-facing strings go through `t("key")` (`frontend/src/lib/i18n.ts`), added to **both** the `en` and `fr` dictionaries.
- Never write raw `<button>`/`<input>` where `frontend/src/components/ui/*` has an equivalent — use `Button`, `Input`, `Label`, `Card`, etc.
- Business logic (hashing, recovery-code lifecycle, document construction, password policy, conflict-error classification) lives in a plain, fully-unit-tested `lib/localAuth.ts`. The PouchDB I/O wrapper (`lib/localAccountsStore.ts`) and React glue (`AuthContext`, pages) stay untested, matching the existing convention (`productsReplica.ts` is untested I/O, only its pure helpers are; `useNativeLANAgent.ts`/`GlobalNativeLANAgent.tsx` are thin and untested) — confirmed as the deliberate choice for this plan, not a gap.
- This plan extends the spec's data model additively: `LocalUserDoc` also carries `firstName`/`lastName`/`email`, because the existing `Staff.tsx` creation form already collects them — same fields the shared `User` type expects, so `toPublicLocalUser` doesn't have to fabricate placeholders.

---

### Task 1: Add the `hash-wasm` dependency

**Files:**
- Modify: `frontend/package.json`

**Interfaces:**
- Produces: the `hash-wasm` package (`argon2id`, `argon2Verify` exports) available to import from `frontend/src/**`.

- [ ] **Step 1: Install the dependency**

Run (from `frontend/`):
```bash
npm install hash-wasm
```

- [ ] **Step 2: Verify it resolves**

Run: `node -e "import('hash-wasm').then(() => console.log('ok'))"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add hash-wasm for local password hashing"
```

---

### Task 2: `localAuth.ts` — pure local-auth logic (hashing, recovery codes, document builders, policy)

**Files:**
- Create: `frontend/src/lib/localAuth.ts`
- Test: `frontend/src/lib/localAuth.test.ts`

**Interfaces:**
- Consumes: `hash-wasm`'s `argon2id`/`argon2Verify`; `User`/`Tenant` types from `@shared/schema`.
- Produces (used by Task 4 and later tasks):
  - `type LocalRole = "admin" | "manager" | "cashier"`
  - `interface LocalUserDoc { _id: string; _rev?: string; type: "local_user"; username: string; firstName: string; lastName: string; email: string | null; passwordHash: string; role: LocalRole; active: boolean; recoveryCodeHash: string; recoveryCodeCreatedAt: string; createdAt: string; updatedAt: string; }`
  - `const LOCAL_TENANT_ID = "local"`
  - `const MIN_LOCAL_PASSWORD_LENGTH = 6`
  - `class WeakLocalPasswordError extends Error` (message `"password_too_short"`)
  - `normalizeUsername(username: string): string`
  - `localUserDocId(username: string): string`
  - `hashSecret(secret: string): Promise<string>`
  - `verifySecret(secret: string, hash: string): Promise<boolean>`
  - `generateRecoveryCode(): string`
  - `isPouchConflictError(error: unknown): boolean`
  - `interface BuildLocalUserParams { username: string; password: string; role: LocalRole; firstName?: string; lastName?: string; email?: string | null }`
  - `interface BuildLocalUserResult { doc: LocalUserDoc; recoveryCode: string }`
  - `buildLocalUserDoc(params: BuildLocalUserParams): Promise<BuildLocalUserResult>` — throws `WeakLocalPasswordError` if `params.password.length < MIN_LOCAL_PASSWORD_LENGTH`
  - `rotateRecoveryCode(doc: LocalUserDoc): Promise<BuildLocalUserResult>`
  - `resetPasswordWithRecoveryCode(params: { doc: LocalUserDoc; recoveryCode: string; newPassword: string }): Promise<BuildLocalUserResult | null>`
  - `toPublicLocalUser(doc: LocalUserDoc): Omit<User, "password">`
  - `buildLocalTenant(createdAt: string): Tenant`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/localAuth.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildLocalTenant,
  buildLocalUserDoc,
  generateRecoveryCode,
  hashSecret,
  isPouchConflictError,
  localUserDocId,
  normalizeUsername,
  resetPasswordWithRecoveryCode,
  toPublicLocalUser,
  verifySecret,
  WeakLocalPasswordError,
} from "./localAuth";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Alice  ")).toBe("alice");
  });
});

describe("localUserDocId", () => {
  it("prefixes the normalized username", () => {
    expect(localUserDocId("Alice")).toBe("user:alice");
  });
});

describe("hashSecret / verifySecret", () => {
  it("verifies a matching secret", async () => {
    const hash = await hashSecret("correct horse battery staple");
    await expect(
      verifySecret("correct horse battery staple", hash)
    ).resolves.toBe(true);
  });

  it("rejects a wrong secret", async () => {
    const hash = await hashSecret("correct horse battery staple");
    await expect(verifySecret("wrong", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const a = await hashSecret("same-password");
    const b = await hashSecret("same-password");
    expect(a).not.toBe(b);
  });
});

describe("generateRecoveryCode", () => {
  it("produces a three-group readable code", () => {
    const code = generateRecoveryCode();
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("does not repeat across calls", () => {
    const codes = new Set(
      Array.from({ length: 20 }, () => generateRecoveryCode())
    );
    expect(codes.size).toBe(20);
  });
});

describe("isPouchConflictError", () => {
  it("recognizes a PouchDB conflict error shape", () => {
    expect(isPouchConflictError({ name: "conflict" })).toBe(true);
  });

  it("rejects other shapes", () => {
    expect(isPouchConflictError({ name: "not_found" })).toBe(false);
    expect(isPouchConflictError(new Error("boom"))).toBe(false);
    expect(isPouchConflictError(null)).toBe(false);
  });
});

describe("buildLocalUserDoc", () => {
  it("builds a doc and a plaintext recovery code that verifies against its hash", async () => {
    const { doc, recoveryCode } = await buildLocalUserDoc({
      username: "Admin",
      password: "hunter2hunter2",
      role: "admin",
    });

    expect(doc._id).toBe("user:admin");
    expect(doc.username).toBe("admin");
    expect(doc.role).toBe("admin");
    expect(doc.active).toBe(true);
    expect(doc.firstName).toBe("Admin");
    expect(doc.lastName).toBe("");
    await expect(
      verifySecret("hunter2hunter2", doc.passwordHash)
    ).resolves.toBe(true);
    await expect(
      verifySecret(recoveryCode, doc.recoveryCodeHash)
    ).resolves.toBe(true);
  });

  it("rejects a password shorter than the minimum", async () => {
    await expect(
      buildLocalUserDoc({
        username: "shortpw",
        password: "short",
        role: "cashier",
      })
    ).rejects.toThrow(WeakLocalPasswordError);
  });
});

describe("resetPasswordWithRecoveryCode", () => {
  it("returns null for a wrong recovery code (and does not burn it)", async () => {
    const { doc, recoveryCode } = await buildLocalUserDoc({
      username: "cashier1",
      password: "pw123456",
      role: "cashier",
    });

    const result = await resetPasswordWithRecoveryCode({
      doc,
      recoveryCode: "WRONG-CODE-0000",
      newPassword: "newpassword1",
    });

    expect(result).toBeNull();
    // the original code must still verify - a wrong attempt didn't consume it
    await expect(
      verifySecret(recoveryCode, doc.recoveryCodeHash)
    ).resolves.toBe(true);
  });

  it("rotates the password and the recovery code on a correct code", async () => {
    const { doc, recoveryCode } = await buildLocalUserDoc({
      username: "cashier1",
      password: "pw123456",
      role: "cashier",
    });

    const result = await resetPasswordWithRecoveryCode({
      doc,
      recoveryCode,
      newPassword: "newpassword1",
    });

    expect(result).not.toBeNull();
    await expect(
      verifySecret("newpassword1", result!.doc.passwordHash)
    ).resolves.toBe(true);
    expect(result!.recoveryCode).not.toBe(recoveryCode);
    await expect(
      verifySecret(result!.recoveryCode, result!.doc.recoveryCodeHash)
    ).resolves.toBe(true);
    // the old code must no longer verify against the new hash
    await expect(
      verifySecret(recoveryCode, result!.doc.recoveryCodeHash)
    ).resolves.toBe(false);
  });
});

describe("toPublicLocalUser / buildLocalTenant", () => {
  it("maps a local doc onto the shared User shape without leaking secrets", async () => {
    const { doc } = await buildLocalUserDoc({
      username: "manager1",
      password: "pw123456",
      role: "manager",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
    });
    const publicUser = toPublicLocalUser(doc);

    expect(publicUser).toEqual({
      id: "user:manager1",
      username: "manager1",
      firstName: "Jane",
      lastName: "Doe",
      email: "jane@example.com",
      role: "manager",
      tenantId: "local",
      isActive: true,
      createdAt: doc.createdAt,
    });
    expect(publicUser).not.toHaveProperty("password");
    expect(publicUser).not.toHaveProperty("passwordHash");
  });

  it("builds a stable synthetic tenant", () => {
    const tenant = buildLocalTenant("2026-08-15T00:00:00.000Z");
    expect(tenant.id).toBe("local");
    expect(tenant.isActive).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- localAuth`
Expected: FAIL — `Cannot find module './localAuth'`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/localAuth.ts`:

```ts
import { argon2id, argon2Verify } from "hash-wasm";
import type { Tenant, User } from "@shared/schema";

export type LocalRole = "admin" | "manager" | "cashier";

export interface LocalUserDoc {
  _id: string;
  _rev?: string;
  type: "local_user";
  username: string;
  firstName: string;
  lastName: string;
  email: string | null;
  passwordHash: string;
  role: LocalRole;
  active: boolean;
  recoveryCodeHash: string;
  recoveryCodeCreatedAt: string;
  createdAt: string;
  updatedAt: string;
}

export const LOCAL_TENANT_ID = "local";
export const MIN_LOCAL_PASSWORD_LENGTH = 6;

export class WeakLocalPasswordError extends Error {
  constructor() {
    super("password_too_short");
    this.name = "WeakLocalPasswordError";
  }
}

const ARGON2_PARAMS = {
  parallelism: 1,
  iterations: 3,
  memorySize: 19456,
  hashLength: 32,
} as const;

const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const RECOVERY_CODE_GROUP_LENGTH = 4;
const RECOVERY_CODE_GROUPS = 3;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function localUserDocId(username: string): string {
  return `user:${normalizeUsername(username)}`;
}

async function randomBytes(length: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function hashSecret(secret: string): Promise<string> {
  const salt = await randomBytes(16);
  return argon2id({
    password: secret,
    salt,
    outputType: "encoded",
    ...ARGON2_PARAMS,
  });
}

export async function verifySecret(
  secret: string,
  hash: string
): Promise<boolean> {
  return argon2Verify({ password: secret, hash });
}

// Rejection sampling: 256 is not a multiple of the 31-symbol alphabet
// (256 % 31 = 8), so `byte % alphabet.length` would make the first 8
// symbols measurably more likely than the rest. Rejecting bytes >= the
// largest multiple of the alphabet length below 256 keeps it uniform.
function randomAlphabetChar(): string {
  const max =
    256 - (256 % RECOVERY_CODE_ALPHABET.length);
  let byte: number;
  do {
    byte = crypto.getRandomValues(new Uint8Array(1))[0];
  } while (byte >= max);
  return RECOVERY_CODE_ALPHABET[byte % RECOVERY_CODE_ALPHABET.length];
}

export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < RECOVERY_CODE_GROUPS; g++) {
    let group = "";
    for (let i = 0; i < RECOVERY_CODE_GROUP_LENGTH; i++) {
      group += randomAlphabetChar();
    }
    groups.push(group);
  }
  return groups.join("-");
}

export function isPouchConflictError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { name?: unknown }).name === "conflict"
  );
}

export interface BuildLocalUserParams {
  username: string;
  password: string;
  role: LocalRole;
  firstName?: string;
  lastName?: string;
  email?: string | null;
}

export interface BuildLocalUserResult {
  doc: LocalUserDoc;
  recoveryCode: string;
}

export async function buildLocalUserDoc(
  params: BuildLocalUserParams
): Promise<BuildLocalUserResult> {
  if (params.password.length < MIN_LOCAL_PASSWORD_LENGTH) {
    throw new WeakLocalPasswordError();
  }

  const now = new Date().toISOString();
  const recoveryCode = generateRecoveryCode();
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    hashSecret(params.password),
    hashSecret(recoveryCode),
  ]);

  return {
    doc: {
      _id: localUserDocId(params.username),
      type: "local_user",
      username: normalizeUsername(params.username),
      firstName: params.firstName?.trim() || params.username.trim(),
      lastName: params.lastName?.trim() || "",
      email: params.email || null,
      passwordHash,
      role: params.role,
      active: true,
      recoveryCodeHash,
      recoveryCodeCreatedAt: now,
      createdAt: now,
      updatedAt: now,
    },
    recoveryCode,
  };
}

export async function rotateRecoveryCode(
  doc: LocalUserDoc
): Promise<BuildLocalUserResult> {
  const recoveryCode = generateRecoveryCode();
  const recoveryCodeHash = await hashSecret(recoveryCode);
  return {
    doc: {
      ...doc,
      recoveryCodeHash,
      recoveryCodeCreatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    recoveryCode,
  };
}

export async function resetPasswordWithRecoveryCode(params: {
  doc: LocalUserDoc;
  recoveryCode: string;
  newPassword: string;
}): Promise<BuildLocalUserResult | null> {
  const valid = await verifySecret(
    params.recoveryCode.trim().toUpperCase(),
    params.doc.recoveryCodeHash
  );
  if (!valid) return null;

  if (params.newPassword.length < MIN_LOCAL_PASSWORD_LENGTH) {
    throw new WeakLocalPasswordError();
  }

  const newPasswordHash = await hashSecret(params.newPassword);
  return rotateRecoveryCode({ ...params.doc, passwordHash: newPasswordHash });
}

export function toPublicLocalUser(doc: LocalUserDoc): Omit<User, "password"> {
  return {
    id: doc._id,
    username: doc.username,
    firstName: doc.firstName,
    lastName: doc.lastName,
    email: doc.email,
    role: doc.role,
    tenantId: LOCAL_TENANT_ID,
    isActive: doc.active,
    createdAt: doc.createdAt,
  };
}

export function buildLocalTenant(createdAt: string): Tenant {
  return {
    id: LOCAL_TENANT_ID,
    name: "Boutique locale",
    address: null,
    phone: null,
    email: null,
    settings: null,
    isActive: true,
    createdAt,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- localAuth`
Expected: PASS (all `describe` blocks green)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/localAuth.ts frontend/src/lib/localAuth.test.ts
git commit -m "feat: add pure local-auth hashing and document logic"
```

---

### Task 3: `installMode.ts` — persisted install-mode choice

**Files:**
- Create: `frontend/src/lib/installMode.ts`
- Test: `frontend/src/lib/installMode.test.ts`

**Interfaces:**
- Produces (used by Task 4 onward): `type InstallMode = "local" | "connected"`, `getInstallMode(): InstallMode | null`, `setInstallMode(mode: InstallMode): void`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/installMode.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { getInstallMode, setInstallMode } from "./installMode";

function stubLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  });
  return store;
}

describe("installMode", () => {
  it("returns null when nothing is stored", () => {
    stubLocalStorage();
    expect(getInstallMode()).toBeNull();
  });

  it("returns null for a corrupted/unknown stored value", () => {
    const store = stubLocalStorage();
    store.set("stockflow_install_mode", "garbage");
    expect(getInstallMode()).toBeNull();
  });

  it("persists and reads back the chosen mode", () => {
    stubLocalStorage();
    setInstallMode("local");
    expect(getInstallMode()).toBe("local");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- installMode`
Expected: FAIL — `Cannot find module './installMode'`

- [ ] **Step 3: Write the implementation**

Create `frontend/src/lib/installMode.ts`:

```ts
const INSTALL_MODE_KEY = "stockflow_install_mode";

export type InstallMode = "local" | "connected";

export function getInstallMode(): InstallMode | null {
  const value = localStorage.getItem(INSTALL_MODE_KEY);
  return value === "local" || value === "connected" ? value : null;
}

export function setInstallMode(mode: InstallMode): void {
  localStorage.setItem(INSTALL_MODE_KEY, mode);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- installMode`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/installMode.ts frontend/src/lib/installMode.test.ts
git commit -m "feat: add persisted install-mode selection"
```

---

### Task 4: `localAccountsStore.ts` — PouchDB CRUD wrapper (mock-safe, conflict-safe, last-admin-safe)

**Files:**
- Modify: `frontend/src/lib/pouchdb.ts`
- Create: `frontend/src/lib/localAccountsStore.ts`

**Interfaces:**
- Consumes: `createPouchDB` from `./pouchdb`; `buildLocalUserDoc`, `isPouchConflictError`, `localUserDocId`, `resetPasswordWithRecoveryCode`, `verifySecret`, `LocalRole`, `LocalUserDoc` from `./localAuth`.
- Produces (used by Task 5, 9, 10, 11):
  - `const LOCAL_ACCOUNTS_DB_NAME = "stockflow_local_accounts"`
  - `class LocalStorageUnavailableError extends Error` (message `"local_storage_unavailable"`) — thrown when the underlying PouchDB fell back to its in-memory mock
  - `class LastAdminProtectedError extends Error` (message `"last_admin_protected"`)
  - `countLocalAccounts(): Promise<number>`
  - `findLocalAccountByUsername(username: string): Promise<LocalUserDoc | null>`
  - `getLocalAccountById(id: string): Promise<LocalUserDoc | null>`
  - `listLocalAccounts(): Promise<LocalUserDoc[]>`
  - `createLocalAccount(params: { username: string; password: string; role: LocalRole; firstName?: string; lastName?: string; email?: string | null }): Promise<{ doc: LocalUserDoc; recoveryCode: string }>` — throws `Error("username_taken")` on a pre-check conflict *or* a native PouchDB write conflict (translated via `isPouchConflictError`)
  - `verifyLocalLogin(username: string, password: string): Promise<LocalUserDoc | null>`
  - `recoverLocalAccount(params: { username: string; recoveryCode: string; newPassword: string }): Promise<{ doc: LocalUserDoc; recoveryCode: string } | null>`
  - `setLocalAccountRoleAndActive(params: { id: string; role?: LocalRole; active?: boolean }): Promise<LocalUserDoc>` — throws `LastAdminProtectedError` if the change would leave zero active admins

This file wraps I/O (PouchDB) and is not unit tested, matching the existing convention for `productsReplica.ts`'s replication functions — only the pure logic it calls (`localAuth.ts`) is unit tested. This was confirmed as the intended approach (not a gap) before writing this task: the codebase has no precedent for testing PouchDB I/O directly, and adding one (e.g. an in-memory PouchDB adapter) would be new test infrastructure outside this plan's scope.

- [ ] **Step 1: Mark the PouchDB mock fallback so callers can detect it**

In `frontend/src/lib/pouchdb.ts`, find the mock database object inside `initializePouchDB`'s catch block (search for `const MockPouchDB = function`):

```ts
    const MockPouchDB = function (name: string) {
      console.log(`Created mock database: ${name}`);
      // Create a mock database instance
      return {
        name,
        info: () => Promise.resolve({ doc_count: 0, update_seq: 0 }),
```

Change the returned object's first line to also mark the *instance* (not just the constructor, which is already flagged via `MockPouchDB._isMock = true` further down but isn't reachable from a created instance):

```ts
    const MockPouchDB = function (name: string) {
      console.log(`Created mock database: ${name}`);
      // Create a mock database instance
      return {
        name,
        _isMock: true,
        info: () => Promise.resolve({ doc_count: 0, update_seq: 0 }),
```

This is additive only — every other field and every other consumer of `createPouchDB` (products/stock/categories replicas) is unaffected; it just makes the mock detectable from the instance itself, which `localAccountsStore.ts` needs since it only ever sees the returned instance, never the constructor.

- [ ] **Step 2: Write the implementation**

Create `frontend/src/lib/localAccountsStore.ts`:

```ts
import { createPouchDB } from "./pouchdb";
import {
  buildLocalUserDoc,
  isPouchConflictError,
  localUserDocId,
  resetPasswordWithRecoveryCode,
  verifySecret,
  type LocalRole,
  type LocalUserDoc,
} from "./localAuth";

export const LOCAL_ACCOUNTS_DB_NAME = "stockflow_local_accounts";

export class LocalStorageUnavailableError extends Error {
  constructor() {
    super("local_storage_unavailable");
    this.name = "LocalStorageUnavailableError";
  }
}

export class LastAdminProtectedError extends Error {
  constructor() {
    super("last_admin_protected");
    this.name = "LastAdminProtectedError";
  }
}

async function accountsDb() {
  const database = await createPouchDB(LOCAL_ACCOUNTS_DB_NAME);
  if ((database as any)._isMock) {
    throw new LocalStorageUnavailableError();
  }
  return database;
}

export async function countLocalAccounts(): Promise<number> {
  const database = await accountsDb();
  const info = await (database as any).info();
  return info.doc_count;
}

export async function findLocalAccountByUsername(
  username: string
): Promise<LocalUserDoc | null> {
  const database = await accountsDb();
  try {
    return await (database as any).get(localUserDocId(username));
  } catch (error: any) {
    if (error?.name === "not_found") return null;
    throw error;
  }
}

export async function getLocalAccountById(
  id: string
): Promise<LocalUserDoc | null> {
  const database = await accountsDb();
  try {
    return await (database as any).get(id);
  } catch (error: any) {
    if (error?.name === "not_found") return null;
    throw error;
  }
}

export async function listLocalAccounts(): Promise<LocalUserDoc[]> {
  const database = await accountsDb();
  const result = await (database as any).allDocs({ include_docs: true });
  return result.rows.map((row: any) => row.doc as LocalUserDoc);
}

export async function createLocalAccount(params: {
  username: string;
  password: string;
  role: LocalRole;
  firstName?: string;
  lastName?: string;
  email?: string | null;
}): Promise<{ doc: LocalUserDoc; recoveryCode: string }> {
  const existing = await findLocalAccountByUsername(params.username);
  if (existing) {
    throw new Error("username_taken");
  }
  const built = await buildLocalUserDoc(params);
  const database = await accountsDb();
  try {
    const result = await (database as any).put(built.doc);
    return {
      doc: { ...built.doc, _rev: result.rev },
      recoveryCode: built.recoveryCode,
    };
  } catch (error) {
    // Two concurrent creates for the same username can both pass the
    // check above before either writes - PouchDB's own `_id` conflict on
    // the loser is the real guarantee, translate it to the same error the
    // pre-check produces so callers only handle one case.
    if (isPouchConflictError(error)) {
      throw new Error("username_taken");
    }
    throw error;
  }
}

export async function verifyLocalLogin(
  username: string,
  password: string
): Promise<LocalUserDoc | null> {
  const doc = await findLocalAccountByUsername(username);
  if (!doc || !doc.active) return null;
  const valid = await verifySecret(password, doc.passwordHash);
  return valid ? doc : null;
}

export async function recoverLocalAccount(params: {
  username: string;
  recoveryCode: string;
  newPassword: string;
}): Promise<{ doc: LocalUserDoc; recoveryCode: string } | null> {
  const doc = await findLocalAccountByUsername(params.username);
  if (!doc) return null;
  const result = await resetPasswordWithRecoveryCode({
    doc,
    recoveryCode: params.recoveryCode,
    newPassword: params.newPassword,
  });
  if (!result) return null;
  const database = await accountsDb();
  const putResult = await (database as any).put(result.doc);
  return {
    doc: { ...result.doc, _rev: putResult.rev },
    recoveryCode: result.recoveryCode,
  };
}

export async function setLocalAccountRoleAndActive(params: {
  id: string;
  role?: LocalRole;
  active?: boolean;
}): Promise<LocalUserDoc> {
  const database = await accountsDb();
  const current: LocalUserDoc = await (database as any).get(params.id);

  const nextRole = params.role ?? current.role;
  const nextActive = params.active ?? current.active;
  const wasActiveAdmin = current.role === "admin" && current.active === true;
  const staysActiveAdmin = nextRole === "admin" && nextActive === true;

  if (wasActiveAdmin && !staysActiveAdmin) {
    const all = await listLocalAccounts();
    const otherActiveAdmins = all.filter(
      (doc) => doc._id !== current._id && doc.role === "admin" && doc.active
    );
    if (otherActiveAdmins.length === 0) {
      throw new LastAdminProtectedError();
    }
  }

  const updated: LocalUserDoc = {
    ...current,
    role: nextRole,
    active: nextActive,
    updatedAt: new Date().toISOString(),
  };
  const result = await (database as any).put(updated);
  return { ...updated, _rev: result.rev };
}
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no new errors from `pouchdb.ts` or `localAccountsStore.ts`

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/pouchdb.ts frontend/src/lib/localAccountsStore.ts
git commit -m "feat: add PouchDB-backed local accounts store with last-admin and conflict guards"
```

---

### Task 5: Wire local mode into `AuthContext`; suppress server contact everywhere else; add the install-mode gate

**Files:**
- Modify: `frontend/src/contexts/AuthContext.tsx` (full-file rewrite, interface unchanged)
- Modify: `frontend/src/contexts/TenantContext.tsx`
- Modify: `frontend/src/components/GlobalNativeLANAgent.tsx`
- Create: `frontend/src/components/InstallModeGate.tsx`
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Consumes: `getInstallMode` (Task 3); `getLocalAccountById`, `verifyLocalLogin`, `countLocalAccounts` (Task 4); `buildLocalTenant`, `toPublicLocalUser` (Task 2).
- Produces: `AuthContext`'s public shape is unchanged (see Global Constraints). `InstallModeGate` — a wrapper component with no props besides `children`, used in Task 10 once the setup pages exist.

- [ ] **Step 1: Add i18n keys**

In the `en` dictionary, find:
```ts
    dontHaveAccount: "Don't have an account? Register",
    forgotPassword: "Forgot password?",
```
Replace with:
```ts
    dontHaveAccount: "Don't have an account? Register",
    forgotPassword: "Forgot password?",
    installModeCheckFailed:
      "Couldn't access this device's local storage. Check that the app has permission to write data, then try again.",
    retry: "Retry",
```

In the `fr` dictionary, find:
```ts
    dontHaveAccount: "Vous n'avez pas de compte? S'inscrire",
    forgotPassword: "Mot de passe oublié?",
```
Replace with:
```ts
    dontHaveAccount: "Vous n'avez pas de compte? S'inscrire",
    forgotPassword: "Mot de passe oublié?",
    installModeCheckFailed:
      "Impossible d'accéder au stockage local de cet appareil. Vérifiez que l'application a le droit d'écrire des données, puis réessayez.",
    retry: "Réessayer",
```

- [ ] **Step 2: Rewrite `AuthContext.tsx`**

Replace the full contents of `frontend/src/contexts/AuthContext.tsx` with:

```tsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import type { User, Tenant } from "@shared/schema";
import { getInstallMode } from "@/lib/installMode";
import { getLocalAccountById, verifyLocalLogin } from "@/lib/localAccountsStore";
import { buildLocalTenant, toPublicLocalUser, type LocalUserDoc } from "@/lib/localAuth";

interface AuthContextType {
  user: Omit<User, "password"> | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  checkAuth: () => Promise<void>;
}

interface RegisterData {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email?: string;
  tenantId: string;
  role?: "admin" | "manager" | "cashier";
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const LOCAL_SESSION_KEY = "stockflow_local_session";
const LOCAL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface LocalSession {
  userId: string;
  expiresAt: number;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<Omit<User, "password"> | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const applyLocalSession = (doc: LocalUserDoc) => {
    const localTenant = buildLocalTenant(doc.createdAt);
    setUser(toPublicLocalUser(doc));
    setTenant(localTenant);
    setTenants([localTenant]);
  };

  const clearSession = () => {
    setUser(null);
    setTenant(null);
    setTenants([]);
  };

  const checkAuthLocal = async () => {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) {
      clearSession();
      return;
    }

    try {
      const session: LocalSession = JSON.parse(raw);
      if (session.expiresAt < Date.now()) {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        clearSession();
        return;
      }

      const doc = await getLocalAccountById(session.userId);
      if (!doc || !doc.active) {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        clearSession();
        return;
      }

      applyLocalSession(doc);
    } catch (error) {
      console.error("Failed to restore local session:", error);
      localStorage.removeItem(LOCAL_SESSION_KEY);
      clearSession();
    }
  };

  const checkAuthConnected = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setTenant(data.tenant);
        setTenants(
          Array.isArray(data.tenants)
            ? data.tenants
            : data.tenant
              ? [data.tenant]
              : []
        );
      } else {
        clearSession();
      }
    } catch (error) {
      console.error("Failed to check authentication:", error);
      clearSession();
    }
  };

  const checkAuth = async () => {
    setIsLoading(true);
    const mode = getInstallMode();
    if (mode === "local") {
      await checkAuthLocal();
    } else if (mode === "connected") {
      await checkAuthConnected();
    } else {
      // No install mode chosen yet - nothing to restore, and definitely no
      // server to ask. InstallModeGate is responsible for routing to /setup.
      clearSession();
    }
    setIsLoading(false);
  };

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loginLocal = async (username: string, password: string) => {
    const doc = await verifyLocalLogin(username, password);
    if (!doc) {
      throw new Error("Identifiants invalides");
    }
    const session: LocalSession = {
      userId: doc._id,
      expiresAt: Date.now() + LOCAL_SESSION_TTL_MS,
    };
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
    applyLocalSession(doc);
  };

  const loginConnected = async (username: string, password: string) => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Login failed");
    }

    const data = await response.json();
    setUser(data.user);
    setTenant(data.tenant);
    setTenants(
      Array.isArray(data.tenants)
        ? data.tenants
        : data.tenant
          ? [data.tenant]
          : []
    );
  };

  const login = async (username: string, password: string) => {
    if (getInstallMode() === "local") {
      await loginLocal(username, password);
    } else {
      await loginConnected(username, password);
    }
  };

  const logout = async () => {
    if (getInstallMode() === "local") {
      localStorage.removeItem(LOCAL_SESSION_KEY);
      clearSession();
      return;
    }

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearSession();
    }
  };

  const register = async (data: RegisterData) => {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
      credentials: "include",
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || "Registration failed");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        tenants,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        register,
        checkAuth,
      }}>
      {children}
    </AuthContext.Provider>
  );
};
```

- [ ] **Step 3: Suppress `TenantContext`'s server call in local mode**

In `frontend/src/contexts/TenantContext.tsx`, add the import:

```tsx
import { getInstallMode } from "@/lib/installMode";
```

Find:

```tsx
      // If not authenticated, try to fetch tenants (for registration page)
      try {
        const response = await fetch("/api/tenants", {
          credentials: "include",
        });
        if (response.ok) {
          const fetchedTenants = await response.json();
          setTenants(fetchedTenants);
        }
      } catch (error) {
        console.error("Failed to fetch tenants:", error);
      } finally {
        setIsLoading(false);
      }
```

Replace with:

```tsx
      if (getInstallMode() === "local") {
        // Local mode has no central tenants endpoint to ask, and never
        // should - the connected-mode registration page is unreachable here.
        setTenants([]);
        setIsLoading(false);
        return;
      }

      // If not authenticated, try to fetch tenants (for registration page)
      try {
        const response = await fetch("/api/tenants", {
          credentials: "include",
        });
        if (response.ok) {
          const fetchedTenants = await response.json();
          setTenants(fetchedTenants);
        }
      } catch (error) {
        console.error("Failed to fetch tenants:", error);
      } finally {
        setIsLoading(false);
      }
```

- [ ] **Step 4: Suppress `GlobalNativeLANAgent`'s server contact in local mode**

In `frontend/src/components/GlobalNativeLANAgent.tsx`, add the import:

```tsx
import { getInstallMode } from "@/lib/installMode";
```

Find the first effect's guard clause:

```tsx
  useEffect(() => {
    if (isLoading || !lanAgent.isAvailable()) return;
```

Replace with:

```tsx
  useEffect(() => {
    if (isLoading || !lanAgent.isAvailable() || getInstallMode() === "local")
      return;
```

Find the second effect's guard clause:

```tsx
  useEffect(() => {
    if (!isAuthenticated || !status.running || peers.length === 0) return;
```

Replace with:

```tsx
  useEffect(() => {
    if (
      !isAuthenticated ||
      !status.running ||
      peers.length === 0 ||
      getInstallMode() === "local"
    )
      return;
```

- [ ] **Step 5: Create `InstallModeGate.tsx`**

Create `frontend/src/components/InstallModeGate.tsx`:

```tsx
import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { getInstallMode } from "@/lib/installMode";
import { countLocalAccounts } from "@/lib/localAccountsStore";
import { useTranslation } from "@/lib/i18n";

const SETUP_PATHS = ["/setup", "/setup/create-admin"];
const CONNECTED_ONLY_PATHS = [
  "/register",
  "/reset-password",
  "/request-password-reset",
];

export const InstallModeGate: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [location, setLocation] = useLocation();
  const [checking, setChecking] = useState(true);
  const [failed, setFailed] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;

    const evaluate = async () => {
      try {
        const mode = getInstallMode();

        if (!mode) {
          if (location !== "/setup") setLocation("/setup");
          if (!cancelled) setChecking(false);
          return;
        }

        if (mode === "local") {
          const count = await countLocalAccounts();
          if (cancelled) return;
          if (count === 0 && location !== "/setup/create-admin") {
            setLocation("/setup/create-admin");
          } else if (
            count > 0 &&
            (SETUP_PATHS.includes(location) ||
              CONNECTED_ONLY_PATHS.includes(location))
          ) {
            setLocation("/login");
          }
          setChecking(false);
          return;
        }

        if (!cancelled) {
          if (SETUP_PATHS.includes(location)) {
            setLocation("/login");
          }
          setChecking(false);
        }
      } catch (error) {
        console.error("Install mode check failed:", error);
        if (!cancelled) {
          setFailed(true);
          setChecking(false);
        }
      }
    };

    evaluate();
    return () => {
      cancelled = true;
    };
  }, [location, setLocation]);

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="space-y-3 max-w-sm text-center">
          <p className="text-sm text-muted-foreground">
            {t("installModeCheckFailed")}
          </p>
          <Button onClick={() => window.location.reload()}>
            {t("retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (checking) return null;
  return <>{children}</>;
};
```

- [ ] **Step 6: Run the i18n completeness check and type-check**

Run: `npm run test:unit -- i18nCompleteness && npm run check`
Expected: PASS, no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/contexts/AuthContext.tsx frontend/src/contexts/TenantContext.tsx frontend/src/components/GlobalNativeLANAgent.tsx frontend/src/components/InstallModeGate.tsx frontend/src/lib/i18n.ts
git commit -m "feat: branch AuthContext on install mode and suppress server contact app-wide in local mode"
```

---

### Task 6: `RecoveryCodeDisplay` shared component

**Files:**
- Create: `frontend/src/components/RecoveryCodeDisplay.tsx`
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Produces: `RecoveryCodeDisplay: React.FC<{ recoveryCode: string; onContinue: () => void }>`, used by Tasks 8, 9, 11.

- [ ] **Step 1: Add i18n keys**

In `frontend/src/lib/i18n.ts`, find the `en` dictionary block containing the `retry` key added in Task 5 and add right after it:
```ts
    recoveryCodeTitle: "Save your recovery code",
    recoveryCodeWarning:
      "This code will only be shown once. Write it down somewhere safe — it's the only way to reset this account's password if it's ever forgotten.",
    recoveryCodeContinue: "I've saved it, continue",
```

In the `fr` dictionary, find the `retry` key added in Task 5 and add right after it:
```ts
    recoveryCodeTitle: "Notez votre code de récupération",
    recoveryCodeWarning:
      "Ce code ne sera affiché qu'une seule fois. Notez-le en lieu sûr — c'est le seul moyen de réinitialiser le mot de passe de ce compte s'il est un jour oublié.",
    recoveryCodeContinue: "Je l'ai noté, continuer",
```

- [ ] **Step 2: Write the component**

Create `frontend/src/components/RecoveryCodeDisplay.tsx`:

```tsx
import React from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface RecoveryCodeDisplayProps {
  recoveryCode: string;
  onContinue: () => void;
}

export const RecoveryCodeDisplay: React.FC<RecoveryCodeDisplayProps> = ({
  recoveryCode,
  onContinue,
}) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <div className="flex justify-center text-amber-500">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <p className="text-sm text-muted-foreground text-center">
        {t("recoveryCodeWarning")}
      </p>
      <div
        className="text-center text-2xl font-mono tracking-widest bg-muted rounded-lg py-4 select-all"
        data-testid="text-recovery-code">
        {recoveryCode}
      </div>
      <Button
        className="w-full"
        onClick={onContinue}
        data-testid="button-recovery-code-continue">
        {t("recoveryCodeContinue")}
      </Button>
    </div>
  );
};
```

- [ ] **Step 3: Run the i18n completeness check**

Run: `npm run test:unit -- i18nCompleteness`
Expected: PASS (new keys present in both `en` and `fr`)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/RecoveryCodeDisplay.tsx frontend/src/lib/i18n.ts
git commit -m "feat: add shared recovery-code display component"
```

---

### Task 7: `InstallModeSetup` page (first-launch mode choice)

**Files:**
- Create: `frontend/src/pages/InstallModeSetup.tsx`
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Consumes: `setInstallMode` (Task 3), `BrandMark` (existing component).
- Produces: default-exported page component, routed at `/setup` in Task 10.

- [ ] **Step 1: Add i18n keys**

In the `en` dictionary, right after the `recoveryCodeContinue` key added in Task 6, add:
```ts
    installModeTitle: "Set up this installation",
    installModeLocalTitle: "Keep this installation offline",
    installModeLocalDescription:
      "Accounts are created and stored only on this device. No server connection is ever required.",
    installModeConnectedTitle: "Connect this installation to a server",
    installModeConnectedDescription:
      "Sign in with an account managed by your central StockFlow server.",
```

In the `fr` dictionary, right after the `recoveryCodeContinue` key added in Task 6, add:
```ts
    installModeTitle: "Configurer cette installation",
    installModeLocalTitle: "Garder cette installation hors-ligne",
    installModeLocalDescription:
      "Les comptes sont créés et stockés uniquement sur cet appareil. Aucune connexion à un serveur n'est jamais nécessaire.",
    installModeConnectedTitle: "Connecter cette installation à un serveur",
    installModeConnectedDescription:
      "Se connecter avec un compte géré par votre serveur StockFlow central.",
```

- [ ] **Step 2: Write the page**

Create `frontend/src/pages/InstallModeSetup.tsx`:

```tsx
import React from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BrandMark } from "@/components/BrandMark";
import { setInstallMode } from "@/lib/installMode";
import { useTranslation } from "@/lib/i18n";

export default function InstallModeSetup() {
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const choose = (mode: "local" | "connected") => {
    setInstallMode(mode);
    setLocation(mode === "local" ? "/setup/create-admin" : "/login");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("installModeTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            className="w-full h-auto flex-col items-start py-4 text-left whitespace-normal"
            variant="outline"
            onClick={() => choose("local")}
            data-testid="button-install-mode-local">
            <span className="font-semibold">{t("installModeLocalTitle")}</span>
            <span className="text-sm text-muted-foreground font-normal">
              {t("installModeLocalDescription")}
            </span>
          </Button>
          <Button
            className="w-full h-auto flex-col items-start py-4 text-left whitespace-normal"
            variant="outline"
            onClick={() => choose("connected")}
            data-testid="button-install-mode-connected">
            <span className="font-semibold">
              {t("installModeConnectedTitle")}
            </span>
            <span className="text-sm text-muted-foreground font-normal">
              {t("installModeConnectedDescription")}
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Run the i18n completeness check**

Run: `npm run test:unit -- i18nCompleteness`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/InstallModeSetup.tsx frontend/src/lib/i18n.ts
git commit -m "feat: add install-mode setup page"
```

---

### Task 8: `CreateLocalAdmin` page (first-account bootstrap)

**Files:**
- Create: `frontend/src/pages/CreateLocalAdmin.tsx`
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Consumes: `createLocalAccount` (Task 4), `RecoveryCodeDisplay` (Task 6), `BrandMark`.
- Produces: default-exported page component, routed at `/setup/create-admin` in Task 10.

- [ ] **Step 1: Add i18n keys**

In the `en` dictionary, right after the `installModeConnectedDescription` key added in Task 7, add:
```ts
    createLocalAdminTitle: "Create the administrator account",
    usernameTaken: "That username is already taken",
```

In the `fr` dictionary, right after the `installModeConnectedDescription` key added in Task 7, add:
```ts
    createLocalAdminTitle: "Créer le compte administrateur",
    usernameTaken: "Ce nom d'utilisateur est déjà pris",
```

- [ ] **Step 2: Write the page**

Create `frontend/src/pages/CreateLocalAdmin.tsx`:

```tsx
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { RecoveryCodeDisplay } from "@/components/RecoveryCodeDisplay";
import { createLocalAccount } from "@/lib/localAccountsStore";
import { useTranslation } from "@/lib/i18n";

export default function CreateLocalAdmin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: t("validationError"),
        description: t("passwordsDoNotMatch"),
        variant: "destructive",
      });
      return;
    }
    if (password.length < 6) {
      toast({
        title: t("validationError"),
        description: t("passwordMinLength"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await createLocalAccount({
        username,
        password,
        role: "admin",
      });
      setRecoveryCode(result.recoveryCode);
    } catch (error: any) {
      toast({
        title: t("registrationFailed"),
        description:
          error?.message === "username_taken"
            ? t("usernameTaken")
            : error?.message === "password_too_short"
              ? t("passwordMinLength")
              : t("registrationError"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (recoveryCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
            </div>
            <CardTitle className="text-xl font-bold">
              {t("recoveryCodeTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecoveryCodeDisplay
              recoveryCode={recoveryCode}
              onContinue={() => setLocation("/login")}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("createLocalAdminTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                disabled={isLoading}
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isLoading}
                data-testid="input-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isLoading}
                data-testid="input-confirm-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-create-admin">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("creatingAccount")}
                </>
              ) : (
                t("createAccount")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Run the i18n completeness check**

Run: `npm run test:unit -- i18nCompleteness`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/CreateLocalAdmin.tsx frontend/src/lib/i18n.ts
git commit -m "feat: add local-admin bootstrap page"
```

---

### Task 9: `LocalPasswordRecovery` page + `Login.tsx` branching

**Files:**
- Create: `frontend/src/pages/LocalPasswordRecovery.tsx`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Consumes: `recoverLocalAccount` (Task 4), `RecoveryCodeDisplay` (Task 6), `getInstallMode` (Task 3).
- Produces: default-exported page component, routed at `/local-recovery` in Task 10.

- [ ] **Step 1: Add i18n keys**

In the `en` dictionary, right after `usernameTaken` (added in Task 8), add:
```ts
    localRecoveryTitle: "Recover this account",
    recoveryCodeLabel: "Recovery code",
    localRecoverySubmit: "Reset password",
    recoveryFailed: "Recovery failed",
    recoveryInvalidCode: "Unknown username or invalid recovery code",
```

In the `fr` dictionary, right after `usernameTaken` (added in Task 8), add:
```ts
    localRecoveryTitle: "Récupérer ce compte",
    recoveryCodeLabel: "Code de récupération",
    localRecoverySubmit: "Réinitialiser le mot de passe",
    recoveryFailed: "Échec de la récupération",
    recoveryInvalidCode: "Nom d'utilisateur inconnu ou code de récupération invalide",
```

- [ ] **Step 2: Write the page**

Create `frontend/src/pages/LocalPasswordRecovery.tsx`:

```tsx
import React, { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { RecoveryCodeDisplay } from "@/components/RecoveryCodeDisplay";
import { recoverLocalAccount } from "@/lib/localAccountsStore";
import { useTranslation } from "@/lib/i18n";

export default function LocalPasswordRecovery() {
  const [username, setUsername] = useState("");
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [newRecoveryCode, setNewRecoveryCode] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast({
        title: t("validationError"),
        description: t("passwordMinLength"),
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await recoverLocalAccount({
        username,
        recoveryCode: recoveryCodeInput,
        newPassword,
      });
      if (!result) {
        toast({
          title: t("recoveryFailed"),
          description: t("recoveryInvalidCode"),
          variant: "destructive",
        });
        return;
      }
      setNewRecoveryCode(result.recoveryCode);
    } catch (error) {
      toast({
        title: t("recoveryFailed"),
        description:
          error instanceof Error && error.message === "password_too_short"
            ? t("passwordMinLength")
            : t("recoveryInvalidCode"),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (newRecoveryCode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
            </div>
            <CardTitle className="text-xl font-bold">
              {t("recoveryCodeTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <RecoveryCodeDisplay
              recoveryCode={newRecoveryCode}
              onContinue={() => setLocation("/login")}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-4">
            <BrandMark className="w-16 h-16 drop-shadow-[0_4px_10px_rgba(29,78,216,0.35)]" />
          </div>
          <CardTitle className="text-xl font-bold">
            {t("localRecoveryTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t("username")}</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isLoading}
                data-testid="input-username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recoveryCode">{t("recoveryCodeLabel")}</Label>
              <Input
                id="recoveryCode"
                type="text"
                value={recoveryCodeInput}
                onChange={(e) =>
                  setRecoveryCodeInput(e.target.value.trim().toUpperCase())
                }
                required
                placeholder="XXXX-XXXX-XXXX"
                disabled={isLoading}
                data-testid="input-recovery-code"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">{t("newPassword")}</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                disabled={isLoading}
                data-testid="input-new-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="button-recover-account">
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("loading")}
                </>
              ) : (
                t("localRecoverySubmit")
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Branch `Login.tsx`'s forgot-password/register links on install mode**

In `frontend/src/pages/Login.tsx`, add the import (alongside the existing imports):

```tsx
import { getInstallMode } from "@/lib/installMode";
```

Replace the two footer `<div>` blocks (currently):

```tsx
          <div className="mt-4 text-center text-sm">
            <button
              type="button"
              onClick={() => setLocation("/register")}
              className="text-primary hover:underline"
              disabled={isLoading}>
              {t("dontHaveAccount")}
            </button>
          </div>
          <div className="mt-2 text-center text-sm">
            <button
              type="button"
              onClick={() => setLocation("/reset-password")}
              className="text-muted-foreground hover:underline"
              disabled={isLoading}>
              {t("forgotPassword")}
            </button>
          </div>
```

with:

```tsx
          {getInstallMode() !== "local" && (
            <div className="mt-4 text-center text-sm">
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-primary"
                onClick={() => setLocation("/register")}
                disabled={isLoading}>
                {t("dontHaveAccount")}
              </Button>
            </div>
          )}
          <div className="mt-2 text-center text-sm">
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-muted-foreground"
              onClick={() =>
                setLocation(
                  getInstallMode() === "local"
                    ? "/local-recovery"
                    : "/reset-password"
                )
              }
              disabled={isLoading}>
              {t("forgotPassword")}
            </Button>
          </div>
```

`Button` is already imported in `Login.tsx` (used for the submit button) — no new import needed for it.

- [ ] **Step 4: Run the i18n completeness check and type-check**

Run: `npm run test:unit -- i18nCompleteness && npm run check`
Expected: PASS, no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LocalPasswordRecovery.tsx frontend/src/pages/Login.tsx frontend/src/lib/i18n.ts
git commit -m "feat: add local password recovery flow"
```

---

### Task 10: Register routes and the install-mode gate in `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `InstallModeGate` (Task 5), `InstallModeSetup` (Task 7), `CreateLocalAdmin` (Task 8), `LocalPasswordRecovery` (Task 9).

This task exists on its own, after every page it references has been created (Tasks 5, 7, 8, 9) — the previous version of this plan wired these routes in the same task that created `InstallModeGate`, before the page files existed, which would have failed `npm run check`. Splitting it out fixes that ordering.

- [ ] **Step 1: Add imports**

In `frontend/src/App.tsx`, add these imports after the existing `PasswordResetRequest` import:

```tsx
import InstallModeSetup from "./pages/InstallModeSetup";
import CreateLocalAdmin from "./pages/CreateLocalAdmin";
import LocalPasswordRecovery from "./pages/LocalPasswordRecovery";
import { InstallModeGate } from "./components/InstallModeGate";
```

- [ ] **Step 2: Register the three new public routes**

Add right after `<Route path="/request-password-reset" component={PasswordResetRequest} />`:

```tsx
      <Route path="/setup" component={InstallModeSetup} />
      <Route path="/setup/create-admin" component={CreateLocalAdmin} />
      <Route path="/local-recovery" component={LocalPasswordRecovery} />
```

- [ ] **Step 3: Wrap `<Router />` with `<InstallModeGate>`**

Replace the `<Router />` line inside `App()` with:

```tsx
                  <InstallModeGate>
                    <Router />
                  </InstallModeGate>
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: no errors

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev` (from `frontend/`). Clear `localStorage` for `localhost:3000` (devtools) and visit `http://localhost:3000/`:
- Expect a redirect to `/setup`.
- Choose "Keep this installation offline" → redirected to `/setup/create-admin`.
- Create an admin account → recovery code screen appears → "Continue" lands on `/login`.
- Confirm "Register" is hidden and "Forgot password?" leads to `/local-recovery`.
- Reload the page → still on `/login` (not bounced back to `/setup*`), confirming the gate correctly treats an existing local account as "already set up."
- Log in → lands on the dashboard, sidebar renders normally (no changes needed there, confirming `AuthContext`'s shape held).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: register install-mode setup routes and gate the app on setup state"
```

---

### Task 11: `Staff.tsx` local-mode integration

**Files:**
- Modify: `frontend/src/pages/Staff.tsx`
- Modify: `frontend/src/lib/i18n.ts`

**Interfaces:**
- Consumes: `listLocalAccounts`, `createLocalAccount`, `setLocalAccountRoleAndActive`, `LastAdminProtectedError` (Task 4); `toPublicLocalUser` (Task 2); `getInstallMode` (Task 3); `RecoveryCodeDisplay` (Task 6).
- Local-mode "delete" maps to deactivation (`active: false`), not physical removal — consistent with spec §6.4 ("créer/désactiver/changer le rôle"), which does not include hard delete.
- Local-mode "edit" updates role only (there is no `isActive` form field in the existing modal — it's only ever toggled through the delete/deactivate action, confirmed by reading `Staff.tsx`). Username/password/first name/last name/email stay editable-looking in the shared form but are silently ignored by the connected-mode path too if unchanged; for local mode specifically, those fields are hidden entirely while editing, since editing them isn't wired to `localAccountsStore` and leaving them visible-but-inert would be misleading.
- Attempting to deactivate or demote the last active admin (including yourself) throws `LastAdminProtectedError`, shown as a dedicated toast rather than the generic failure message.

- [ ] **Step 1: Add i18n keys**

In the `en` dictionary, right after `recoveryInvalidCode` (added in Task 9), add:
```ts
    lastAdminProtected:
      "This is the only active administrator account - deactivate or demote another admin first.",
    localEditRoleOnlyNotice:
      "Only the role can be changed here. To deactivate this account, use the delete action instead.",
```

In the `fr` dictionary, right after `recoveryInvalidCode` (added in Task 9), add:
```ts
    lastAdminProtected:
      "C'est le seul compte administrateur actif - désactivez ou rétrogradez un autre admin d'abord.",
    localEditRoleOnlyNotice:
      "Seul le rôle peut être modifié ici. Pour désactiver ce compte, utilisez plutôt l'action de suppression.",
```

- [ ] **Step 2: Add imports and the `installMode` read**

In `frontend/src/pages/Staff.tsx`, add to the imports:

```tsx
import { getInstallMode } from "@/lib/installMode";
import {
  createLocalAccount,
  LastAdminProtectedError,
  listLocalAccounts,
  setLocalAccountRoleAndActive,
} from "@/lib/localAccountsStore";
import { toPublicLocalUser } from "@/lib/localAuth";
import { RecoveryCodeDisplay } from "@/components/RecoveryCodeDisplay";
```

Inside the `Staff` component, right after `const staffPolicy = usePolicy(StaffPolicy);`, add:

```tsx
  const installMode = getInstallMode();
  const [localRecoveryCode, setLocalRecoveryCode] = useState<string | null>(
    null
  );
```

- [ ] **Step 3: Branch the staff list query**

Replace the existing query (currently):

```tsx
  // Fetch staff members
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["/api/staff", currentTenant?.id],
    enabled: !!currentTenant?.id,
  });
```

with:

```tsx
  // Fetch staff members
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["/api/staff", currentTenant?.id, installMode],
    enabled: installMode === "local" ? true : !!currentTenant?.id,
    queryFn:
      installMode === "local"
        ? async () => (await listLocalAccounts()).map(toPublicLocalUser)
        : undefined,
  });
```

- [ ] **Step 4: Branch the save mutation**

Replace the existing mutation function body (currently):

```tsx
  // Create/Update staff mutation
  const saveStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      const method = editingStaff ? "PUT" : "POST";
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : "/api/staff";

      const response = await offlineApiRequest(
        method,
        url,
        {
          ...data,
          tenantId: currentTenant?.id,
        },
        { collection: "staff" }
      );

      return response.json();
    },
```

with:

```tsx
  // Create/Update staff mutation
  const saveStaffMutation = useMutation({
    mutationFn: async (data: any) => {
      if (installMode === "local") {
        if (editingStaff) {
          await setLocalAccountRoleAndActive({
            id: editingStaff.id,
            role: data.role,
          });
          return {};
        }
        const result = await createLocalAccount({
          username: data.username,
          password: data.password,
          role: data.role,
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
        });
        setLocalRecoveryCode(result.recoveryCode);
        return {};
      }

      const method = editingStaff ? "PUT" : "POST";
      const url = editingStaff ? `/api/staff/${editingStaff.id}` : "/api/staff";

      const response = await offlineApiRequest(
        method,
        url,
        {
          ...data,
          tenantId: currentTenant?.id,
        },
        { collection: "staff" }
      );

      return response.json();
    },
```

Find the mutation's `onError` handler (currently):

```tsx
    onError: (error: unknown) => {
      void showApiErrorToast(
        toast,
        error,
        t("error"),
        t("failedToSaveStaff"),
        t("networkRequestFailed")
      );
    },
```

Replace with:

```tsx
    onError: (error: unknown) => {
      if (error instanceof LastAdminProtectedError) {
        toast({
          title: t("error"),
          description: t("lastAdminProtected"),
          variant: "destructive",
        });
        return;
      }
      if (error instanceof Error && error.message === "username_taken") {
        toast({
          title: t("error"),
          description: t("usernameTaken"),
          variant: "destructive",
        });
        return;
      }
      if (error instanceof Error && error.message === "password_too_short") {
        toast({
          title: t("error"),
          description: t("passwordMinLength"),
          variant: "destructive",
        });
        return;
      }
      void showApiErrorToast(
        toast,
        error,
        t("error"),
        t("failedToSaveStaff"),
        t("networkRequestFailed")
      );
    },
```

- [ ] **Step 5: Branch the delete action**

Add a new mutation right after `deleteStaffMutation`:

```tsx
  // Deactivate local account mutation (local mode's equivalent of delete)
  const deactivateLocalAccountMutation = useMutation({
    mutationFn: (id: string) =>
      setLocalAccountRoleAndActive({ id, active: false }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({
        title: t("success"),
        description: t("staffDeletedSuccessfully"),
      });
    },
    onError: (error: unknown) => {
      if (error instanceof LastAdminProtectedError) {
        toast({
          title: t("error"),
          description: t("lastAdminProtected"),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: t("error"),
        description: t("failedToDeleteStaff"),
        variant: "destructive",
      });
    },
  });
```

Replace `handleDeleteStaff` (currently):

```tsx
  const handleDeleteStaff = (member: any) => {
    if (
      window.confirm(
        `${t("confirmDeleteStaff")} ${member.firstName} ${member.lastName} ?`
      )
    ) {
      deleteStaffMutation.mutate(member.id);
    }
  };
```

with:

```tsx
  const handleDeleteStaff = (member: any) => {
    if (
      window.confirm(
        `${t("confirmDeleteStaff")} ${member.firstName} ${member.lastName} ?`
      )
    ) {
      if (installMode === "local") {
        deactivateLocalAccountMutation.mutate(member.id);
      } else {
        deleteStaffMutation.mutate(member.id);
      }
    }
  };
```

- [ ] **Step 6: Hide the non-role fields when editing a local account**

In the staff form JSX, find the block that starts with the first/last name grid (search for `{/* Hidden field for tenantId */}`, immediately followed by `<div className="grid grid-cols-2 gap-4">` containing firstName/lastName, then the username field, then the password field, then the email field — this whole span, up to but not including the role `<div className="space-y-2">` block).

Wrap that whole span (firstName/lastName grid through the email field, i.e. everything between the hidden `tenantId` input and the role field) in a condition:

```tsx
            {!(installMode === "local" && editingStaff) && (
              <>
                {/* ... existing firstName/lastName grid, username field,
                     password field, email field, unchanged ... */}
              </>
            )}
            {installMode === "local" && editingStaff && (
              <p className="text-xs text-muted-foreground">
                {t("localEditRoleOnlyNotice")}
              </p>
            )}
```

i.e. the existing JSX for those four fields is not rewritten, just wrapped in `{!(installMode === "local" && editingStaff) && (<>...</>)}`, with a short explanatory line shown in its place when local-editing.

- [ ] **Step 7: Show the recovery code after creating a local account, without accidental dismissal**

Find the `<Dialog open={showStaffModal} ...>` block that wraps the staff form and add a second `Dialog` right after it:

```tsx
      <Dialog
        open={localRecoveryCode !== null}
        onOpenChange={() => {
          /* Only the explicit "continue" button below closes this - the
             code is shown once and must not be dismissed by an accidental
             outside click or Escape press. */
        }}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t("recoveryCodeTitle")}</DialogTitle>
          </DialogHeader>
          {localRecoveryCode && (
            <RecoveryCodeDisplay
              recoveryCode={localRecoveryCode}
              onContinue={() => setLocalRecoveryCode(null)}
            />
          )}
        </DialogContent>
      </Dialog>
```

- [ ] **Step 8: Type-check**

Run: `npm run check`
Expected: no errors

- [ ] **Step 9: Manual smoke test**

In local mode, as the admin created in Task 8/10: go to `/staff`, create a manager account, confirm the recovery-code dialog appears and can't be dismissed by clicking outside or pressing Escape; edit that account's role to `cashier` and confirm the non-role fields are hidden with the explanatory note instead; click delete, confirm it becomes inactive; attempt to deactivate or demote your own (only) admin account and confirm the `lastAdminProtected` toast appears instead of succeeding; log out and log back in as the new account to confirm it authenticates.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/pages/Staff.tsx frontend/src/lib/i18n.ts
git commit -m "feat: branch staff management on install mode with last-admin protection"
```

---

## Self-Review Notes

- **Spec coverage:** §3 (explicit mode choice) → Task 7 + `InstallModeGate` (Task 5, wired in Task 10). §5 (data model) → Task 2 (extended additively with `firstName`/`lastName`/`email`, called out in Global Constraints). §6.1 (bootstrap) → Task 8. §6.2 (login/session) → Task 5. §6.3 (recovery) → Task 9. §6.4 (staff management) → Task 11. §7 (security: argon2id, no plaintext persistence, generic errors) → Tasks 2, 4, 8, 9. §8 (error handling) → Tasks 8, 9, 11 (`usernameTaken`, generic `recoveryInvalidCode`, PouchDB `_id` conflict surfaced as `username_taken`). §9 (tests) → Task 2 fully unit-tested; Tasks 4-11 intentionally untested glue/I/O, matching the existing convention (confirmed as a decision, not an oversight).
- **Placeholder scan:** no TBD/TODO; every step has literal code or an exact command.
- **Type consistency:** `LocalUserDoc`, `LocalRole`, `BuildLocalUserResult` (Task 2) are the single source of truth reused verbatim in Tasks 4, 5, 8, 9, 11 — no renamed duplicates. `getInstallMode`/`setInstallMode`/`InstallMode` (Task 3) likewise reused as-is everywhere. Error classes (`WeakLocalPasswordError` in Task 2; `LocalStorageUnavailableError`, `LastAdminProtectedError` in Task 4) are defined once and imported by name wherever caught (Tasks 8, 9, 11).
- **Post-review fixes folded in:** mock-database detection (Task 4), task ordering so `App.tsx` only imports pages that already exist (Task 10 split out from the old Task 5), app-wide server-contact suppression beyond `AuthContext` (Task 5: `TenantContext`, `GlobalNativeLANAgent`), centralized password-length policy (Task 2), PouchDB conflict → `username_taken` translation (Task 4), last-admin protection scoped to local mode only (Task 4, per explicit decision), unhandled-rejection paths in `InstallModeGate` and `LocalPasswordRecovery` (Tasks 5, 9), misleading Staff edit fields in local mode (Task 11), non-uniform recovery-code sampling (Task 2), unprotected connected-only routes (Task 5's `InstallModeGate`), and accidental dismissal of the recovery-code dialog (Task 11).
