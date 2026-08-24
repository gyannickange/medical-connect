# LAN Peer-to-Peer Device Authorization (Chemin B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an already-authorized admin device approve a new device and hand it the Tenant Data Key entirely over the LAN, with no central server round-trip at the moment of granting — while still leaving an auditable trail that reaches the server once connectivity returns.

**Architecture:** Reuses the existing direct-LAN message transport (`lan_agent_send_lock_message` / the HTTP handler behind it, currently named for product locks but already payload-agnostic) with two new message types instead of a new transport. Trust for the LAN-local exchange comes from two Ed25519-signed tokens the granting device already has or can fetch: its own 30-day LAN certificate (proves tenant membership) and a new, much shorter-lived (12h) **Approval Capability** (proves it's currently allowed to grant access, not just a member) — both signed by the same CA key `LanIdentityService` already owns, so the new device can verify both **locally**, without contacting the server. The granting device performs the X25519 sealed-box wrap itself (mirroring Plan 2's server-side implementation, moved to the frontend via the same WebCrypto calls) and signs a grant record with its own LAN identity key; that record is queued through the app's existing offline-operation mechanism (`offlineApiRequest`) for the server to verify and record once reachable.

**Tech Stack:** Rust (Tauri, `ed25519-dalek`, existing `tiny_http` server), NestJS (extends the `device-authorization` and `lan-identity` modules from Plan 2), WebCrypto `crypto.subtle` (X25519/HKDF/AES-GCM — same API already verified interoperable in Plan 2's Task 4), the project's existing `offlineApiRequest`/offline-operation-queue mechanism (no new queue built).

**Spec:** `docs/superpowers/specs/2026-08-16-local-database-encryption-design.md` — this plan implements §5.3 in full (LAN-direct grant, Approval Capability with its 12h TTL rationale). It depends on Plan 2's `device-authorization` module (`DeviceAuthorizationRepository.approve`, the `device_authorization` CouchDB document shape) and Plan 1's LAN identity keyring migration (the Ed25519 signing key Plan 3's Rust code signs with).

## Global Constraints

- The Approval Capability is a **separate, shorter-lived (12h)** token from the 30-day LAN certificate — never conflate their lifecycles or reuse the certificate's expiry for capability checks (spec §5.3's explicit reasoning: a revoked admin must not keep granting access for weeks just because their general LAN cert hasn't expired).
- A device verifies the Approval Capability **locally**, using the CA public key it already trusts from its own certificate exchange — never by calling the server at grant time. Only the after-the-fact audit trail (the grant record) touches the server, and only once connectivity returns.
- The new device never needs to have contacted the central server to receive this LAN-direct grant — only the *granting* device needed to, at some earlier point, to become `approved` in the first place (Plan 2, Chemin A) or to refresh its Approval Capability.
- Reuse the existing offline-operation queue (`frontend/src/lib/offlineApiRequest.ts`) for the async reconciliation upload — do not build a second queue.
- Same tenant-scope-from-JWT rule as Plans 1 and 2 for every new backend endpoint.
- No UI wizard for "this device wants to join" in this plan — that trigger belongs to the still-unshipped migration that actually creates `stockflow_<tenantId>`. This plan builds and unit-tests the request/approve/verify/reconcile *mechanism*, matching how Plan 2 scoped its own UI boundary.

---

### Task 1: Rust — generalize the LAN message handler for new message types

**Files:**
- Modify: `frontend/src-tauri/src/lan_agent.rs:162,622-672`

**Interfaces:**
- Consumes: nothing new.
- Produces: two new Tauri event names, `lan-device-authorization-request-received` and `lan-device-authorization-grant-received`, emitted with the same `{senderDeviceId, payload}` shape the existing lock events already use — consumed by Task 5's frontend listener.

The handler is already payload-agnostic (verifies a generic signed envelope, then dispatches purely on URL path) — this task only adds two match arms and renames the function to stop implying it's lock-specific, since it's about to demonstrably handle more than locks.

- [ ] **Step 1: Rename and extend the handler**

In `frontend/src-tauri/src/lan_agent.rs`, change the function name at line 622 from `handle_lock_request` to `handle_lan_message`:

```rust
fn handle_lan_message(mut request: tiny_http::Request, identity_path: &Path, app: &AppHandle) {
```

Update its call site at line 162:

```rust
            handle_lan_message(request, &http_identity_path, &http_app_handle);
```

Replace the path match (originally lines 653-660):

```rust
    let event_name = match request.url() {
        "/lock/request" => "lan-lock-request-received",
        "/lock/response" => "lan-lock-response-received",
        _ => {
            let _ = request.respond(tiny_http::Response::empty(404));
            return;
        }
    };
```

with:

```rust
    let event_name = match request.url() {
        "/lock/request" => "lan-lock-request-received",
        "/lock/response" => "lan-lock-response-received",
        "/device-authorization/request" => "lan-device-authorization-request-received",
        "/device-authorization/grant" => "lan-device-authorization-grant-received",
        _ => {
            let _ = request.respond(tiny_http::Response::empty(404));
            return;
        }
    };
```

- [ ] **Step 2: Run the existing Rust test suite to confirm nothing else referenced the old name**

Run: `cd frontend/src-tauri && cargo build && cargo test`
Expected: builds and all existing tests still PASS — this task is a rename plus two additive match arms, no behavior change for the existing lock paths.

- [ ] **Step 3: Commit**

```bash
git add frontend/src-tauri/src/lan_agent.rs
git commit -m "feat: route device-authorization LAN messages through the existing signed-envelope handler"
```

---

### Task 2: Backend — Approval Capability issuance

**Files:**
- Modify: `backend/src/modules/lan-identity/lan-identity.service.ts`
- Modify: `backend/src/modules/lan-identity/lan-identity.service.spec.ts`

**Interfaces:**
- Consumes: nothing new (uses the CA key this service already owns).
- Produces: `LanIdentityService.issueApprovalCapability(tenantId, deviceId): { capability: string; expiresAt: number }` and `LanIdentityService.verifyTenantFingerprint(tenantId, fingerprint): boolean` — consumed by Task 3's controller/service and, on the client side, mirrored by Task 4's Rust verification (the wire format matches `issueCertificate`'s `<base64url-payload>.<base64url-signature>` shape exactly, so the same client-side verify logic pattern applies to both).

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/modules/lan-identity/lan-identity.service.spec.ts` (find the existing `describe` block and add these inside it, following the file's current test style for `issueCertificate`/`verifyCertificate`):

```ts
describe("issueApprovalCapability", () => {
  it("issues a capability that verifyApprovalCapability accepts", () => {
    process.env.LAN_TENANT_FINGERPRINT_SECRET = "test-fingerprint-secret";
    const service = new LanIdentityService();
    const { capability, expiresAt } = service.issueApprovalCapability(
      "tenant-1",
      "device-a"
    );

    expect(typeof capability).toBe("string");
    expect(capability.split(".")).toHaveLength(2);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 12 * 60 * 60 * 1000 + 1000);
  });

  it("scopes the expiry to 12 hours, not the certificate's 30 days", () => {
    process.env.LAN_TENANT_FINGERPRINT_SECRET = "test-fingerprint-secret";
    const service = new LanIdentityService();
    const { expiresAt } = service.issueApprovalCapability("tenant-1", "device-a");

    const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;
    expect(expiresAt).toBeLessThan(thirtyDaysFromNow);
  });
});

describe("verifyTenantFingerprint", () => {
  it("accepts the fingerprint it would itself compute for a tenant", () => {
    process.env.LAN_TENANT_FINGERPRINT_SECRET = "test-fingerprint-secret";
    const service = new LanIdentityService();
    const { certificate } = service.issueCertificate(
      "tenant-1",
      "device-a",
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    );
    const [encodedPayload] = certificate.split(".");
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    );

    expect(service.verifyTenantFingerprint("tenant-1", payload.tenantFingerprint)).toBe(
      true
    );
    expect(service.verifyTenantFingerprint("tenant-2", payload.tenantFingerprint)).toBe(
      false
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest lan-identity.service`
Expected: FAIL — `issueApprovalCapability`/`verifyTenantFingerprint` don't exist yet.

- [ ] **Step 3: Implement the changes**

In `backend/src/modules/lan-identity/lan-identity.service.ts`, add a constant near `CERTIFICATE_LIFETIME_MS`:

```ts
const APPROVAL_CAPABILITY_LIFETIME_MS = 12 * 60 * 60 * 1000;
```

Add a new payload interface near `LanDeviceCertificatePayload`:

```ts
export interface ApprovalCapabilityPayload {
  version: typeof CERTIFICATE_VERSION;
  purpose: "device-authorization-approve";
  deviceId: string;
  tenantFingerprint: string;
  issuedAt: number;
  expiresAt: number;
}
```

Add these methods to the `LanIdentityService` class, alongside `issueCertificate`/`verifyCertificate`:

```ts
  issueApprovalCapability(
    tenantId: string,
    deviceId: string
  ): { capability: string; expiresAt: number } {
    validateDeviceId(deviceId);

    const now = Date.now();
    const payload: ApprovalCapabilityPayload = {
      version: CERTIFICATE_VERSION,
      purpose: "device-authorization-approve",
      deviceId,
      tenantFingerprint: this.tenantFingerprint(tenantId),
      issuedAt: now,
      expiresAt: now + APPROVAL_CAPABILITY_LIFETIME_MS,
    };
    return { capability: this.sign(payload), expiresAt: payload.expiresAt };
  }

  verifyTenantFingerprint(tenantId: string, fingerprint: string): boolean {
    return this.tenantFingerprint(tenantId) === fingerprint;
  }

  private sign(payload: Record<string, unknown>): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url"
    );
    const signature = sign(
      null,
      Buffer.from(encodedPayload),
      this.privateKey
    ).toString("base64url");
    return `${encodedPayload}.${signature}`;
  }
```

`issueCertificate`'s own payload-encode-and-sign lines (the block building `encodedPayload`/`signature`) can now call `this.sign(payload)` instead of duplicating that logic — replace those two lines in `issueCertificate` with `const certificate = this.sign(payload);` and use `certificate` where `` `${encodedPayload}.${signature}` `` was returned, to avoid maintaining the same encode-and-sign logic twice now that a second caller needs it.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd backend && npx jest lan-identity.service`
Expected: PASS, including the pre-existing `issueCertificate`/`verifyCertificate` tests (unaffected by the refactor since `sign()` produces the exact same `<payload>.<signature>` format they already expect).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/lan-identity/lan-identity.service.ts backend/src/modules/lan-identity/lan-identity.service.spec.ts
git commit -m "feat: issue a short-lived Approval Capability from the existing LAN CA key"
```

---

### Task 3: Backend — approval-capability and reconcile-lan-grant endpoints

**Files:**
- Modify: `backend/src/modules/device-authorization/device-authorization.service.ts`
- Modify: `backend/src/modules/device-authorization/device-authorization.service.spec.ts`
- Modify: `backend/src/modules/device-authorization/device-authorization.controller.ts`
- Modify: `backend/src/modules/device-authorization/device-authorization.controller.spec.ts`
- Modify: `backend/src/modules/device-authorization/device-authorization.module.ts`
- Create: `backend/src/modules/device-authorization/dto/reconcile-lan-grant.dto.ts`

**Interfaces:**
- Consumes: `LanIdentityService.issueApprovalCapability`/`verifyTenantFingerprint` (Task 2), `LanIdentityService.verifyCertificate` (existing), `DeviceAuthorizationRepository.findByDevice`/`approve` (Plan 2).
- Produces: `POST /api/device-authorization/approval-capability`, `POST /api/device-authorization/reconcile-lan-grant` — consumed by Task 6's frontend.

- [ ] **Step 1: Write the failing service tests**

Add to `backend/src/modules/device-authorization/device-authorization.service.spec.ts` (extend the existing `harness()` to also build a `lanIdentityService` mock, threading it through the constructor - update every existing `new DeviceAuthorizationService(...)` call in that file to pass it as the fifth argument):

```ts
// Add to the harness() function's mocks:
const lanIdentityService = {
  issueApprovalCapability: jest
    .fn()
    .mockReturnValue({ capability: "cap.sig", expiresAt: Date.now() + 1000 }),
  verifyCertificate: jest.fn(),
  verifyTenantFingerprint: jest.fn().mockReturnValue(true),
};
// ...and pass `lanIdentityService as any` as the fifth constructor argument.

describe("issueApprovalCapability", () => {
  it("refuses a device that is not itself approved", async () => {
    const { service, deviceAuthorizationRepository } = harness({
      deviceAuthorizationRepository: {
        findByDevice: jest.fn().mockResolvedValue({ status: "pending" }),
      },
    });

    await expect(
      service.issueApprovalCapability("tenant-1", "device-a")
    ).rejects.toThrow(ForbiddenException);
  });

  it("issues a capability for an approved device", async () => {
    const { service, deviceAuthorizationRepository, lanIdentityService } = harness({
      deviceAuthorizationRepository: {
        findByDevice: jest.fn().mockResolvedValue({ status: "approved" }),
      },
    });

    const result = await service.issueApprovalCapability("tenant-1", "device-a");

    expect(lanIdentityService.issueApprovalCapability).toHaveBeenCalledWith(
      "tenant-1",
      "device-a"
    );
    expect(result).toEqual({ capability: "cap.sig", expiresAt: expect.any(Number) });
  });
});

describe("reconcileLanGrant", () => {
  function validGrant(overrides: Record<string, unknown> = {}) {
    return {
      grantedDeviceId: "device-b",
      grantedByDeviceId: "device-a",
      grantedByCertificate: "cert.sig",
      approvalCapability: "cap.sig",
      tenantFingerprint: "fingerprint-value",
      decidedAt: new Date().toISOString(),
      signature: "grant-sig",
      ...overrides,
    };
  }

  it("approves the granted device once every check passes", async () => {
    const { service, deviceAuthorizationRepository, lanIdentityService } = harness({
      lanIdentityService: {
        verifyCertificate: jest.fn().mockReturnValue({
          deviceId: "device-a",
          devicePublicKey: "granter-ed25519-pubkey",
          tenantFingerprint: "fingerprint-value",
        }),
        verifyTenantFingerprint: jest.fn().mockReturnValue(true),
      },
      deviceAuthorizationRepository: {
        findByDevice: jest.fn().mockResolvedValue({ status: "approved" }),
      },
    });

    await service.reconcileLanGrant("tenant-1", validGrant());

    expect(deviceAuthorizationRepository.approve).toHaveBeenCalledWith(
      "tenant-1",
      "device-b",
      "device-a"
    );
  });

  it("rejects a grant whose certificate doesn't verify", async () => {
    const { service } = harness({
      lanIdentityService: { verifyCertificate: jest.fn().mockReturnValue(null) },
    });

    await expect(service.reconcileLanGrant("tenant-1", validGrant())).rejects.toThrow(
      ForbiddenException
    );
  });

  it("rejects a grant whose tenant fingerprint doesn't match", async () => {
    const { service } = harness({
      lanIdentityService: {
        verifyCertificate: jest.fn().mockReturnValue({
          deviceId: "device-a",
          devicePublicKey: "key",
          tenantFingerprint: "fingerprint-value",
        }),
        verifyTenantFingerprint: jest.fn().mockReturnValue(false),
      },
    });

    await expect(service.reconcileLanGrant("tenant-1", validGrant())).rejects.toThrow(
      ForbiddenException
    );
  });

  it("rejects a grant from a device that is not itself currently approved", async () => {
    const { service } = harness({
      lanIdentityService: {
        verifyCertificate: jest.fn().mockReturnValue({
          deviceId: "device-a",
          devicePublicKey: "key",
          tenantFingerprint: "fingerprint-value",
        }),
        verifyTenantFingerprint: jest.fn().mockReturnValue(true),
      },
      deviceAuthorizationRepository: {
        findByDevice: jest.fn().mockResolvedValue({ status: "revoked" }),
      },
    });

    await expect(service.reconcileLanGrant("tenant-1", validGrant())).rejects.toThrow(
      ForbiddenException
    );
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd backend && npx jest device-authorization.service`
Expected: FAIL — `issueApprovalCapability`/`reconcileLanGrant` don't exist on the service yet, and the constructor doesn't accept a fifth argument.

- [ ] **Step 3: Implement the service changes**

In `backend/src/modules/device-authorization/device-authorization.service.ts`, add the import and constructor parameter:

```ts
import { LanIdentityService } from "../lan-identity/lan-identity.service";
```

```ts
  constructor(
    private readonly tenantDataKeyRepository: TenantDataKeyRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly deviceAuthorizationRepository: DeviceAuthorizationRepository,
    private readonly signalingService: SignalingService,
    private readonly lanIdentityService: LanIdentityService
  ) {}
```

Add the two new methods:

```ts
  async issueApprovalCapability(
    tenantId: string,
    deviceId: string
  ): Promise<{ capability: string; expiresAt: number }> {
    const own = await this.deviceAuthorizationRepository.findByDevice(tenantId, deviceId);
    if (!own || own.status !== "approved") {
      throw new ForbiddenException(
        "Only a currently approved device can request an Approval Capability"
      );
    }
    return this.lanIdentityService.issueApprovalCapability(tenantId, deviceId);
  }

  async reconcileLanGrant(
    tenantId: string,
    grant: {
      grantedDeviceId: string;
      grantedByDeviceId: string;
      grantedByCertificate: string;
      approvalCapability: string;
      tenantFingerprint: string;
      decidedAt: string;
      signature: string;
    }
  ): Promise<DeviceAuthorization> {
    // The granting device's certificate is self-verifying against the CA key
    // this server already owns - no need to have pre-stored that device's
    // public key anywhere. Once verified, it's the trusted source for that
    // device's Ed25519 public key used to check the grant signature itself.
    const granterCertificate = this.lanIdentityService.verifyCertificate(
      grant.grantedByCertificate
    );
    if (!granterCertificate || granterCertificate.deviceId !== grant.grantedByDeviceId) {
      throw new ForbiddenException("Invalid granting device certificate");
    }

    if (!this.lanIdentityService.verifyTenantFingerprint(tenantId, grant.tenantFingerprint)) {
      throw new ForbiddenException("Tenant fingerprint mismatch");
    }

    const granterAuthorization = await this.deviceAuthorizationRepository.findByDevice(
      tenantId,
      grant.grantedByDeviceId
    );
    if (!granterAuthorization || granterAuthorization.status !== "approved") {
      throw new ForbiddenException(
        "The granting device is not currently approved for this tenant"
      );
    }

    return this.deviceAuthorizationRepository.approve(
      tenantId,
      grant.grantedDeviceId,
      grant.grantedByDeviceId
    );
  }
```

Note what this deliberately does **not** re-verify: the grant record's own Ed25519 `signature` field and the embedded `approvalCapability`'s validity *at the moment the LAN grant happened*. Both were already verified by the *new device itself*, locally, before it accepted the key (Task 4/Task 6) - that's the actual access-granting decision, and it already happened. This endpoint's job is narrower: confirm the reconciliation record came from a device that legitimately belongs to this tenant and is still in good standing, so `device_authorizations` reflects reality for the Settings UI (Plan 2, Task 7) - it is an audit-trail write, not a second access-control gate.

- [ ] **Step 4: Run the service tests and verify they pass**

Run: `cd backend && npx jest device-authorization.service`
Expected: PASS.

- [ ] **Step 5: Write the failing controller test**

Add to `backend/src/modules/device-authorization/device-authorization.controller.spec.ts`:

```ts
it("exposes approval-capability and reconcile-lan-grant, tenant-scoped from the JWT", async () => {
  const service = {
    issueApprovalCapability: jest
      .fn()
      .mockResolvedValue({ capability: "cap.sig", expiresAt: 123 }),
    reconcileLanGrant: jest.fn().mockResolvedValue({ status: "approved" }),
  };
  const controller = new DeviceAuthorizationController(service as any);

  await controller.issueApprovalCapability(request as any);
  await controller.reconcileLanGrant({ grantedDeviceId: "device-b" } as any, request as any);

  expect(service.issueApprovalCapability).toHaveBeenCalledWith("tenant-1", "user-1");
  expect(service.reconcileLanGrant).toHaveBeenCalledWith(
    "tenant-1",
    expect.objectContaining({ grantedDeviceId: "device-b" })
  );
});
```

Note this test uses the file's existing `request = { user: { tenantId: "tenant-1" } }` fixture, which doesn't include a device id - update that shared fixture at the top of the file to `{ user: { id: "user-1", tenantId: "tenant-1", role: "admin" }, deviceId: "user-1" }` is wrong (a user id isn't a device id); instead add an explicit `deviceId` a device-authorization request would carry. Since the existing routes (Task 6 of the tenant-key plan) only ever needed `req.user`, and `issueApprovalCapability` needs to know *which device* is asking, add a `X-Device-Id` header read in the controller rather than inventing a new auth concept: change the shared `request` fixture to `{ user: { id: "user-1", tenantId: "tenant-1", role: "admin" }, headers: { "x-device-id": "user-1" } }` for this test, matching the header-based device identification `pouchdbAuth.ts` already uses on the frontend (`X-Device-ID` header sent alongside the JWT cookie).

- [ ] **Step 6: Run the controller test and verify it fails, then implement**

Run: `cd backend && npx jest device-authorization.controller`
Expected: FAIL.

Add to `backend/src/modules/device-authorization/dto/reconcile-lan-grant.dto.ts`:

```ts
import { IsISO8601, IsString, IsNotEmpty } from "class-validator";

export class ReconcileLanGrantDto {
  @IsString()
  @IsNotEmpty()
  grantedDeviceId: string;

  @IsString()
  @IsNotEmpty()
  grantedByDeviceId: string;

  @IsString()
  @IsNotEmpty()
  grantedByCertificate: string;

  @IsString()
  @IsNotEmpty()
  approvalCapability: string;

  @IsString()
  @IsNotEmpty()
  tenantFingerprint: string;

  @IsISO8601()
  decidedAt: string;

  @IsString()
  @IsNotEmpty()
  signature: string;
}
```

Add to `backend/src/modules/device-authorization/device-authorization.controller.ts`:

```ts
import { ReconcileLanGrantDto } from "./dto/reconcile-lan-grant.dto";
```

```ts
  @Post("approval-capability")
  async issueApprovalCapability(@Req() req: any) {
    const deviceId = req.headers["x-device-id"];
    return this.deviceAuthorizationService.issueApprovalCapability(
      req.user.tenantId,
      deviceId
    );
  }

  @Post("reconcile-lan-grant")
  async reconcileLanGrant(@Body() dto: ReconcileLanGrantDto, @Req() req: any) {
    return this.deviceAuthorizationService.reconcileLanGrant(req.user.tenantId, dto);
  }
```

- [ ] **Step 7: Run the controller test and verify it passes**

Run: `cd backend && npx jest device-authorization.controller`
Expected: PASS.

- [ ] **Step 8: Wire `LanIdentityModule` into `DeviceAuthorizationModule`**

In `backend/src/modules/device-authorization/device-authorization.module.ts`, add the import and add `LanIdentityModule` to `imports`, and add `LanIdentityService` is already exported by `LanIdentityModule` (verified in Plan 2's investigation) so no further change is needed beyond adding it to `imports`:

```ts
import { LanIdentityModule } from "../lan-identity/lan-identity.module";
```

```ts
  imports: [CouchDBModule, AuthModule, IdentityModule, WebSocketModule, LanIdentityModule],
```

- [ ] **Step 9: Run the full backend suite and build**

Run:

```bash
cd backend
npx jest
npm run build
```

Expected: all tests PASS, build exits 0.

- [ ] **Step 10: Commit**

```bash
git add backend/src/modules/device-authorization backend/src/modules/lan-identity
git commit -m "feat: add approval-capability issuance and LAN grant reconciliation endpoints"
```

---

### Task 4: Rust — verify the Approval Capability, sign the grant record

**Files:**
- Modify: `frontend/src-tauri/src/lan_agent.rs`

**Interfaces:**
- Consumes: `StoredIdentity` (existing, has `ca_public_key`), `SigningKey`/`signing_key()` (Plan 1, keyring-backed).
- Produces: `verify_approval_capability(capability: &str, identity: &StoredIdentity) -> Result<ApprovalCapabilityPayload, String>`, `sign_grant_record(identity: &StoredIdentity, grant: &GrantRecordPayload) -> Result<String, String>` — consumed by Task 6's frontend via new Tauri commands wrapping both.

- [ ] **Step 1: Write the failing tests**

Add to the `mod tests` block in `frontend/src-tauri/src/lan_agent.rs` (after the existing certificate-verification tests, following their exact structure):

```rust
    #[test]
    fn approval_capability_verification_accepts_a_capability_from_the_trusted_ca() {
        let ca = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-2".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "purpose": "device-authorization-approve",
            "deviceId": "caisse-1",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = ca.sign(encoded_payload.as_bytes());
        let capability = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        let verified = verify_approval_capability(&capability, &identity)
            .expect("valid capability from the trusted CA");
        assert_eq!(verified.device_id, "caisse-1");
        assert_eq!(verified.purpose, "device-authorization-approve");
    }

    #[test]
    fn approval_capability_verification_rejects_an_expired_capability() {
        let ca = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-2".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "purpose": "device-authorization-approve",
            "deviceId": "caisse-1",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "issuedAt": unix_millis() - 120_000,
            "expiresAt": unix_millis() - 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = ca.sign(encoded_payload.as_bytes());
        let capability = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        assert!(verify_approval_capability(&capability, &identity).is_err());
    }

    #[test]
    fn approval_capability_verification_rejects_a_capability_from_an_untrusted_ca() {
        let real_ca = SigningKey::generate(&mut OsRng);
        let impostor_ca = SigningKey::generate(&mut OsRng);
        let identity = StoredIdentity {
            device_id: "caisse-2".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(real_ca.verifying_key().to_bytes())),
        };
        let payload = serde_json::json!({
            "version": 1,
            "purpose": "device-authorization-approve",
            "deviceId": "caisse-1",
            "tenantFingerprint": "tenantfingerprint_alpha_1234",
            "issuedAt": unix_millis(),
            "expiresAt": unix_millis() + 60_000
        });
        let encoded_payload = URL_SAFE_NO_PAD.encode(payload.to_string());
        let signature = impostor_ca.sign(encoded_payload.as_bytes());
        let capability = format!(
            "{}.{}",
            encoded_payload,
            URL_SAFE_NO_PAD.encode(signature.to_bytes())
        );

        assert!(verify_approval_capability(&capability, &identity).is_err());
    }

    #[test]
    fn grant_records_round_trip_through_sign_and_verify() {
        use_mock_store();
        let signer = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-1", &signer).expect("store signing key");
        let identity = StoredIdentity {
            device_id: "caisse-1".into(),
            certificate: None,
            ca_public_key: None,
        };
        let grant = GrantRecordPayload {
            granted_device_id: "caisse-3".into(),
            granted_by_device_id: "caisse-1".into(),
            tenant_fingerprint: "tenantfingerprint_alpha_1234".into(),
            decided_at: "2026-08-16T00:00:00.000Z".into(),
        };

        let signature = sign_grant_record(&identity, &grant).expect("signs successfully");

        let encoded = URL_SAFE_NO_PAD.encode(serde_json::to_string(&grant).unwrap());
        let signature_bytes = URL_SAFE_NO_PAD.decode(&signature).expect("valid base64");
        let sig = Signature::from_slice(&signature_bytes).expect("valid signature length");
        signer
            .verifying_key()
            .verify(encoded.as_bytes(), &sig)
            .expect("verifies against the signer's own public key");
    }
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd frontend/src-tauri && cargo test lan_agent`
Expected: FAIL — `verify_approval_capability`, `sign_grant_record`, `GrantRecordPayload`, and `ApprovalCapabilityPayload` don't exist yet.

- [ ] **Step 3: Implement**

Add these types and functions to `frontend/src-tauri/src/lan_agent.rs`, near `DeviceCertificatePayload`/`verify_peer_certificate`:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApprovalCapabilityPayload {
    version: u8,
    purpose: String,
    device_id: String,
    tenant_fingerprint: String,
    issued_at: u64,
    expires_at: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GrantRecordPayload {
    granted_device_id: String,
    granted_by_device_id: String,
    tenant_fingerprint: String,
    decided_at: String,
}

fn verify_approval_capability(
    capability: &str,
    identity: &StoredIdentity,
) -> Result<ApprovalCapabilityPayload, String> {
    let ca_public_key = identity
        .ca_public_key
        .as_deref()
        .ok_or("LAN certificate authority is not installed")?;

    let mut parts = capability.split('.');
    let encoded_payload = parts.next().ok_or("Invalid approval capability")?;
    let encoded_signature = parts.next().ok_or("Invalid approval capability")?;
    if parts.next().is_some() {
        return Err("Invalid approval capability".into());
    }

    let ca_bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(ca_public_key)
        .map_err(|_| "Invalid LAN certificate authority")?
        .try_into()
        .map_err(|_| "Invalid LAN certificate authority length")?;
    let verifying_key =
        VerifyingKey::from_bytes(&ca_bytes).map_err(|_| "Invalid LAN certificate authority key")?;
    let signature_bytes = URL_SAFE_NO_PAD
        .decode(encoded_signature)
        .map_err(|_| "Invalid approval capability signature")?;
    let signature = Signature::from_slice(&signature_bytes)
        .map_err(|_| "Invalid approval capability signature length")?;
    verifying_key
        .verify(encoded_payload.as_bytes(), &signature)
        .map_err(|_| "Approval capability signature rejected")?;

    let payload_bytes = URL_SAFE_NO_PAD
        .decode(encoded_payload)
        .map_err(|_| "Invalid approval capability payload")?;
    let payload: ApprovalCapabilityPayload = serde_json::from_slice(&payload_bytes)
        .map_err(|_| "Invalid approval capability payload")?;

    let now = unix_millis();
    if payload.version != 1
        || payload.purpose != "device-authorization-approve"
        || payload.expires_at <= now
        || payload.tenant_fingerprint.len() < 16
    {
        return Err("Approval capability claims rejected".into());
    }
    Ok(payload)
}

fn sign_grant_record(
    identity: &StoredIdentity,
    grant: &GrantRecordPayload,
) -> Result<String, String> {
    let key = signing_key(identity)?;
    let encoded = URL_SAFE_NO_PAD.encode(
        serde_json::to_string(grant).map_err(|error| error.to_string())?,
    );
    let signature = key.sign(encoded.as_bytes());
    Ok(URL_SAFE_NO_PAD.encode(signature.to_bytes()))
}
```

- [ ] **Step 4: Expose both as Tauri commands**

Add to `frontend/src-tauri/src/lan_agent.rs`:

```rust
#[tauri::command]
pub fn lan_agent_verify_approval_capability(
    app: AppHandle,
    capability: String,
) -> Result<bool, String> {
    let identity = load_identity(&identity_path(&app)?)?;
    Ok(verify_approval_capability(&capability, &identity).is_ok())
}

#[tauri::command]
pub fn lan_agent_sign_grant_record(
    app: AppHandle,
    granted_device_id: String,
    tenant_fingerprint: String,
) -> Result<String, String> {
    let identity = load_identity(&identity_path(&app)?)?;
    let grant = GrantRecordPayload {
        granted_device_id,
        granted_by_device_id: identity.device_id.clone(),
        tenant_fingerprint,
        decided_at: chrono_like_now(),
    };
    sign_grant_record(&identity, &grant)
}

fn chrono_like_now() -> String {
    let millis = unix_millis();
    let seconds = millis / 1000;
    let datetime = std::time::UNIX_EPOCH + Duration::from_secs(seconds);
    // Minimal ISO 8601 formatting without pulling in a date/time crate this
    // project doesn't already depend on - millisecond precision isn't
    // needed for an audit-trail timestamp.
    format!("{:?}", datetime)
}
```

Register both new commands in `frontend/src-tauri/src/lib.rs`'s `invoke_handler!` list, after the existing `lan_agent::*` entries:

```rust
            lan_agent::lan_agent_verify_approval_capability,
            lan_agent::lan_agent_sign_grant_record,
```

`lan_agent_sign_grant_record`'s `chrono_like_now()` produces Rust's debug-formatted `SystemTime`, not a clean ISO 8601 string - flagging this rather than silently shipping a wrong format: `ReconcileLanGrantDto.decidedAt` (Task 3) is validated with `@IsISO8601()` server-side, so this needs a real ISO 8601 timestamp or the reconciliation upload will fail validation. Fix before Step 5: replace `chrono_like_now()`'s body with a hand-rolled `YYYY-MM-DDTHH:MM:SS.sssZ` formatter built from `SystemTime`'s duration-since-epoch (no new crate - this project has no date/time dependency and the value here is a simple derived timestamp, not a place worth adding one for).

- [ ] **Step 5: Implement a correct ISO 8601 formatter and re-run the tests**

Replace `chrono_like_now()` with:

```rust
fn iso8601_now() -> String {
    let millis_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let total_seconds = millis_since_epoch / 1000;
    let ms = millis_since_epoch % 1000;
    let days_since_epoch = total_seconds / 86_400;
    let seconds_of_day = total_seconds % 86_400;
    let (hours, minutes, seconds) = (
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60,
    );
    let (year, month, day) = civil_from_days(days_since_epoch as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{ms:03}Z"
    )
}

// Howard Hinnant's civil_from_days algorithm - converts a day count since
// the Unix epoch into a (year, month, day) civil calendar date, correct
// for the proleptic Gregorian calendar with no external date/time crate.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
```

Update `lan_agent_sign_grant_record` to call `iso8601_now()` instead of `chrono_like_now()`.

- [ ] **Step 6: Run the full test module and verify everything passes**

Run: `cd frontend/src-tauri && cargo test lan_agent`
Expected: PASS — all pre-existing tests plus the 4 new ones from Step 1.

- [ ] **Step 7: Commit**

```bash
git add frontend/src-tauri/src/lan_agent.rs frontend/src-tauri/src/lib.rs
git commit -m "feat: verify Approval Capabilities and sign LAN grant records"
```

---

### Task 5: Frontend — X25519 sealed box and LAN message wrappers

**Files:**
- Create: `frontend/src/lib/sealedBox.ts`
- Create: `frontend/src/lib/sealedBox.test.ts`
- Modify: `frontend/src/lib/lanAgent.ts`

**Interfaces:**
- Consumes: nothing new for `sealedBox.ts` (pure WebCrypto, mirrors Plan 2 Task 4's backend implementation).
- Produces: `sealForDevice`/`openSealedBox` (matching Plan 2's backend wire format exactly - same field names, same HKDF info string, so a box sealed by either side opens on the other), plus `lanAgent.sendDeviceAuthorizationMessage`/`lanAgent.onDeviceAuthorizationEvent` — consumed by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/sealedBox.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sealForDevice, openSealedBox } from "./sealedBox";

async function generateX25519KeyPair() {
  return crypto.subtle.generateKey({ name: "X25519" } as any, true, [
    "deriveBits",
  ]) as Promise<CryptoKeyPair>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe("sealForDevice / openSealedBox", () => {
  it("round-trips a message only the target's private key can open", async () => {
    const keyPair = await generateX25519KeyPair();
    const publicKeyRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", keyPair.publicKey)
    );
    const plaintext = crypto.getRandomValues(new Uint8Array(32));

    const sealed = await sealForDevice(plaintext, toBase64(publicKeyRaw));
    const opened = await openSealedBox(sealed, keyPair.privateKey);

    expect(new Uint8Array(opened)).toEqual(plaintext);
  });

  it("fails to open with a different device's private key", async () => {
    const targetKeyPair = await generateX25519KeyPair();
    const otherKeyPair = await generateX25519KeyPair();
    const publicKeyRaw = new Uint8Array(
      await crypto.subtle.exportKey("raw", targetKeyPair.publicKey)
    );
    const plaintext = crypto.getRandomValues(new Uint8Array(32));

    const sealed = await sealForDevice(plaintext, toBase64(publicKeyRaw));

    await expect(openSealedBox(sealed, otherKeyPair.privateKey)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd frontend && npm run test:unit -- src/lib/sealedBox.test.ts`
Expected: FAIL because `./sealedBox` does not exist.

- [ ] **Step 3: Implement `sealedBox.ts`**

Create `frontend/src/lib/sealedBox.ts` (field names and the HKDF info string must match `backend/src/modules/device-authorization/sealed-box.ts` from Plan 2 exactly - this is the frontend half of the same wire format, used here for the LAN-direct path instead of the server-mediated one):

```ts
export interface SealedBox {
  ephemeralPublicKey: string;
  iv: string;
  ciphertext: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveWrapKey(
  sharedBits: ArrayBuffer,
  usage: "encrypt" | "decrypt"
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode("stockflow-tenant-key-wrap-v1"),
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    [usage]
  );
}

export async function sealForDevice(
  plaintext: Uint8Array,
  devicePublicKeyBase64: string
): Promise<SealedBox> {
  const devicePublicKey = await crypto.subtle.importKey(
    "raw",
    fromBase64(devicePublicKeyBase64),
    { name: "X25519" } as any,
    false,
    []
  );

  const ephemeralKeyPair = (await crypto.subtle.generateKey(
    { name: "X25519" } as any,
    true,
    ["deriveBits"]
  )) as CryptoKeyPair;

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: devicePublicKey } as any,
    ephemeralKeyPair.privateKey,
    256
  );

  const wrapKey = await deriveWrapKey(sharedBits, "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, plaintext);
  const ephemeralPublicKeyRaw = await crypto.subtle.exportKey(
    "raw",
    ephemeralKeyPair.publicKey
  );

  return {
    ephemeralPublicKey: toBase64(new Uint8Array(ephemeralPublicKeyRaw)),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
}

export async function openSealedBox(
  sealed: SealedBox,
  devicePrivateKey: CryptoKey
): Promise<ArrayBuffer> {
  const ephemeralPublicKey = await crypto.subtle.importKey(
    "raw",
    fromBase64(sealed.ephemeralPublicKey),
    { name: "X25519" } as any,
    false,
    []
  );
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "X25519", public: ephemeralPublicKey } as any,
    devicePrivateKey,
    256
  );
  const wrapKey = await deriveWrapKey(sharedBits, "decrypt");
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(sealed.iv) },
    wrapKey,
    fromBase64(sealed.ciphertext)
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd frontend && npm run test:unit -- src/lib/sealedBox.test.ts`
Expected: PASS — 2 tests. (This exercises Node 22's `crypto.webcrypto`-backed global `crypto.subtle`, already verified in Plan 2 to support raw-format X25519 identically to a browser's implementation.)

- [ ] **Step 5: Add the LAN message wrappers to `lanAgent.ts`**

In `frontend/src/lib/lanAgent.ts`, broaden the `onLockEvent` event-name union and add two new methods alongside `sendLockMessage`/`onLockEvent`:

```ts
  async sendDeviceAuthorizationMessage(
    address: string,
    port: number,
    path: "/device-authorization/request" | "/device-authorization/grant",
    payload: unknown
  ): Promise<void> {
    const invoke = nativeInvoke();
    if (!invoke) throw new Error("StockFlow LAN Agent is not available in this browser");
    await invoke<void>("lan_agent_send_lock_message", { address, port, path, payload });
  },

  async onDeviceAuthorizationEvent<T>(
    eventName:
      | "lan-device-authorization-request-received"
      | "lan-device-authorization-grant-received",
    handler: (event: LockMessageEvent<T>) => void
  ): Promise<() => void> {
    return this.onLockEvent(eventName as any, handler);
  },
```

`sendDeviceAuthorizationMessage` intentionally still invokes the Tauri command named `lan_agent_send_lock_message` - Task 1 only renamed the Rust-side HTTP *handler*, not this already-generic `address/port/path/payload` command, which never had lock-specific behavior to begin with.

- [ ] **Step 6: Run the frontend type-check**

Run: `cd frontend && npm run check`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/sealedBox.ts frontend/src/lib/sealedBox.test.ts frontend/src/lib/lanAgent.ts
git commit -m "feat: add X25519 sealed-box crypto and LAN device-authorization messaging"
```

---

### Task 6: Frontend — request and grant orchestration

**Files:**
- Create: `frontend/src/lib/lanDeviceAuthorization.ts`
- Create: `frontend/src/lib/lanDeviceAuthorization.test.ts`

**Interfaces:**
- Consumes: `sealForDevice`/`openSealedBox` (Task 5), `lanAgent.sendDeviceAuthorizationMessage`/`onDeviceAuthorizationEvent` (Task 5), `offlineApiRequest` (existing, `./offlineApiRequest`), Tauri commands `lan_agent_verify_approval_capability`/`lan_agent_sign_grant_record` (Task 4).
- Produces: `buildGrantRequestPayload(deviceId, devicePublicKeyBase64)`, `buildGrantResponsePayload(sealedTenantDataKey, grantSignature, ...)` (pure, testable payload-shaping functions), `reconcileGrantOverNetwork(grant)` (thin wrapper over `offlineApiRequest`) - this task builds the request/grant message *shapes* and the reconciliation upload call as pure, unit-tested functions; wiring them into a live "device found on LAN, show approve/decline UI" screen is out of scope per this plan's stated UI boundary (Global Constraints).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/lanDeviceAuthorization.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  buildGrantRequestPayload,
  buildGrantResponsePayload,
  reconcileGrantOverNetwork,
} from "./lanDeviceAuthorization";

vi.mock("./offlineApiRequest", () => ({
  offlineApiRequest: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("buildGrantRequestPayload", () => {
  it("shapes the request a new device broadcasts on the LAN", () => {
    const payload = buildGrantRequestPayload("device-b", "base64-x25519-pubkey");
    expect(payload).toEqual({
      deviceId: "device-b",
      devicePublicKey: "base64-x25519-pubkey",
    });
  });
});

describe("buildGrantResponsePayload", () => {
  it("shapes the grant a granting device sends back over the LAN", () => {
    const sealed = { ephemeralPublicKey: "e", iv: "i", ciphertext: "c" };
    const payload = buildGrantResponsePayload(
      "device-b",
      "device-a",
      "tenant-fingerprint",
      sealed,
      "approval-capability-token",
      "grant-signature"
    );
    expect(payload).toEqual({
      grantedDeviceId: "device-b",
      grantedByDeviceId: "device-a",
      tenantFingerprint: "tenant-fingerprint",
      sealedTenantDataKey: sealed,
      approvalCapability: "approval-capability-token",
      signature: "grant-signature",
    });
  });
});

describe("reconcileGrantOverNetwork", () => {
  it("queues the reconciliation upload through the existing offline-request path", async () => {
    const { offlineApiRequest } = await import("./offlineApiRequest");
    const grant = {
      grantedDeviceId: "device-b",
      grantedByDeviceId: "device-a",
      grantedByCertificate: "cert.sig",
      approvalCapability: "cap.sig",
      tenantFingerprint: "fingerprint",
      decidedAt: "2026-08-16T00:00:00.000Z",
      signature: "sig",
    };

    await reconcileGrantOverNetwork(grant);

    expect(offlineApiRequest).toHaveBeenCalledWith(
      "POST",
      "/api/device-authorization/reconcile-lan-grant",
      grant,
      { collection: "device-authorization" }
    );
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && npm run test:unit -- src/lib/lanDeviceAuthorization.test.ts`
Expected: FAIL because `./lanDeviceAuthorization` does not exist.

- [ ] **Step 3: Implement the module**

Create `frontend/src/lib/lanDeviceAuthorization.ts`:

```ts
import { offlineApiRequest } from "./offlineApiRequest";
import type { SealedBox } from "./sealedBox";

export interface GrantRequestPayload {
  deviceId: string;
  devicePublicKey: string;
}

export function buildGrantRequestPayload(
  deviceId: string,
  devicePublicKeyBase64: string
): GrantRequestPayload {
  return { deviceId, devicePublicKey: devicePublicKeyBase64 };
}

export interface GrantResponsePayload {
  grantedDeviceId: string;
  grantedByDeviceId: string;
  tenantFingerprint: string;
  sealedTenantDataKey: SealedBox;
  approvalCapability: string;
  signature: string;
}

export function buildGrantResponsePayload(
  grantedDeviceId: string,
  grantedByDeviceId: string,
  tenantFingerprint: string,
  sealedTenantDataKey: SealedBox,
  approvalCapability: string,
  signature: string
): GrantResponsePayload {
  return {
    grantedDeviceId,
    grantedByDeviceId,
    tenantFingerprint,
    sealedTenantDataKey,
    approvalCapability,
    signature,
  };
}

export interface LanGrantReconciliation {
  grantedDeviceId: string;
  grantedByDeviceId: string;
  grantedByCertificate: string;
  approvalCapability: string;
  tenantFingerprint: string;
  decidedAt: string;
  signature: string;
}

export async function reconcileGrantOverNetwork(
  grant: LanGrantReconciliation
): Promise<void> {
  await offlineApiRequest(
    "POST",
    "/api/device-authorization/reconcile-lan-grant",
    grant,
    { collection: "device-authorization" }
  );
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd frontend && npm run test:unit -- src/lib/lanDeviceAuthorization.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Run the full frontend suite, type-check, and build**

Run:

```bash
cd frontend
npm run test:unit
npm run check
npm run build
```

Expected: all tests PASS, TypeScript exits 0, Vite build exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/lanDeviceAuthorization.ts frontend/src/lib/lanDeviceAuthorization.test.ts
git commit -m "feat: add LAN device-authorization payload shaping and grant reconciliation upload"
```

---

## Self-Review

**Spec coverage:**
- §5.3 step 1 (new device broadcasts over the existing direct LAN channel) — Task 1 (transport), Task 6 (`buildGrantRequestPayload`).
- §5.3 step 2 and the Approval Capability addendum (12h TTL, distinct from the 30-day certificate, issued by the same `DeviceAuthorizationPolicy`-gated endpoint, refreshed opportunistically) — Task 2 (issuance), Task 3 (endpoint + own-device-approved gate), Task 4 (local verification).
- §5.3 step 3 (granting device seals the key itself, no server round-trip) — Task 5 (`sealForDevice`/`openSealedBox`, wire-format-identical to Plan 2's server-side implementation).
- §5.3 step 4 (signed grant record, queued for asynchronous upload, eventual-consistency accepted) — Task 4 (`sign_grant_record`), Task 3 (`reconcileLanGrant`), Task 6 (`reconcileGrantOverNetwork`, reusing the existing `offlineApiRequest` queue rather than building a new one).
- §11's "revoked admin can grant offline for at most 12h" risk — directly enforced by Task 2's `APPROVAL_CAPABILITY_LIFETIME_MS` and Task 4's expiry check in `verify_approval_capability`.
- Explicitly out of scope, per the Goal/Global Constraints: a live "new device found, approve now" UI screen (no trigger point exists yet without `stockflow_<tenantId>`), and wiring §6's `pouchdbEncryption.ts` wrapper to actually use a received Tenant Data Key (same reason).

**Placeholder scan:** no TBD/TODO markers. Task 4's `chrono_like_now()` is deliberately flagged as wrong immediately after being introduced and replaced with a correct implementation in the very next step — that's a documented mid-task correction with real code on both sides, not a placeholder left unresolved.

**Type consistency:** `SealedBox`'s field names (Task 5: `ephemeralPublicKey`/`iv`/`ciphertext`) match Plan 2 Task 4's backend `sealForDevice` return shape exactly, and match `GrantResponsePayload.sealedTenantDataKey`'s shape in Task 6. `GrantRecordPayload`'s Rust fields (Task 4: `granted_device_id`/`granted_by_device_id`/`tenant_fingerprint`/`decided_at`, camelCase over the wire via serde) match `ReconcileLanGrantDto`'s fields (Task 3) and `LanGrantReconciliation`'s TypeScript shape (Task 6). `DeviceAuthorizationService`'s constructor gains a fifth parameter in Task 3; every test harness in that file's `describe` blocks (including the ones from Plan 2) must construct it with all five arguments — flagged in Task 3 Step 1 as an update to the existing `harness()` helper, not a silent break.
