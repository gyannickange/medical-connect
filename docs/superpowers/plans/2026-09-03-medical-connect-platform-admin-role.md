# Platform Admin Role Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce a cross-tenant `platform_admin` role that provisions tenants and each tenant's first admin user, closing the public self-registration endpoint.

**Architecture:** A `platform_admin` is a `User` document like any other, with `tenantId: null` instead of a real tenant — no new CouchDB document type. A new `platform` module (`POST /api/platform/tenants`) is the only way to create a tenant + its first user together, gated by a `platform_admin`-only policy. `GET /api/tenants` gets scoped by role. Every backend call site that reads `user.tenantId` is audited and, where needed, made to tolerate `null`. The frontend gets a standalone `PlatformAdmin` page (no `Layout`), a login redirect branch, and an `InitialSetupGate` bypass so a tenant-less session never gets stuck waiting for a tenant that will never exist.

**Tech Stack:** NestJS (Fastify) + CouchDB (`nano`) backend; Vite + React + TypeScript + Wouter frontend; Jest (backend, `*.spec.ts`, plain mocked deps) and Vitest (frontend, `*.test.ts`, no jsdom/RTL).

**Spec:** `docs/superpowers/specs/2026-09-03-medical-connect-platform-admin-role-design.md`

## Global Constraints

- Every existing route's URL/method/response shape stays frozen except where the spec explicitly calls out a confirmed breaking change (`POST /api/auth/register` → always `410 Gone`) — this project ships as an independently-updated desktop app per tenant, per `CLAUDE.md`.
- Tenant scoping is always derived from `req.user.tenantId` (the authenticated session), never a client-supplied value.
- Auth/authorization: `@UseGuards(JwtAuthGuard, PolicyGuard)` on controllers + `@CheckPolicy(SomePolicy, "action")` per route, backed by a `SomePolicy extends BasePolicy` class — no ad-hoc `if` role checks in controllers/services.
- Every request body goes through a `class-validator` DTO.
- Backend tests: `*.spec.ts`, service/policy constructed directly with plain Jest-mocked dependencies (`new Foo(mockedDep as any)`), no `TestingModule`.
- Frontend: no jsdom/RTL in this repo — business logic lives in tested `lib/` functions; thin components stay untested. Every new user-facing string goes through `t("key")` in **both** `en` and `fr` dictionaries (`frontend/src/lib/i18nCompleteness.test.ts` enforces this for *used* keys).
- Frontend UI: reuse `frontend/src/components/ui/` primitives — never hand-roll a `<button>`/`<input>`/card with raw elements.
- Per `CLAUDE.md`, commits are **not** made per task in this plan — implement and test every task with changes left uncommitted, then the user is asked once at the end whether/how to commit. Do not run `git commit` during task execution.

---

## Task 1: `platform_admin` role & policy foundation (backend)

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `backend/src/modules/auth/policies/policy.types.ts`
- Modify: `backend/src/modules/auth/policies/base.policy.ts`
- Test: `backend/src/modules/auth/policies/base.policy.spec.ts`

**Interfaces:**
- Produces: `User["role"]`/`InsertUser["role"]` gain `"platform_admin"`; `User.tenantId`/`InsertUser.tenantId` become `string | null`; `UserRole` (policy.types.ts) gains `"platform_admin"`; `RequestWithUser["user"].tenantId: string | null`; `BasePolicy.isPlatformAdmin(): boolean`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/modules/auth/policies/base.policy.spec.ts`:

```ts
describe("BasePolicy.isPlatformAdmin", () => {
  it("is true only for platform_admin", () => {
    const policy = new TestPolicy();
    policy.setUser({ id: "u1", username: "root", tenantId: null, role: "platform_admin" } as any);
    expect((policy as any).isPlatformAdmin()).toBe(true);

    policy.setUser({ id: "u2", username: "clinic-admin", tenantId: "t1", role: "admin" } as any);
    expect((policy as any).isPlatformAdmin()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/auth/policies/base.policy.spec.ts`
Expected: FAIL — `(policy as any).isPlatformAdmin is not a function`.

- [ ] **Step 3: Add `"platform_admin"` to the schema and policy types**

In `backend/src/shared/schema.ts`, replace:

```ts
export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien"; tenantId: string; isActive: boolean; service: string | null; specialty: string | null; matricule: string | null; fonction: string | null; photoS3Key: string | null; createdAt: Date }
export interface InsertUser { id?: string; username: string; password: string; firstName: string; lastName: string; email?: string | null; role?: User["role"]; tenantId: string; isActive?: boolean; service?: string | null; specialty?: string | null; matricule?: string | null; fonction?: string | null }
```

with:

```ts
export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien" | "platform_admin"; tenantId: string | null; isActive: boolean; service: string | null; specialty: string | null; matricule: string | null; fonction: string | null; photoS3Key: string | null; createdAt: Date }
export interface InsertUser { id?: string; username: string; password: string; firstName: string; lastName: string; email?: string | null; role?: User["role"]; tenantId: string | null; isActive?: boolean; service?: string | null; specialty?: string | null; matricule?: string | null; fonction?: string | null }
```

Further down the same file, replace:

```ts
export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien"]).optional(), tenantId: z.string(), isActive: z.boolean().optional(), service: nullableString, specialty: nullableString, matricule: nullableString, fonction: nullableString });
```

with:

```ts
export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien", "platform_admin"]).optional(), tenantId: z.string().nullable(), isActive: z.boolean().optional(), service: nullableString, specialty: nullableString, matricule: nullableString, fonction: nullableString });
```

In `backend/src/modules/auth/policies/policy.types.ts`, replace the whole file's content with:

```ts
import { Request } from "express";

export type UserRole =
  | "admin"
  | "manager"
  | "cashier"
  | "accueil"
  | "infirmier"
  | "medecin"
  | "laboratoire"
  | "pharmacien"
  | "platform_admin";

export interface RequestWithUser extends Request {
  user: {
    id: string;
    username: string;
    tenantId: string | null;
    role: UserRole;
    [key: string]: any;
  };
}

export type PolicyAction = string;

export type PolicyResult = boolean;
```

In `backend/src/modules/auth/policies/base.policy.ts`, replace:

```ts
  protected isPharmacien(): boolean {
    return this.hasRole("pharmacien");
  }

  protected isAdminOrManager(): boolean {
```

with:

```ts
  protected isPharmacien(): boolean {
    return this.hasRole("pharmacien");
  }

  protected isPlatformAdmin(): boolean {
    return this.hasRole("platform_admin");
  }

  protected isAdminOrManager(): boolean {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/auth/policies/base.policy.spec.ts`
Expected: PASS (both the new test and the existing `it.each` role-helper tests).

- [ ] **Step 5: Run the full backend test suite to check for compile fallout**

Run: `cd backend && npx jest`
Expected: PASS. `tenantId: string` is only compile-checked where a controller/service param type is explicitly `RequestWithUser["user"]` or `Tenant`/`User` — every controller in this codebase reads `req.user` as `any`, so this type widening should not break anything yet. If something fails to compile here, it's a real call site this plan's later tasks (4, 6) haven't reached yet — note it and continue; Tasks 4 and 6 fix the two known ones.

---

## Task 2: `findByRole` + `create-platform-admin` bootstrap script (backend)

**Files:**
- Modify: `backend/src/modules/identity/users.repository.ts`
- Test: `backend/src/modules/identity/users.repository.spec.ts`
- Create: `backend/scripts/create-platform-admin.ts`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: Task 1's `User["role"]` (now includes `"platform_admin"`) and `InsertUser.tenantId: string | null`.
- Produces: `UsersRepository.findByRole(role: User["role"]): Promise<User[]>`, `backend/scripts/create-platform-admin.ts` (operator-run, not unit-tested — matches `seed-database.ts`), npm script `db:create-platform-admin`.

- [ ] **Step 1: Write the failing test**

Append to `backend/src/modules/identity/users.repository.spec.ts`:

```ts
describe("UsersRepository.findByRole", () => {
  it("queries CouchDB by type and role", async () => {
    const db = {
      find: jest.fn().mockResolvedValue({
        docs: [
          {
            _id: "user:root",
            id: "root",
            type: "user",
            username: "root",
            role: "platform_admin",
            tenantId: null,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, {} as any);

    const result = await repository.findByRole("platform_admin");

    expect(db.find).toHaveBeenCalledWith({ selector: { type: "user", role: "platform_admin" } });
    expect(result).toHaveLength(1);
    expect(result[0].username).toBe("root");
  });

  it("returns an empty array when no user has that role", async () => {
    const db = { find: jest.fn().mockResolvedValue({ docs: [] }) };
    const repository = new UsersRepository({ getDatabase: jest.fn().mockResolvedValue(db) } as any, {} as any);

    await expect(repository.findByRole("platform_admin")).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest src/modules/identity/users.repository.spec.ts`
Expected: FAIL — `repository.findByRole is not a function`.

- [ ] **Step 3: Implement `findByRole`**

In `backend/src/modules/identity/users.repository.ts`, add this method right after `findByTenant` (before `create`):

```ts
  async findByRole(role: User["role"]): Promise<User[]> {
    const result = await (await this.db()).find({
      selector: { type: "user", role },
    });
    return (result.docs as any[]).map((doc) => this.hydrate(doc));
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest src/modules/identity/users.repository.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the bootstrap script**

Create `backend/scripts/create-platform-admin.ts`, mirroring `backend/scripts/seed-database.ts`'s direct-repository pattern:

```ts
import "dotenv/config";
import * as bcrypt from "bcrypt";
import { CouchDBService } from "../src/database/couchdb.service";
import { UsersRepository } from "../src/modules/identity/users.repository";
import { S3Service } from "../src/lib/s3.service";
import { normalizeUsername } from "../src/lib/exceptions";

async function main() {
  if (!process.env.COUCHDB_URL) throw new Error("COUCHDB_URL is required");

  const username = process.env.PLATFORM_ADMIN_USERNAME;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;
  const firstName = process.env.PLATFORM_ADMIN_FIRST_NAME ?? "Platform";
  const lastName = process.env.PLATFORM_ADMIN_LAST_NAME ?? "Admin";
  if (!username || !password) {
    throw new Error(
      "PLATFORM_ADMIN_USERNAME and PLATFORM_ADMIN_PASSWORD are required"
    );
  }

  const couch = new CouchDBService();
  const s3 = new S3Service();
  const users = new UsersRepository(couch, s3);

  const existing = await users.findByRole("platform_admin");
  if (existing.length > 0) {
    throw new Error(
      `A platform_admin already exists (username: ${existing[0].username}). Refusing to create another one.`
    );
  }

  const user = await users.create({
    username: normalizeUsername(username),
    password: await bcrypt.hash(password, 10),
    firstName,
    lastName,
    role: "platform_admin",
    tenantId: null,
  });

  console.log(`Created platform_admin ${user.username} (id: ${user.id})`);
}

main().catch((error) => {
  console.error("create-platform-admin failed:", error);
  process.exitCode = 1;
});
```

- [ ] **Step 6: Wire the npm script**

In `backend/package.json`, in the `"scripts"` block, insert a new line right after `"db:seed:demo"`:

```json
    "db:create-platform-admin": "tsx scripts/create-platform-admin.ts",
```

(so it reads `db:reset`, `db:seed`, `db:seed:demo`, `db:create-platform-admin`, `db:fresh`, ...).

- [ ] **Step 7: Verify the script compiles**

Run: `cd backend && npm run check:scripts`
Expected: no TypeScript errors.

---

## Task 3: Close self-registration & unify tenant-less login/me handling (backend)

**Files:**
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/auth/auth.service.spec.ts`
- Delete: `backend/src/modules/auth/dto/register.dto.ts`
- Delete: `backend/src/modules/auth/dto/register.dto.spec.ts`

**Interfaces:**
- Consumes: Task 1's nullable `tenantId`.
- Produces: `AuthService.register(): Promise<never>` (always throws `GoneException`); `AuthService.getTenantById(tenantId: string | null): Promise<Tenant | null>` (single null-tolerant helper, used by both `login()` and `AuthController.getCurrentUser`); `LoginResponse.tenant: Tenant | null`.

- [ ] **Step 1: Write the failing tests**

In `backend/src/modules/auth/auth.service.spec.ts`, replace the top import line:

```ts
import * as bcrypt from "bcrypt";
import { ForbiddenException } from "@nestjs/common";
import { AuthService } from "./auth.service";
```

with:

```ts
import * as bcrypt from "bcrypt";
import { GoneException } from "@nestjs/common";
import { AuthService } from "./auth.service";
```

Inside `describe("AuthService login", ...)`, right after the `"upgrades a valid legacy plaintext password after login"` test and before the closing `});` of that describe block, insert:

```ts
  it("logs in a platform admin without querying for a tenant", async () => {
    const passwordHash = await bcrypt.hash("secret123", 10);
    const platformAdmin = {
      id: "user-2",
      username: "root",
      password: passwordHash,
      firstName: "Root",
      lastName: "Admin",
      email: null,
      role: "platform_admin",
      tenantId: null,
      isActive: true,
      createdAt: new Date(),
    };
    const storage = {
      findByUsername: jest.fn().mockResolvedValue(platformAdmin),
      update: jest.fn(),
    };
    const tenants = { findById: jest.fn() };
    const jwt = { sign: jest.fn().mockReturnValue("token") };
    const service = new AuthService(storage as any, tenants as any, jwt as any);

    const result = await service.login("root", "secret123");

    expect(result.tenant).toBeNull();
    expect(tenants.findById).not.toHaveBeenCalled();
  });
```

Then delete the entire second top-level block — `describe("register", () => { ... })` (the one starting with `function repos(...)` and ending with the `"allows an admin of the correct tenant to register a new user"` test) — and replace it with:

```ts
describe("AuthService register", () => {
  it("always rejects self-registration", async () => {
    const service = new AuthService({} as any, {} as any, {} as any);

    await expect(service.register()).rejects.toThrow(GoneException);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/auth/auth.service.spec.ts`
Expected: FAIL — `service.register()` still requires positional args and doesn't throw `GoneException`; the platform-admin login test fails because `login()` still calls `tenantsRepository.findById(null)` unconditionally.

- [ ] **Step 3: Rewrite `AuthService.register`, `login`, and `getTenantById`**

In `backend/src/modules/auth/auth.service.ts`, replace the import block and interfaces:

```ts
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User, Tenant } from "@shared/schema";
import { UsersRepository } from "../identity/users.repository";
import { TenantsRepository } from "../identity/tenants.repository";
import * as bcrypt from "bcrypt";
import { timingSafeEqual } from "crypto";
import { normalizeUsername } from "../../lib/exceptions";

export interface LoginResponse {
  user: Omit<User, "password">;
  tenant: Tenant;
  access_token: string;
}

export interface RegisterResponse {
  user: Omit<User, "password">;
  tenant: Tenant;
}
```

with:

```ts
import {
  Injectable,
  UnauthorizedException,
  GoneException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User, Tenant } from "@shared/schema";
import { UsersRepository } from "../identity/users.repository";
import { TenantsRepository } from "../identity/tenants.repository";
import * as bcrypt from "bcrypt";
import { timingSafeEqual } from "crypto";
import { normalizeUsername } from "../../lib/exceptions";

export interface LoginResponse {
  user: Omit<User, "password">;
  tenant: Tenant | null;
  access_token: string;
}
```

Replace the entire `register(...)` method (from `async register(` through its closing `}`) with:

```ts
  async register(): Promise<never> {
    throw new GoneException(
      "Self-registration is disabled. Contact your platform administrator."
    );
  }
```

In `login()`, replace:

```ts
    const tenant = await this.tenantsRepository.findById(user.tenantId);
    if (!tenant) {
      throw new UnauthorizedException("Tenant not found");
    }
```

with:

```ts
    const tenant = await this.getTenantById(user.tenantId);
    if (user.tenantId !== null && !tenant) {
      throw new UnauthorizedException("Tenant not found");
    }
```

Replace `getTenantById`:

```ts
  async getTenantById(tenantId: string): Promise<Tenant | undefined> {
    return this.tenantsRepository.findById(tenantId);
  }
```

with:

```ts
  async getTenantById(tenantId: string | null): Promise<Tenant | null> {
    if (tenantId === null) return null;
    const tenant = await this.tenantsRepository.findById(tenantId);
    return tenant ?? null;
  }
```

- [ ] **Step 4: Simplify the controller and remove the dead requester-decoding path**

In `backend/src/modules/auth/auth.controller.ts`, replace:

```ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  Response,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from "./dto/password-reset.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { FastifyReply, FastifyRequest } from "fastify";

@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService
  ) {}

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

with:

```ts
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  Response,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import {
  RequestPasswordResetDto,
  ResetPasswordDto,
} from "./dto/password-reset.dto";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { FastifyReply, FastifyRequest } from "fastify";

@Controller("api/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.GONE)
  async register() {
    return this.authService.register();
  }
```

`getCurrentUser` needs no code change — it already just calls `this.authService.getTenantById(user.tenantId)`, which now tolerates `null` internally.

- [ ] **Step 5: Delete the now-unused `RegisterDto`**

Run: `rm backend/src/modules/auth/dto/register.dto.ts backend/src/modules/auth/dto/register.dto.spec.ts`

(Nothing else imports `RegisterDto` — confirmed via `grep -rln "RegisterDto" backend/src`, which only listed `auth.controller.ts` and the dto's own two files, both handled above.)

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && npx jest src/modules/auth/`
Expected: PASS.

---

## Task 4: Scope tenant listing & restrict tenant mutations to `platform_admin` (backend)

**Files:**
- Modify: `backend/src/modules/tenants/tenants.controller.ts`
- Modify: `backend/src/modules/tenants/tenants.service.ts`
- Modify: `backend/src/modules/tenants/tenants.policy.ts`
- Create: `backend/src/modules/tenants/tenants.service.spec.ts`
- Create: `backend/src/modules/tenants/tenants.policy.spec.ts`

**Interfaces:**
- Consumes: Task 1's `isPlatformAdmin()`, `RequestWithUser["user"]`.
- Produces: `TenantsService.findAll(user: RequestWithUser["user"]): Promise<Tenant[]>` (exported by `TenantsModule`, consumed directly by Task 5's `PlatformService` for tenant creation via `TenantsService.create`, already exported).

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/tenants/tenants.service.spec.ts`:

```ts
import { TenantsService } from "./tenants.service";

describe("TenantsService.findAll", () => {
  it("returns every tenant for a platform_admin", async () => {
    const tenants = [{ id: "t1" }, { id: "t2" }];
    const tenantsRepository = {
      findAll: jest.fn().mockResolvedValue(tenants),
      findById: jest.fn(),
    };
    const servicesRepository = { seedDefaults: jest.fn() };
    const service = new TenantsService(tenantsRepository as any, servicesRepository as any);

    const result = await service.findAll({
      id: "u1",
      username: "root",
      tenantId: null,
      role: "platform_admin",
    } as any);

    expect(result).toBe(tenants);
    expect(tenantsRepository.findById).not.toHaveBeenCalled();
  });

  it("returns only the caller's own tenant for a tenant-scoped role", async () => {
    const ownTenant = { id: "tenant-1", name: "Clinique" };
    const tenantsRepository = {
      findAll: jest.fn(),
      findById: jest.fn().mockResolvedValue(ownTenant),
    };
    const servicesRepository = { seedDefaults: jest.fn() };
    const service = new TenantsService(tenantsRepository as any, servicesRepository as any);

    const result = await service.findAll({
      id: "u2",
      username: "clinic-admin",
      tenantId: "tenant-1",
      role: "admin",
    } as any);

    expect(result).toEqual([ownTenant]);
    expect(tenantsRepository.findAll).not.toHaveBeenCalled();
  });
});

describe("TenantsService.create", () => {
  it("seeds default services for the new tenant", async () => {
    const tenant = { id: "tenant-2", name: "Nouvelle clinique" };
    const tenantsRepository = {
      create: jest.fn().mockResolvedValue({ tenant, provisioningSecret: "SECRET" }),
    };
    const servicesRepository = { seedDefaults: jest.fn().mockResolvedValue(undefined) };
    const service = new TenantsService(tenantsRepository as any, servicesRepository as any);

    await service.create({ name: "Nouvelle clinique" });

    expect(servicesRepository.seedDefaults).toHaveBeenCalledWith("tenant-2");
  });
});
```

Create `backend/src/modules/tenants/tenants.policy.spec.ts`:

```ts
import { TenantsPolicy } from "./tenants.policy";

describe("TenantsPolicy", () => {
  it("lets every role view the tenant list", () => {
    const policy = new TenantsPolicy();
    const roles = [
      "admin", "manager", "cashier", "accueil", "infirmier",
      "medecin", "laboratoire", "pharmacien", "platform_admin",
    ] as const;
    for (const role of roles) {
      policy.setUser({
        id: "u",
        username: "x",
        tenantId: role === "platform_admin" ? null : "tenant-1",
        role,
      } as any);
      expect(policy.view()).toBe(true);
    }
  });

  it("restricts create/update/delete to platform_admin only", () => {
    const policy = new TenantsPolicy();

    policy.setUser({ id: "u1", username: "root", tenantId: null, role: "platform_admin" } as any);
    expect(policy.create()).toBe(true);
    expect(policy.update()).toBe(true);
    expect(policy.delete()).toBe(true);

    policy.setUser({ id: "u2", username: "clinic-admin", tenantId: "tenant-1", role: "admin" } as any);
    expect(policy.create()).toBe(false);
    expect(policy.update()).toBe(false);
    expect(policy.delete()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/tenants/tenants.service.spec.ts src/modules/tenants/tenants.policy.spec.ts`
Expected: FAIL — `TenantsService.findAll` doesn't accept a `user` argument yet; `create`/`update`/`delete` still return `true` for `admin`.

- [ ] **Step 3: Implement the scoping and restriction**

In `backend/src/modules/tenants/tenants.controller.ts`, replace:

```ts
import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
```

with:

```ts
import { Controller, Get, Post, Body, UseGuards, Request } from "@nestjs/common";
```

and replace:

```ts
  @Get()
  @CheckPolicy(TenantsPolicy, "view")
  async findAll() {
    return this.tenantsService.findAll();
  }
```

with:

```ts
  @Get()
  @CheckPolicy(TenantsPolicy, "view")
  async findAll(@Request() req: any) {
    return this.tenantsService.findAll(req.user);
  }
```

In `backend/src/modules/tenants/tenants.service.ts`, replace:

```ts
import { Injectable } from "@nestjs/common";
import type { Tenant, InsertTenant } from "@shared/schema";
import { TenantsRepository } from "../identity/tenants.repository";
import { ServicesRepository } from "../services/services.repository";

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly servicesRepository: ServicesRepository
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantsRepository.findAll();
  }
```

with:

```ts
import { Injectable } from "@nestjs/common";
import type { Tenant, InsertTenant } from "@shared/schema";
import { TenantsRepository } from "../identity/tenants.repository";
import { ServicesRepository } from "../services/services.repository";
import type { RequestWithUser } from "../auth/policies/policy.types";

@Injectable()
export class TenantsService {
  constructor(
    private readonly tenantsRepository: TenantsRepository,
    private readonly servicesRepository: ServicesRepository
  ) {}

  async findAll(user: RequestWithUser["user"]): Promise<Tenant[]> {
    if (user.role === "platform_admin") {
      return this.tenantsRepository.findAll();
    }
    const own = user.tenantId ? await this.tenantsRepository.findById(user.tenantId) : undefined;
    return own ? [own] : [];
  }
```

In `backend/src/modules/tenants/tenants.policy.ts`, replace:

```ts
  create(): boolean {
    // Only admin can create
    return this.isAdmin();
  }

  update(): boolean {
    // Only admin can update
    return this.isAdmin();
  }

  delete(): boolean {
    // Only admin can delete
    return this.isAdmin();
  }
```

with:

```ts
  create(): boolean {
    // Only a platform admin can create a tenant
    return this.isPlatformAdmin();
  }

  update(): boolean {
    // Only a platform admin can update a tenant
    return this.isPlatformAdmin();
  }

  delete(): boolean {
    // Only a platform admin can delete a tenant
    return this.isPlatformAdmin();
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/modules/tenants/`
Expected: PASS.

---

## Task 5: `platform` module — create tenant + first admin (backend)

**Files:**
- Create: `backend/src/modules/platform/platform.policy.ts`
- Create: `backend/src/modules/platform/dto/create-platform-tenant.dto.ts`
- Create: `backend/src/modules/platform/dto/create-platform-tenant.dto.spec.ts`
- Create: `backend/src/modules/platform/platform.service.ts`
- Create: `backend/src/modules/platform/platform.service.spec.ts`
- Create: `backend/src/modules/platform/platform.controller.ts`
- Create: `backend/src/modules/platform/platform.module.ts`
- Create: `backend/src/modules/platform/platform.policy.spec.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: Task 1's `isPlatformAdmin()`; Task 4's `TenantsService.create(data: InsertTenant): Promise<{ tenant: Tenant; provisioningSecret: string }>` (exported by `TenantsModule`); `IdentityModule`'s exported `UsersRepository`.
- Produces: `POST /api/platform/tenants`; `PlatformService.createTenantWithAdmin(dto: CreatePlatformTenantDto): Promise<CreateTenantWithAdminResult>`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/platform/platform.policy.spec.ts`:

```ts
import { PlatformPolicy } from "./platform.policy";

describe("PlatformPolicy", () => {
  it("allows only platform_admin to create a tenant", () => {
    const policy = new PlatformPolicy();

    policy.setUser({ id: "u1", username: "root", tenantId: null, role: "platform_admin" } as any);
    expect(policy.createTenant()).toBe(true);

    policy.setUser({ id: "u2", username: "clinic-admin", tenantId: "tenant-1", role: "admin" } as any);
    expect(policy.createTenant()).toBe(false);
  });
});
```

Create `backend/src/modules/platform/platform.service.spec.ts`:

```ts
import { ConflictException } from "@nestjs/common";
import { PlatformService } from "./platform.service";

describe("PlatformService.createTenantWithAdmin", () => {
  const dto = {
    name: "Clinique du Nord",
    adminUsername: "nord-admin",
    adminPassword: "secret123",
    adminFirstName: "Awa",
    adminLastName: "Diop",
  } as any;

  it("creates the tenant via TenantsService (so default services get seeded), then its first admin user", async () => {
    const tenant = { id: "tenant-9", name: dto.name };
    const tenantsService = {
      create: jest.fn().mockResolvedValue({
        tenant,
        provisioningSecret: "AAAA-BBBB-CCCC",
      }),
    };
    const usersRepository = {
      findByUsername: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockResolvedValue({
        id: "user-9",
        username: "nord-admin",
        password: "hashed",
        firstName: "Awa",
        lastName: "Diop",
        email: null,
        role: "admin",
        tenantId: "tenant-9",
        isActive: true,
        createdAt: new Date(),
      }),
    };
    const service = new PlatformService(tenantsService as any, usersRepository as any);

    const result = await service.createTenantWithAdmin(dto);

    expect(usersRepository.findByUsername).toHaveBeenCalledWith("nord-admin");
    expect(tenantsService.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Clinique du Nord" })
    );
    expect(usersRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "admin",
        tenantId: "tenant-9",
        username: "nord-admin",
      })
    );
    expect(result.adminUser).not.toHaveProperty("password");
    expect(result.provisioningSecret).toBe("AAAA-BBBB-CCCC");
  });

  it("rejects a taken username before creating the tenant", async () => {
    const tenantsService = { create: jest.fn() };
    const usersRepository = {
      findByUsername: jest.fn().mockResolvedValue({ id: "existing" }),
      create: jest.fn(),
    };
    const service = new PlatformService(tenantsService as any, usersRepository as any);

    await expect(service.createTenantWithAdmin(dto)).rejects.toThrow(ConflictException);
    expect(tenantsService.create).not.toHaveBeenCalled();
  });
});
```

Create `backend/src/modules/platform/dto/create-platform-tenant.dto.spec.ts`:

```ts
import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreatePlatformTenantDto } from "./create-platform-tenant.dto";

describe("CreatePlatformTenantDto", () => {
  const validBase = {
    name: "Clinique du Nord",
    adminUsername: "nord-admin",
    adminPassword: "secret123",
    adminFirstName: "Awa",
    adminLastName: "Diop",
  };

  it("accepts a valid tenant + admin payload", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, validBase);
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("accepts optional tenant fields and adminEmail", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, {
      ...validBase,
      address: "123 Rue Principale",
      phone: "+225-01-23-45-67",
      email: "clinique@example.com",
      settings: { currency: "XOF" },
      isActive: true,
      adminEmail: "awa@example.com",
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it("rejects a missing tenant name", async () => {
    const { name, ...rest } = validBase;
    const dto = plainToInstance(CreatePlatformTenantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "name")).toBe(true);
  });

  it("rejects an admin username shorter than 3 characters", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, { ...validBase, adminUsername: "ab" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "adminUsername")).toBe(true);
  });

  it("rejects an admin password shorter than 6 characters", async () => {
    const dto = plainToInstance(CreatePlatformTenantDto, { ...validBase, adminPassword: "abc" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "adminPassword")).toBe(true);
  });

  it("rejects a missing adminFirstName/adminLastName", async () => {
    const { adminFirstName, adminLastName, ...rest } = validBase;
    const dto = plainToInstance(CreatePlatformTenantDto, rest);
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "adminFirstName")).toBe(true);
    expect(errors.some((e) => e.property === "adminLastName")).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/platform/`
Expected: FAIL — none of the source files exist yet (`Cannot find module './platform.policy'` etc.).

- [ ] **Step 3: Implement the module**

Create `backend/src/modules/platform/platform.policy.ts`:

```ts
import { Injectable } from "@nestjs/common";
import { BasePolicy } from "../auth/policies/base.policy";

@Injectable()
export class PlatformPolicy extends BasePolicy {
  createTenant(): boolean {
    return this.isPlatformAdmin();
  }
}
```

Create `backend/src/modules/platform/dto/create-platform-tenant.dto.ts`:

```ts
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  IsEmail,
  MinLength,
} from "class-validator";

export class CreatePlatformTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  adminUsername: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  adminPassword: string;

  @IsString()
  @IsNotEmpty()
  adminFirstName: string;

  @IsString()
  @IsNotEmpty()
  adminLastName: string;

  @IsEmail()
  @IsOptional()
  adminEmail?: string;
}
```

Create `backend/src/modules/platform/platform.service.ts`:

```ts
import { ConflictException, Injectable } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import type { Tenant, User } from "@shared/schema";
import { TenantsService } from "../tenants/tenants.service";
import { UsersRepository } from "../identity/users.repository";
import { normalizeUsername } from "../../lib/exceptions";
import { CreatePlatformTenantDto } from "./dto/create-platform-tenant.dto";

export interface CreateTenantWithAdminResult {
  tenant: Tenant;
  provisioningSecret: string;
  adminUser: Omit<User, "password">;
}

@Injectable()
export class PlatformService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly usersRepository: UsersRepository
  ) {}

  async createTenantWithAdmin(
    dto: CreatePlatformTenantDto
  ): Promise<CreateTenantWithAdminResult> {
    const username = normalizeUsername(dto.adminUsername);
    const existing = await this.usersRepository.findByUsername(username);
    if (existing) {
      throw new ConflictException("Username already exists");
    }

    // Via TenantsService (not TenantsRepository directly) so the tenant's
    // default services get seeded, matching POST /api/tenants.
    const { tenant, provisioningSecret } = await this.tenantsService.create({
      name: dto.name,
      address: dto.address ?? null,
      phone: dto.phone ?? null,
      email: dto.email ?? null,
      settings: dto.settings ?? null,
      isActive: dto.isActive,
    });

    const hashedPassword = await bcrypt.hash(dto.adminPassword, 10);
    const adminUser = await this.usersRepository.create({
      username,
      password: hashedPassword,
      firstName: dto.adminFirstName,
      lastName: dto.adminLastName,
      email: dto.adminEmail ?? null,
      role: "admin",
      tenantId: tenant.id,
      isActive: true,
    });

    const { password, ...sanitizedAdmin } = adminUser;
    return { tenant, provisioningSecret, adminUser: sanitizedAdmin };
  }
}
```

Create `backend/src/modules/platform/platform.controller.ts`:

```ts
import { Controller, Post, Body, UseGuards } from "@nestjs/common";
import { PlatformService } from "./platform.service";
import { CreatePlatformTenantDto } from "./dto/create-platform-tenant.dto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PolicyGuard } from "../auth/guards/policy.guard";
import { CheckPolicy } from "../auth/decorators/check-policy.decorator";
import { PlatformPolicy } from "./platform.policy";

@Controller("api/platform")
@UseGuards(JwtAuthGuard, PolicyGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Post("tenants")
  @CheckPolicy(PlatformPolicy, "createTenant")
  async createTenant(@Body() dto: CreatePlatformTenantDto) {
    return this.platformService.createTenantWithAdmin(dto);
  }
}
```

Create `backend/src/modules/platform/platform.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";
import { PlatformPolicy } from "./platform.policy";
import { AuthModule } from "../auth/auth.module";
import { IdentityModule } from "../identity/identity.module";
import { TenantsModule } from "../tenants/tenants.module";

@Module({
  imports: [AuthModule, IdentityModule, TenantsModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformPolicy],
})
export class PlatformModule {}
```

In `backend/src/app.module.ts`, add the import after `DeviceAuthorizationModule`'s:

```ts
import { DeviceAuthorizationModule } from "./modules/device-authorization/device-authorization.module";
```
→
```ts
import { DeviceAuthorizationModule } from "./modules/device-authorization/device-authorization.module";
import { PlatformModule } from "./modules/platform/platform.module";
```

and add `PlatformModule,` to the `imports` array right after `DeviceAuthorizationModule,`:

```ts
    LanIdentityModule,
    DeviceAuthorizationModule,
  ],
```
→
```ts
    LanIdentityModule,
    DeviceAuthorizationModule,
    PlatformModule,
  ],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/modules/platform/`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS.

---

## Task 6: Guard LAN-identity & device-authorization against tenant-less callers (backend)

**Files:**
- Modify: `backend/src/modules/lan-identity/lan-identity.controller.ts`
- Create: `backend/src/modules/lan-identity/lan-identity.controller.spec.ts`
- Modify: `backend/src/modules/device-authorization/device-authorization.controller.ts`
- Modify: `backend/src/modules/device-authorization/device-authorization.controller.spec.ts`

**Interfaces:**
- Consumes: Task 1's nullable `tenantId` on the JWT-derived `req.user`.
- Produces: both controllers reject a `platform_admin` caller (`tenantId: null`) with `403 Forbidden` on the routes that have no `@CheckPolicy` of their own.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/lan-identity/lan-identity.controller.spec.ts`:

```ts
import { ForbiddenException } from "@nestjs/common";
import { LanIdentityController } from "./lan-identity.controller";

describe("LanIdentityController.issueCertificate", () => {
  it("rejects a platform_admin, who has no tenant to issue a device certificate for", () => {
    const identities = { issueCertificate: jest.fn() };
    const controller = new LanIdentityController(identities as any);
    const request = { user: { id: "u1", tenantId: null, role: "platform_admin" } };

    expect(() =>
      controller.issueCertificate(
        { deviceId: "device-a", devicePublicKey: "pubkey" },
        request as any
      )
    ).toThrow(ForbiddenException);
    expect(identities.issueCertificate).not.toHaveBeenCalled();
  });

  it("issues a certificate for a tenant-scoped caller", () => {
    const identities = { issueCertificate: jest.fn().mockReturnValue({ certificate: "cert" }) };
    const controller = new LanIdentityController(identities as any);
    const request = { user: { id: "u1", tenantId: "tenant-1", role: "admin" } };

    controller.issueCertificate(
      { deviceId: "device-a", devicePublicKey: "pubkey" },
      request as any
    );

    expect(identities.issueCertificate).toHaveBeenCalledWith("tenant-1", "device-a", "pubkey");
  });
});
```

In `backend/src/modules/device-authorization/device-authorization.controller.spec.ts`, add `ForbiddenException` to the top import and append a new describe block at the end of the file:

```ts
import { DeviceAuthorizationController } from "./device-authorization.controller";
```
→
```ts
import { ForbiddenException } from "@nestjs/common";
import { DeviceAuthorizationController } from "./device-authorization.controller";
```

Append:

```ts
describe("DeviceAuthorizationController platform_admin guard", () => {
  const platformAdminRequest = {
    user: { id: "u1", tenantId: null, role: "platform_admin" },
    headers: { "x-device-id": "u1" },
  };

  it("rejects request/deliverKey/issueApprovalCapability/reconcileLanGrant for a platform_admin", async () => {
    const service = {
      request: jest.fn(),
      deliverKey: jest.fn(),
      issueApprovalCapability: jest.fn(),
      reconcileLanGrant: jest.fn(),
    };
    const controller = new DeviceAuthorizationController(service as any);

    await expect(
      controller.request(
        { deviceId: "device-a", devicePublicKey: "pubkey" } as any,
        platformAdminRequest as any
      )
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.deliverKey("device-a", platformAdminRequest as any)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.issueApprovalCapability(platformAdminRequest as any)
    ).rejects.toThrow(ForbiddenException);
    await expect(
      controller.reconcileLanGrant({ grantedDeviceId: "device-b" } as any, platformAdminRequest as any)
    ).rejects.toThrow(ForbiddenException);

    expect(service.request).not.toHaveBeenCalled();
    expect(service.deliverKey).not.toHaveBeenCalled();
    expect(service.issueApprovalCapability).not.toHaveBeenCalled();
    expect(service.reconcileLanGrant).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest src/modules/lan-identity/ src/modules/device-authorization/`
Expected: FAIL — `LanIdentityController` spec file references a controller that doesn't reject yet; the new device-authorization describe block's expectations aren't met.

- [ ] **Step 3: Add the guard clauses**

In `backend/src/modules/lan-identity/lan-identity.controller.ts`, replace:

```ts
import {
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { LanIdentityService } from "./lan-identity.service";

interface CertificateRequest {
  deviceId: string;
  devicePublicKey: string;
}

@Controller("api/lan-identity")
@UseGuards(JwtAuthGuard)
export class LanIdentityController {
  constructor(private readonly identities: LanIdentityService) {}

  @Post("certificate")
  issueCertificate(@Body() body: CertificateRequest, @Req() request: any) {
    return this.identities.issueCertificate(
      request.user.tenantId,
      body.deviceId,
      body.devicePublicKey
    );
  }
}
```

with:

```ts
import {
  Body,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { LanIdentityService } from "./lan-identity.service";

interface CertificateRequest {
  deviceId: string;
  devicePublicKey: string;
}

@Controller("api/lan-identity")
@UseGuards(JwtAuthGuard)
export class LanIdentityController {
  constructor(private readonly identities: LanIdentityService) {}

  @Post("certificate")
  issueCertificate(@Body() body: CertificateRequest, @Req() request: any) {
    if (request.user.tenantId === null) {
      throw new ForbiddenException("Not available for platform administrators");
    }
    return this.identities.issueCertificate(
      request.user.tenantId,
      body.deviceId,
      body.devicePublicKey
    );
  }
}
```

In `backend/src/modules/device-authorization/device-authorization.controller.ts`, replace the import line:

```ts
import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
```

with:

```ts
import { Body, Controller, ForbiddenException, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
```

Replace the `request` method:

```ts
  @Post("request")
  async request(@Body() dto: RequestDeviceAuthorizationDto, @Req() req: any) {
    return this.deviceAuthorizationService.request(
      req.user.tenantId,
      dto.deviceId,
      dto.devicePublicKey,
      dto.provisioningSecret
    );
  }
```

with:

```ts
  @Post("request")
  async request(@Body() dto: RequestDeviceAuthorizationDto, @Req() req: any) {
    this.assertHasTenant(req);
    return this.deviceAuthorizationService.request(
      req.user.tenantId,
      dto.deviceId,
      dto.devicePublicKey,
      dto.provisioningSecret
    );
  }
```

Replace `deliverKey`:

```ts
  @Post(":deviceId/deliver-key")
  async deliverKey(@Param("deviceId") deviceId: string, @Req() req: any) {
    return this.deviceAuthorizationService.deliverKey(req.user.tenantId, deviceId);
  }
```

with:

```ts
  @Post(":deviceId/deliver-key")
  async deliverKey(@Param("deviceId") deviceId: string, @Req() req: any) {
    this.assertHasTenant(req);
    return this.deviceAuthorizationService.deliverKey(req.user.tenantId, deviceId);
  }
```

Replace `issueApprovalCapability`:

```ts
  @Post("approval-capability")
  async issueApprovalCapability(@Req() req: any) {
    const deviceId = req.headers["x-device-id"];
    return this.deviceAuthorizationService.issueApprovalCapability(
      req.user.tenantId,
      deviceId
    );
  }
```

with:

```ts
  @Post("approval-capability")
  async issueApprovalCapability(@Req() req: any) {
    this.assertHasTenant(req);
    const deviceId = req.headers["x-device-id"];
    return this.deviceAuthorizationService.issueApprovalCapability(
      req.user.tenantId,
      deviceId
    );
  }
```

Replace `reconcileLanGrant` and add the new private helper right after it:

```ts
  @Post("reconcile-lan-grant")
  async reconcileLanGrant(@Body() dto: ReconcileLanGrantDto, @Req() req: any) {
    return this.deviceAuthorizationService.reconcileLanGrant(req.user.tenantId, dto);
  }
}
```

with:

```ts
  @Post("reconcile-lan-grant")
  async reconcileLanGrant(@Body() dto: ReconcileLanGrantDto, @Req() req: any) {
    this.assertHasTenant(req);
    return this.deviceAuthorizationService.reconcileLanGrant(req.user.tenantId, dto);
  }

  private assertHasTenant(req: any): void {
    if (req.user.tenantId === null) {
      throw new ForbiddenException("Not available for platform administrators");
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest src/modules/lan-identity/ src/modules/device-authorization/`
Expected: PASS, including the pre-existing `"derives the tenant and acting user from the JWT for every operation"` test (unaffected — it uses a tenant-scoped user).

---

## Task 7: Frontend `platform_admin` role mirror

**Files:**
- Modify: `frontend/shared/schema.ts`
- Modify: `frontend/src/lib/policies/policy.types.ts`

**Interfaces:**
- Produces: frontend `User["role"]` and `UserRole` gain `"platform_admin"`; `User.tenantId: string | null`. Required before Task 9/11 can compare `user?.role === "platform_admin"` without a TypeScript literal-overlap error.
- Note: `frontend/src/lib/policies/base.policy.ts` is **not** touched — its `tenants.policy.ts` (the only place an `isPlatformAdmin()` helper would matter) isn't imported anywhere in this frontend (confirmed via `grep -rn "TenantsPolicy" frontend/src`); every frontend role check in this plan reads `user?.role` directly off `useAuth()`, matching how `Login.tsx`/`InitialSetupGate.tsx` already branch on role today.

- [ ] **Step 1: Edit `frontend/shared/schema.ts`**

Replace:

```ts
export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien"; tenantId: string; isActive: boolean; service: string | null; specialty: string | null; matricule: string | null; fonction: string | null; photoS3Key: string | null; createdAt: string }
export interface InsertUser { id?: string; username: string; password: string; firstName: string; lastName: string; email?: string | null; role?: User["role"]; tenantId: string; isActive?: boolean; service?: string | null; specialty?: string | null; matricule?: string | null; fonction?: string | null }
```

with:

```ts
export interface User { id: string; username: string; password: string; firstName: string; lastName: string; email: string | null; role: "admin" | "manager" | "cashier" | "accueil" | "infirmier" | "medecin" | "laboratoire" | "pharmacien" | "platform_admin"; tenantId: string | null; isActive: boolean; service: string | null; specialty: string | null; matricule: string | null; fonction: string | null; photoS3Key: string | null; createdAt: string }
export interface InsertUser { id?: string; username: string; password: string; firstName: string; lastName: string; email?: string | null; role?: User["role"]; tenantId: string | null; isActive?: boolean; service?: string | null; specialty?: string | null; matricule?: string | null; fonction?: string | null }
```

Further down, replace:

```ts
export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien"]).optional(), tenantId: z.string(), isActive: z.boolean().optional(), service: nullableString, specialty: nullableString, matricule: nullableString, fonction: nullableString });
```

with:

```ts
export const insertUserSchema = z.object({ id, username: z.string().min(1), password: z.string().min(1), firstName: z.string().min(1), lastName: z.string().min(1), email: nullableString, role: z.enum(["admin", "manager", "cashier", "accueil", "infirmier", "medecin", "laboratoire", "pharmacien", "platform_admin"]).optional(), tenantId: z.string().nullable(), isActive: z.boolean().optional(), service: nullableString, specialty: nullableString, matricule: nullableString, fonction: nullableString });
```

- [ ] **Step 2: Edit `frontend/src/lib/policies/policy.types.ts`**

Replace:

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

export type PolicyAction = string;
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
  | "pharmacien"
  | "platform_admin";

export type PolicyAction = string;
```

- [ ] **Step 3: Verify it compiles**

Run: `cd frontend && npm run check`
Expected: no new TypeScript errors (this is a pure widening of two already-open unions; nothing currently narrows on the old, closed set of roles in a way that would now be non-exhaustive).

---

## Task 8: `TenantContext` null-tenant safety

**Files:**
- Modify: `frontend/src/contexts/TenantContext.tsx`

**Interfaces:**
- Consumes: nothing new (this is a defensive fix to existing logic, independent of Task 7's types).
- Produces: for an authenticated user with no tenant (a `platform_admin`, or the brief window before `/login` resolves), `useTenant()` settles at `{ currentTenant: null, tenants: [], isLoading: false }` instead of issuing a stale, unused `fetch("/api/tenants")`.

- [ ] **Step 1: Replace the fallback branch**

In `frontend/src/contexts/TenantContext.tsx`, the `if (auth.isAuthenticated && auth.tenant)` branch already only fires when `auth.tenant` is non-null, so it's untouched. Replace the final fallback:

```ts
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
    };
```

with:

```ts
      if (getInstallMode() === "local") {
        // Local mode has no central tenants endpoint to ask, and never
        // should - the connected-mode registration page is unreachable here.
        setTenants([]);
        setIsLoading(false);
        return;
      }

      // Either not authenticated yet (the /login page), or an
      // authenticated platform_admin, who has no tenant of their own -
      // the PlatformAdmin page fetches the tenant list itself.
      setTenants([]);
      setCurrentTenant(null);
      setIsLoading(false);
    };
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npm run check`
Expected: no errors (no test file exists for this component per this project's no-jsdom convention — this is a thin context wired to already-tested pieces).

---

## Task 9: `InitialSetupGate` bypass for `platform_admin`

**Files:**
- Modify: `frontend/src/lib/initialSetup.ts`
- Modify: `frontend/src/lib/initialSetup.test.ts`
- Modify: `frontend/src/components/InitialSetupGate.tsx`

**Interfaces:**
- Consumes: Task 7's `User["role"]` including `"platform_admin"`.
- Produces: `shouldShowInitialSetupLoader`/`nextInitialSetupLocation` gain an optional `isPlatformAdmin?: boolean` input; when `true`, both short-circuit to "never block, never redirect."

- [ ] **Step 1: Write the failing test**

In `frontend/src/lib/initialSetup.test.ts`, insert this new test right after the `"renders children after readiness or resolved unauthenticated auth"` test (before `"writes the completion marker only after every business setting"`):

```ts
  it("never gates or redirects a platform_admin, regardless of tenant/settings state", () => {
    expect(nextInitialSetupLocation({
      authenticated: true,
      tenantReady: false,
      settingsReady: false,
      completed: false,
      location: "/platform-admin",
      isPlatformAdmin: true,
    })).toBeNull();
    expect(shouldShowInitialSetupLoader({
      authLoading: false,
      authenticated: true,
      tenantLoading: false,
      tenantReady: false,
      settingsLoading: false,
      isPlatformAdmin: true,
    })).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run --config vitest.config.ts src/lib/initialSetup.test.ts`
Expected: FAIL — TypeScript error (`isPlatformAdmin` doesn't exist on either input type) and/or assertion failure once it does compile.

- [ ] **Step 3: Add the bypass**

In `frontend/src/lib/initialSetup.ts`, replace:

```ts
export function shouldShowInitialSetupLoader(input: {
  authLoading: boolean;
  authenticated: boolean;
  tenantLoading: boolean;
  tenantReady: boolean;
  settingsLoading: boolean;
}): boolean {
  if (input.authLoading) return true;
  if (!input.authenticated) return false;

  return input.tenantLoading || !input.tenantReady || input.settingsLoading;
}
```

with:

```ts
export function shouldShowInitialSetupLoader(input: {
  authLoading: boolean;
  authenticated: boolean;
  tenantLoading: boolean;
  tenantReady: boolean;
  settingsLoading: boolean;
  isPlatformAdmin?: boolean;
}): boolean {
  if (input.isPlatformAdmin) return false;
  if (input.authLoading) return true;
  if (!input.authenticated) return false;

  return input.tenantLoading || !input.tenantReady || input.settingsLoading;
}
```

Replace:

```ts
export function nextInitialSetupLocation(input: {
  authenticated: boolean;
  tenantReady: boolean;
  settingsReady: boolean;
  completed: boolean;
  location: string;
}): string | null {
  if (!input.authenticated || !input.tenantReady || !input.settingsReady) {
    return null;
  }
```

with:

```ts
export function nextInitialSetupLocation(input: {
  authenticated: boolean;
  tenantReady: boolean;
  settingsReady: boolean;
  completed: boolean;
  location: string;
  isPlatformAdmin?: boolean;
}): string | null {
  if (input.isPlatformAdmin) return null;
  if (!input.authenticated || !input.tenantReady || !input.settingsReady) {
    return null;
  }
```

(`isPlatformAdmin` is derived from `user?.role`, which is only known once auth has finished loading, so this branch can never fire while `authLoading`/an unresolved session is still in play.)

- [ ] **Step 4: Wire it through the gate component**

In `frontend/src/components/InitialSetupGate.tsx`, replace:

```ts
export function InitialSetupGate({ children }: InitialSetupGateProps) {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { currentTenant, isLoading: isTenantLoading } = useTenant();
  const {
    getSetting,
    isLoading: areSettingsLoading,
  } = useSettings();
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();

  const tenantReady = !isTenantLoading && Boolean(currentTenant);
  const settingsReady = tenantReady && !areSettingsLoading;
  const completed = initialSetupCompleted(
    getSetting("initialSetupCompleted", false),
  );
  const destination = nextInitialSetupLocation({
    authenticated: isAuthenticated && !isAuthLoading,
    tenantReady,
    settingsReady,
    completed,
    location,
  });
  const showLoader = shouldShowInitialSetupLoader({
    authLoading: isAuthLoading,
    authenticated: isAuthenticated,
    tenantLoading: isTenantLoading,
    tenantReady,
    settingsLoading: areSettingsLoading,
  });
```

with:

```ts
export function InitialSetupGate({ children }: InitialSetupGateProps) {
  const { isAuthenticated, isLoading: isAuthLoading, user } = useAuth();
  const { currentTenant, isLoading: isTenantLoading } = useTenant();
  const {
    getSetting,
    isLoading: areSettingsLoading,
  } = useSettings();
  const [location, setLocation] = useLocation();
  const { t } = useTranslation();

  const isPlatformAdmin = user?.role === "platform_admin";
  const tenantReady = !isTenantLoading && Boolean(currentTenant);
  const settingsReady = tenantReady && !areSettingsLoading;
  const completed = initialSetupCompleted(
    getSetting("initialSetupCompleted", false),
  );
  const destination = nextInitialSetupLocation({
    authenticated: isAuthenticated && !isAuthLoading,
    tenantReady,
    settingsReady,
    completed,
    location,
    isPlatformAdmin,
  });
  const showLoader = shouldShowInitialSetupLoader({
    authLoading: isAuthLoading,
    authenticated: isAuthenticated,
    tenantLoading: isTenantLoading,
    tenantReady,
    settingsLoading: areSettingsLoading,
    isPlatformAdmin,
  });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run --config vitest.config.ts src/lib/initialSetup.test.ts`
Expected: PASS (all existing cases plus the new one — the existing cases never pass `isPlatformAdmin`, so it's `undefined`/falsy and every prior behavior is unchanged).

---

## Task 10: `platform` i18n strings

**Files:**
- Create: `frontend/src/lib/i18n/platform.ts`
- Modify: `frontend/src/lib/i18n/index.ts`

**Interfaces:**
- Produces: `en`/`fr` keys `platformAdminTitle`, `platformCreateTenantTitle`, `platformTenantName`, `platformTenantPhone`, `platformTenantAddress`, `platformTenantEmail`, `platformAdminUsername`, `platformAdminPassword`, `platformCreatingTenant`, `platformCreateTenantSubmit`, `platformTenantsListTitle`, `platformTenantCreated`, `platformTenantCreateFailed`, consumed by Task 11's `PlatformAdmin.tsx`.

- [ ] **Step 1: Create the translation section**

Create `frontend/src/lib/i18n/platform.ts`:

```ts
import type { TranslationSection } from "./types";

export const platform: TranslationSection = {
  en: {
    platformAdminTitle: "Platform administration",
    platformCreateTenantTitle: "Create a new clinic",
    platformTenantName: "Clinic name",
    platformTenantPhone: "Phone",
    platformTenantAddress: "Address",
    platformTenantEmail: "Email",
    platformAdminUsername: "Administrator username",
    platformAdminPassword: "Administrator password",
    platformCreatingTenant: "Creating...",
    platformCreateTenantSubmit: "Create clinic",
    platformTenantsListTitle: "Existing clinics",
    platformTenantCreated: "Clinic created",
    platformTenantCreateFailed: "Failed to create clinic",
  },
  fr: {
    platformAdminTitle: "Administration plateforme",
    platformCreateTenantTitle: "Créer une nouvelle clinique",
    platformTenantName: "Nom de la clinique",
    platformTenantPhone: "Téléphone",
    platformTenantAddress: "Adresse",
    platformTenantEmail: "E-mail",
    platformAdminUsername: "Nom d'utilisateur administrateur",
    platformAdminPassword: "Mot de passe administrateur",
    platformCreatingTenant: "Création en cours...",
    platformCreateTenantSubmit: "Créer la clinique",
    platformTenantsListTitle: "Cliniques existantes",
    platformTenantCreated: "Clinique créée",
    platformTenantCreateFailed: "Échec de la création de la clinique",
  },
};
```

- [ ] **Step 2: Register it**

In `frontend/src/lib/i18n/index.ts`, replace:

```ts
import { carePlan } from "./carePlan";
import { rooms } from "./rooms";

export type { Language } from "./types";

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
  examTypes,
  prescriptions,
  carePlan,
  rooms,
];
```

with:

```ts
import { carePlan } from "./carePlan";
import { rooms } from "./rooms";
import { platform } from "./platform";

export type { Language } from "./types";

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
  examTypes,
  prescriptions,
  carePlan,
  rooms,
  platform,
];
```

- [ ] **Step 3: Verify the dictionaries stay aligned**

Run: `cd frontend && npx vitest run --config vitest.config.ts src/lib/i18nCompleteness.test.ts`
Expected: PASS.

---

## Task 11: `PlatformAdmin` page, route & login redirect

**Files:**
- Create: `frontend/src/pages/PlatformAdmin.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Login.tsx`

**Interfaces:**
- Consumes: Task 5's `POST /api/platform/tenants` and `GET /api/tenants`; Task 7's `User["role"]`; Task 10's i18n keys; existing `apiRequest` (`frontend/src/lib/queryClient.ts`), `useAuth()`, `useToast()`, and `ui/` primitives (`Card`, `Input`, `Label`, `Button`, `Table`, `Loader2`).
- Produces: route `/platform-admin`; `Login.tsx` redirects a `platform_admin` there instead of `/`.

- [ ] **Step 1: Create the page**

Create `frontend/src/pages/PlatformAdmin.tsx`:

```tsx
import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { Tenant } from "@shared/schema";
import { useTranslation } from "@/lib/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { apiRequest } from "@/lib/queryClient";

interface CreateTenantFormState {
  name: string;
  address: string;
  phone: string;
  email: string;
  adminUsername: string;
  adminPassword: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
}

const emptyForm: CreateTenantFormState = {
  name: "",
  address: "",
  phone: "",
  email: "",
  adminUsername: "",
  adminPassword: "",
  adminFirstName: "",
  adminLastName: "",
  adminEmail: "",
};

export default function PlatformAdmin() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateTenantFormState>(emptyForm);

  const { data: tenants, isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/tenants"],
  });

  const createTenant = useMutation({
    mutationFn: async (values: CreateTenantFormState) => {
      const response = await apiRequest("POST", "/api/platform/tenants", {
        name: values.name,
        address: values.address || undefined,
        phone: values.phone || undefined,
        email: values.email || undefined,
        adminUsername: values.adminUsername,
        adminPassword: values.adminPassword,
        adminFirstName: values.adminFirstName,
        adminLastName: values.adminLastName,
        adminEmail: values.adminEmail || undefined,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("platformTenantCreated"), variant: "success" });
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["/api/tenants"] });
    },
    onError: (error: any) => {
      toast({
        title: t("platformTenantCreateFailed"),
        description: error.message || t("anErrorOccurred"),
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: keyof CreateTenantFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTenant.mutate(form);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("platformAdminTitle")}</h1>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            {t("logout")}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("platformCreateTenantTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">{t("platformTenantName")}</Label>
                  <Input
                    id="tenant-name"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    required
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-phone">{t("platformTenantPhone")}</Label>
                  <Input
                    id="tenant-phone"
                    value={form.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-address">{t("platformTenantAddress")}</Label>
                  <Input
                    id="tenant-address"
                    value={form.address}
                    onChange={(e) => handleChange("address", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tenant-email">{t("platformTenantEmail")}</Label>
                  <Input
                    id="tenant-email"
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                  <Label htmlFor="admin-username">{t("platformAdminUsername")}</Label>
                  <Input
                    id="admin-username"
                    value={form.adminUsername}
                    onChange={(e) => handleChange("adminUsername", e.target.value)}
                    required
                    autoComplete="off"
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-password">{t("platformAdminPassword")}</Label>
                  <Input
                    id="admin-password"
                    type="password"
                    value={form.adminPassword}
                    onChange={(e) => handleChange("adminPassword", e.target.value)}
                    required
                    autoComplete="new-password"
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-first-name">{t("firstName")}</Label>
                  <Input
                    id="admin-first-name"
                    value={form.adminFirstName}
                    onChange={(e) => handleChange("adminFirstName", e.target.value)}
                    required
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-last-name">{t("lastName")}</Label>
                  <Input
                    id="admin-last-name"
                    value={form.adminLastName}
                    onChange={(e) => handleChange("adminLastName", e.target.value)}
                    required
                    disabled={createTenant.isPending}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="admin-email">
                    {t("email")} ({t("optional")})
                  </Label>
                  <Input
                    id="admin-email"
                    type="email"
                    value={form.adminEmail}
                    onChange={(e) => handleChange("adminEmail", e.target.value)}
                    disabled={createTenant.isPending}
                  />
                </div>
              </div>

              <Button type="submit" disabled={createTenant.isPending}>
                {createTenant.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("platformCreatingTenant")}
                  </>
                ) : (
                  t("platformCreateTenantSubmit")
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("platformTenantsListTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            {tenantsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("platformTenantName")}</TableHead>
                    <TableHead>{t("platformTenantEmail")}</TableHead>
                    <TableHead>{t("platformTenantPhone")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(tenants ?? []).map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>{tenant.name}</TableCell>
                      <TableCell>{tenant.email ?? "-"}</TableCell>
                      <TableCell>{tenant.phone ?? "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

(Note: `useQuery`'s default `queryFn`, from `frontend/src/lib/queryClient.ts`, routes GETs through `offlineApiRequest`, which does a real network fetch first and only falls back to its offline cache on failure — this works unmodified for a `platform_admin`, it just also opportunistically caches the tenant list under a `"tenants"` collection key, which nothing else reads.)

- [ ] **Step 2: Add the route**

In `frontend/src/App.tsx`, replace:

```ts
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
```

with:

```ts
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const PlatformAdmin = lazy(() => import("./pages/PlatformAdmin"));
```

Replace:

```ts
            <Layout>
              <AuditLogs />
            </Layout>
          </ProtectedRoute>
        </Route>

        {/* 404 */}
        <Route component={NotFound} />
```

with:

```ts
            <Layout>
              <AuditLogs />
            </Layout>
          </ProtectedRoute>
        </Route>
        <Route path="/platform-admin">
          <ProtectedRoute>
            <PlatformAdmin />
          </ProtectedRoute>
        </Route>

        {/* 404 */}
        <Route component={NotFound} />
```

(No `Layout` wrapper — matches `Login`/`InitialSetup`, since `Layout`'s clinic-module sidebar has nothing to show a tenant-less role.)

- [ ] **Step 3: Redirect `platform_admin` after login**

In `frontend/src/pages/Login.tsx`, replace:

```ts
  const { login, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Redirect to home when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      setLocation("/");
    }
  }, [isAuthenticated, isLoading, setLocation]);
```

with:

```ts
  const { login, isAuthenticated, user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  // Redirect to home (or the platform admin dashboard) when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      setLocation(user?.role === "platform_admin" ? "/platform-admin" : "/");
    }
  }, [isAuthenticated, isLoading, user, setLocation]);
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npm run check`
Expected: no errors.

---

## Task 12: Remove self-registration (frontend)

**Files:**
- Delete: `frontend/src/pages/Register.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/lib/i18n/auth.ts`
- Modify: `frontend/src/components/InstallModeGate.tsx`
- Modify: `frontend/src/lib/queryClient.ts`

**Interfaces:**
- Consumes: Task 3's backend `410 Gone` on `POST /api/auth/register` (this task removes the now-permanently-broken client that called it).
- Produces: `/register` no longer exists anywhere in the frontend (route, page, nav link, redirect exclusion lists).

- [ ] **Step 1: Delete the page**

Run: `rm frontend/src/pages/Register.tsx`

- [ ] **Step 2: Remove the route**

In `frontend/src/App.tsx`, replace:

```ts
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const PlatformAdmin = lazy(() => import("./pages/PlatformAdmin"));
```

with:

```ts
const Login = lazy(() => import("./pages/Login"));
const PlatformAdmin = lazy(() => import("./pages/PlatformAdmin"));
```

Replace:

```ts
        {/* Public routes */}
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/reset-password" component={PasswordReset} />
```

with:

```ts
        {/* Public routes */}
        <Route path="/login" component={Login} />
        <Route path="/reset-password" component={PasswordReset} />
```

- [ ] **Step 3: Remove the "Don't have an account?" link**

In `frontend/src/pages/Login.tsx`, replace:

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
```

with:

```tsx
          <div className="mt-2 text-center text-sm">
```

(`getInstallMode` stays imported/used — the forgot-password link below still branches on it.)

- [ ] **Step 4: Remove `register`/`RegisterData` from `AuthContext`**

In `frontend/src/contexts/AuthContext.tsx`, replace:

```ts
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
```

with:

```ts
interface AuthContextType {
  user: Omit<User, "password"> | null;
  tenant: Tenant | null;
  tenants: Tenant[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}
```

Replace:

```ts
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

  useInactivityLogout(logout, !!user);
```

with:

```ts
  useInactivityLogout(logout, !!user);
```

Replace:

```ts
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
```

with:

```ts
      value={{
        user,
        tenant,
        tenants,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        checkAuth,
      }}>
```

- [ ] **Step 5: Remove orphaned register-only i18n keys**

In `frontend/src/lib/i18n/auth.ts`, in the `en` block, replace:

```ts
    dontHaveAccount: "Don't have an account? Register",
    forgotPassword: "Forgot password?",
```

with:

```ts
    forgotPassword: "Forgot password?",
```

and replace:

```ts
    createAccount: "Create Account",
    registerToMedicalConnect: "Register to start using Medical Connect",
    confirmPassword: "Confirm Password",
    tenantShop: "Account/Shop",
    selectTenant: "Select an account",
    selectRole: "Select a role",
    creatingAccount: "Creating account...",
    alreadyHaveAccount: "Already have an account? Sign in",
    validationError: "Validation error",
    passwordsDoNotMatch: "Passwords do not match",
    passwordMinLength: "Password must be at least 6 characters",
    pleaseSelectTenant: "Please select an account",
    registrationSuccessful: "Registration successful",
    pleaseLogin: "Please login with your credentials",
    registrationFailed: "Registration failed",
    registrationError: "An error occurred during registration",
```

with:

```ts
    createAccount: "Create Account",
    confirmPassword: "Confirm Password",
    selectRole: "Select a role",
    creatingAccount: "Creating account...",
    validationError: "Validation error",
    passwordsDoNotMatch: "Passwords do not match",
    passwordMinLength: "Password must be at least 6 characters",
    registrationFailed: "Registration failed",
```

In the `fr` block, replace:

```ts
    dontHaveAccount: "Vous n'avez pas de compte? S'inscrire",
    forgotPassword: "Mot de passe oublié?",
```

with:

```ts
    forgotPassword: "Mot de passe oublié?",
```

and replace:

```ts
    createAccount: "Créer un compte",
    registerToMedicalConnect: "Inscrivez-vous pour commencer à utiliser Medical Connect",
    confirmPassword: "Confirmer le mot de passe",
    tenantShop: "Compte/Boutique",
    selectTenant: "Sélectionner un compte",
    selectRole: "Sélectionner un rôle",
    creatingAccount: "Création du compte...",
    alreadyHaveAccount: "Vous avez déjà un compte? Se connecter",
    validationError: "Erreur de validation",
    passwordsDoNotMatch: "Les mots de passe ne correspondent pas",
    passwordMinLength: "Le mot de passe doit contenir au moins 6 caractères",
    pleaseSelectTenant: "Veuillez sélectionner un compte",
    registrationSuccessful: "Inscription réussie",
    pleaseLogin: "Veuillez vous connecter avec vos identifiants",
    registrationFailed: "Échec de l'inscription",
    registrationError: "Une erreur s'est produite lors de l'inscription",
```

with:

```ts
    createAccount: "Créer un compte",
    confirmPassword: "Confirmer le mot de passe",
    selectRole: "Sélectionner un rôle",
    creatingAccount: "Création du compte...",
    validationError: "Erreur de validation",
    passwordsDoNotMatch: "Les mots de passe ne correspondent pas",
    passwordMinLength: "Le mot de passe doit contenir au moins 6 caractères",
    registrationFailed: "Échec de l'inscription",
```

(`createAccount`, `confirmPassword`, `selectRole`, `creatingAccount`, `validationError`, `passwordsDoNotMatch`, `passwordMinLength`, `registrationFailed` all stay — each is still used elsewhere, e.g. `Staff.tsx`'s create-user form. Only the keys with zero remaining references after `Register.tsx`'s removal are dropped.)

- [ ] **Step 6: Drop the two other stale `/register` references**

In `frontend/src/components/InstallModeGate.tsx`, replace:

```ts
const CONNECTED_ONLY_PATHS = [
  "/register",
  "/reset-password",
  "/request-password-reset",
];
```

with:

```ts
const CONNECTED_ONLY_PATHS = [
  "/reset-password",
  "/request-password-reset",
];
```

In `frontend/src/lib/queryClient.ts`, replace:

```ts
      if (
        window.location.pathname !== "/login" &&
        window.location.pathname !== "/register" &&
        window.location.pathname !== "/reset-password" &&
        window.location.pathname !== "/request-password-reset"
      ) {
```

with:

```ts
      if (
        window.location.pathname !== "/login" &&
        window.location.pathname !== "/reset-password" &&
        window.location.pathname !== "/request-password-reset"
      ) {
```

- [ ] **Step 7: Verify everything still compiles and passes**

Run: `cd frontend && npm run check && npx vitest run --config vitest.config.ts`
Expected: no TypeScript errors; every existing test (including `i18nCompleteness.test.ts`) still passes.

---

## Final check

- [ ] Run the full backend suite: `cd backend && npx jest`
- [ ] Run the full frontend suite: `cd frontend && npx vitest run --config vitest.config.ts`
- [ ] Run both typechecks: `cd backend && npm run check:scripts` and `cd frontend && npm run check`
- [ ] Confirm nothing was committed during execution (per `CLAUDE.md`) — `git status` should show only the working-tree changes from this plan, and the user should be asked once, at the end, whether/how to commit.
