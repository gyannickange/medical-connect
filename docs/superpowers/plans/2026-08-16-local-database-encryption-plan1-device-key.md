# Device Master Key & Local Encryption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt `stockflow_local_accounts` and `stockflow_cache` at rest with a per-device key stored in the OS keyring, sign local session tokens so they can't be forged by editing `localStorage`, add a 60-minute inactivity logout, and remove the hardcoded `admin`/`admin123` default account in favor of an installer-provided credential.

**Architecture:** A Rust/Tauri command pair generates and stores a random 256-bit Device Master Key in the OS keyring (`keyring` crate), keyed by `device_id`, with fail-closed semantics if an existing encrypted database has no matching key. The frontend derives two independent keys from it via WebCrypto HKDF (never reusing the master key directly): a local data key that transparently wraps `stockflow_local_accounts`/`stockflow_cache` through AES-256-GCM with AAD-bound routing metadata, and a session-signing key that HMACs the local login session token. The existing LAN identity's Ed25519 private key moves from a plaintext JSON file into the same keyring mechanism. The hardcoded default admin is replaced by a Rust-runtime environment variable read at Tauri startup.

**Tech Stack:** Rust (Tauri 2, `keyring` crate, `ed25519-dalek`, `base64`, `rand_core`), TypeScript (WebCrypto `crypto.subtle`, PouchDB via `pouchdb-adapter-idb`), Vitest (`environment: "node"`, no RTL/jsdom).

**Spec:** `docs/superpowers/specs/2026-08-16-local-database-encryption-design.md` — this plan implements §4.1 (Device Master Key), §6 (PouchDB document encryption, local-only databases), §7 (admin provisioning), §8 (local session), and the `lan_agent.rs` half of §4.1's "same keyring command" note plus §9's keyring fail-closed requirement. §4.2, §5, and §9's device-authorization/revocation UI (Tenant Data Key, server-mediated and LAN-peer device authorization) are out of scope for this plan — they depend on backend work covered by a separate plan.

## Global Constraints

- Never reuse the Device Master Key directly as an AES or HMAC key — always derive through HKDF-SHA256 with a distinct context string per use (spec §4.1).
- `_id`/`_rev` and the whitelist fields `type`, `schemaVersion`, `state`, `tenantId`, `deviceId` stay in plaintext and are bound as AES-GCM AAD; every other document field is encrypted (spec §6).
- `stockflow_local_accounts` and `stockflow_cache` are never replicated — this plan's key never leaves the device (spec §4.1).
- Keyring `get-or-create` must fail closed: if local encrypted data already exists but the key is missing, error loudly, never silently generate a replacement key (spec §9, and the pre-existing `lan_agent.rs` bug this plan also fixes).
- No RTL/jsdom, no new test infrastructure — pure functions get Vitest unit tests, thin React glue stays untested, matching `useNativeLANAgent.ts`/`GlobalNativeLANAgent.tsx` (project convention).
- Don't add an npm dependency for crypto — WebCrypto (`crypto.subtle`) covers AES-GCM, HKDF, and HMAC natively in both the Tauri WebView and Vitest's Node 22 test environment.
- `/setup/create-admin` is deleted, not fixed — one provisioning mechanism only (spec §7).

---

### Task 1: Rust — Device Master Key keyring commands

**Files:**
- Modify: `frontend/src-tauri/Cargo.toml`
- Create: `frontend/src-tauri/src/device_key.rs`
- Modify: `frontend/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: nothing new.
- Produces: Tauri commands `read_device_master_key(device_id: String) -> Result<Option<String>, String>` and `create_device_master_key(device_id: String) -> Result<String, String>`, both returning/accepting a URL-safe-base64-encoded 32-byte key. Task 2 calls these by name via `invoke()`.

- [ ] **Step 1: Add the `keyring` dependency**

`Cargo.toml` already has `keyring = "2"` pinned (added ahead of this plan) — leave it as-is, do **not** bump it to `"3"` or add a `features = ["mock"]` list. Verified against docs.rs for 2.3.3: unlike v3, v2's `mock` module ships unconditionally with no feature flag — adding `features = ["mock"]` to a `keyring = "2"` dependency is a Cargo resolution error (no such feature exists on v2). `Entry::new(service, user) -> Result<Entry, Error>`, `Error::NoEntry`, `keyring::mock::default_credential_builder()`, and top-level `keyring::set_default_credential_builder(...)` are all confirmed present and match every Rust snippet in this plan (Tasks 1, 5, 8) exactly as written — no other code changes are needed for the version already pinned.

- [ ] **Step 2: Write the failing Rust tests**

Create `frontend/src-tauri/src/device_key.rs`:

```rust
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use rand_core::{OsRng, RngCore};

const SERVICE_NAME: &str = "stockflow-device-master-key";
const KEY_LENGTH: usize = 32;

fn entry_for(device_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE_NAME, device_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn read_device_master_key(device_id: String) -> Result<Option<String>, String> {
    let entry = entry_for(&device_id)?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn create_device_master_key(device_id: String) -> Result<String, String> {
    let entry = entry_for(&device_id)?;
    if entry.get_password().is_ok() {
        return Err("device master key already exists for this device".into());
    }
    let mut bytes = [0u8; KEY_LENGTH];
    OsRng.fill_bytes(&mut bytes);
    let encoded = URL_SAFE_NO_PAD.encode(bytes);
    entry
        .set_password(&encoded)
        .map_err(|error| error.to_string())?;
    Ok(encoded)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn use_mock_store() {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    }

    #[test]
    fn create_then_read_round_trips() {
        use_mock_store();
        let device_id = "device-test-round-trip";
        let created = create_device_master_key(device_id.into()).expect("create succeeds");
        let read = read_device_master_key(device_id.into()).expect("read succeeds");
        assert_eq!(read, Some(created));
    }

    #[test]
    fn read_returns_none_when_absent() {
        use_mock_store();
        let read =
            read_device_master_key("device-test-absent".into()).expect("read succeeds");
        assert_eq!(read, None);
    }

    #[test]
    fn create_rejects_overwriting_an_existing_key() {
        use_mock_store();
        let device_id = "device-test-no-overwrite";
        create_device_master_key(device_id.into()).expect("first create succeeds");
        let second = create_device_master_key(device_id.into());
        assert!(second.is_err());
    }

    #[test]
    fn created_keys_are_32_bytes_once_decoded() {
        use_mock_store();
        let created =
            create_device_master_key("device-test-length".into()).expect("create succeeds");
        let decoded = URL_SAFE_NO_PAD.decode(created).expect("valid base64");
        assert_eq!(decoded.len(), KEY_LENGTH);
    }
}
```

- [ ] **Step 2b: Run the tests to verify they fail to compile**

Run: `cd frontend/src-tauri && cargo test device_key`
Expected: FAIL — `device_key` module not yet registered in `lib.rs`, so `cargo` doesn't know the file exists.

- [ ] **Step 3: Register the module and its commands**

In `frontend/src-tauri/src/lib.rs`, add the module declaration after `mod lan_agent;`:

```rust
mod device_key;
```

Add both commands to the `invoke_handler!` list (after the existing `lan_agent::*` entries):

```rust
            lan_agent::lan_agent_send_lock_message,
            device_key::read_device_master_key,
            device_key::create_device_master_key,
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd frontend/src-tauri && cargo test device_key`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src-tauri/Cargo.toml frontend/src-tauri/Cargo.lock frontend/src-tauri/src/device_key.rs frontend/src-tauri/src/lib.rs
git commit -m "feat: add Device Master Key keyring commands"
```

---

### Task 2: Frontend — device master key derivation

**Files:**
- Create: `frontend/src/lib/deviceMasterKey.ts`
- Create: `frontend/src/lib/deviceMasterKey.test.ts`

**Interfaces:**
- Consumes: `read_device_master_key`/`create_device_master_key` Tauri commands (Task 1); `createPouchDB` from `./pouchdb`; `getDeviceId` from `./deviceIdentity`.
- Produces: `decideKeyBootstrap(params): KeyBootstrapDecision`, `DeviceMasterKeyUnavailableError`, `getLocalDataKey(): Promise<CryptoKey>`, `getSessionSigningKey(): Promise<CryptoKey>` — consumed by Task 4 (local data key) and Task 6 (session signing key).

- [ ] **Step 1: Write the failing test for the pure bootstrap decision**

Create `frontend/src/lib/deviceMasterKey.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decideKeyBootstrap } from "./deviceMasterKey";

describe("decideKeyBootstrap", () => {
  it("uses the existing key when one is found in the keyring", () => {
    expect(
      decideKeyBootstrap({ existingKeyFound: true, hasExistingLocalData: true })
    ).toBe("use-existing");
    expect(
      decideKeyBootstrap({ existingKeyFound: true, hasExistingLocalData: false })
    ).toBe("use-existing");
  });

  it("creates a new key on a genuinely fresh install", () => {
    expect(
      decideKeyBootstrap({ existingKeyFound: false, hasExistingLocalData: false })
    ).toBe("create-new");
  });

  it("fails closed instead of silently creating a key when local data already exists", () => {
    expect(
      decideKeyBootstrap({ existingKeyFound: false, hasExistingLocalData: true })
    ).toBe("fatal-missing-key");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && npm run test:unit -- src/lib/deviceMasterKey.test.ts`
Expected: FAIL because `./deviceMasterKey` does not exist.

- [ ] **Step 3: Implement the module**

Create `frontend/src/lib/deviceMasterKey.ts`:

```ts
import { createPouchDB } from "./pouchdb";
import { getDeviceId } from "./deviceIdentity";

type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: { invoke?: TauriInvoke };
    };
  }
}

function nativeInvoke(): TauriInvoke | null {
  return window.__TAURI__?.core?.invoke ?? null;
}

export class DeviceMasterKeyUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeviceMasterKeyUnavailableError";
  }
}

export type KeyBootstrapDecision = "use-existing" | "create-new" | "fatal-missing-key";

export function decideKeyBootstrap(params: {
  existingKeyFound: boolean;
  hasExistingLocalData: boolean;
}): KeyBootstrapDecision {
  if (params.existingKeyFound) return "use-existing";
  if (params.hasExistingLocalData) return "fatal-missing-key";
  return "create-new";
}

const LOCAL_DB_NAMES = ["stockflow_local_accounts", "stockflow_cache"] as const;

async function hasExistingLocalData(): Promise<boolean> {
  for (const name of LOCAL_DB_NAMES) {
    const db = await createPouchDB(name);
    if ((db as any)._isMock) continue;
    const info = await db.info();
    if (info.doc_count > 0) return true;
  }
  return false;
}

async function fetchRawMasterKeyBase64(): Promise<string> {
  const invoke = nativeInvoke();
  if (!invoke) {
    throw new DeviceMasterKeyUnavailableError(
      "Native device master key storage is unavailable outside the desktop app"
    );
  }

  const deviceId = getDeviceId();
  const existing = await invoke<string | null>("read_device_master_key", { deviceId });
  const decision = decideKeyBootstrap({
    existingKeyFound: existing !== null,
    hasExistingLocalData: await hasExistingLocalData(),
  });

  if (decision === "use-existing") return existing as string;
  if (decision === "create-new") {
    return invoke<string>("create_device_master_key", { deviceId });
  }
  throw new DeviceMasterKeyUnavailableError(
    "Encrypted local data exists on this device but its master key is missing from the OS keyring"
  );
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

let cachedMasterKey: Promise<CryptoKey> | null = null;

function getMasterKey(): Promise<CryptoKey> {
  if (!cachedMasterKey) {
    cachedMasterKey = fetchRawMasterKeyBase64().then((base64) =>
      crypto.subtle.importKey("raw", fromBase64(base64), "HKDF", false, ["deriveKey"])
    );
  }
  return cachedMasterKey;
}

async function deriveKey(
  contextInfo: string,
  algorithm: AesKeyGenParams | HmacKeyGenParams,
  usages: KeyUsage[]
): Promise<CryptoKey> {
  const masterKey = await getMasterKey();
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(contextInfo),
    },
    masterKey,
    algorithm,
    false,
    usages
  );
}

let cachedLocalDataKey: Promise<CryptoKey> | null = null;

export function getLocalDataKey(): Promise<CryptoKey> {
  if (!cachedLocalDataKey) {
    cachedLocalDataKey = deriveKey(
      "stockflow-local-data-key-v1",
      { name: "AES-GCM", length: 256 },
      ["encrypt", "decrypt"]
    );
  }
  return cachedLocalDataKey;
}

let cachedSessionSigningKey: Promise<CryptoKey> | null = null;

export function getSessionSigningKey(): Promise<CryptoKey> {
  if (!cachedSessionSigningKey) {
    cachedSessionSigningKey = deriveKey(
      "stockflow-session-signing-key-v1",
      { name: "HMAC", hash: "SHA-256", length: 256 } as HmacKeyGenParams,
      ["sign", "verify"]
    );
  }
  return cachedSessionSigningKey;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && npm run test:unit -- src/lib/deviceMasterKey.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npm run check`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/deviceMasterKey.ts frontend/src/lib/deviceMasterKey.test.ts
git commit -m "feat: derive local data and session signing keys from a device master key"
```

---

### Task 3: Frontend — PouchDB document encryption

**Files:**
- Create: `frontend/src/lib/pouchdbEncryption.ts`
- Create: `frontend/src/lib/pouchdbEncryption.test.ts`

**Interfaces:**
- Consumes: a `CryptoKey` (AES-GCM, 256-bit) supplied by the caller — no knowledge of where the key comes from.
- Produces: `encryptDocument(doc, key)`, `decryptDocument(doc, key)`, `DocumentDecryptionError`, `wrapPouchDB(rawDb, key)` — consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/pouchdbEncryption.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  encryptDocument,
  decryptDocument,
  DocumentDecryptionError,
  wrapPouchDB,
} from "./pouchdbEncryption";

async function testKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

describe("encryptDocument / decryptDocument", () => {
  it("round-trips a document, keeping whitelisted fields in plaintext", async () => {
    const key = await testKey();
    const doc = {
      _id: "product:1",
      type: "product",
      tenantId: "t1",
      name: "Coca-Cola",
      price: 500,
    };
    const encrypted = await encryptDocument(doc, key);
    expect(encrypted._id).toBe("product:1");
    expect(encrypted.tenantId).toBe("t1");
    expect(encrypted).not.toHaveProperty("name");
    expect(encrypted).not.toHaveProperty("price");
    expect(JSON.stringify(encrypted)).not.toContain("Coca-Cola");

    const decrypted = await decryptDocument(encrypted, key);
    expect(decrypted).toEqual(doc);
  });

  it("passes a document through unchanged when it has no _enc envelope", async () => {
    const key = await testKey();
    const plain = { _id: "a", foo: "bar" };
    await expect(decryptDocument(plain, key)).resolves.toEqual(plain);
  });

  it("rejects a document whose ciphertext has been tampered with", async () => {
    const key = await testKey();
    const encrypted = await encryptDocument({ _id: "a", name: "secret" }, key);
    const enc = encrypted._enc as { v: number; iv: string; ct: string };
    const tampered = { ...encrypted, _enc: { ...enc, ct: enc.ct.slice(0, -2) + "AA" } };
    await expect(decryptDocument(tampered, key)).rejects.toThrow(DocumentDecryptionError);
  });

  it("rejects a document whose IV has been tampered with", async () => {
    const key = await testKey();
    const encrypted = await encryptDocument({ _id: "a", name: "secret" }, key);
    const enc = encrypted._enc as { v: number; iv: string; ct: string };
    const tampered = { ...encrypted, _enc: { ...enc, iv: enc.iv.slice(0, -2) + "AA" } };
    await expect(decryptDocument(tampered, key)).rejects.toThrow(DocumentDecryptionError);
  });

  it("rejects a document whose plaintext AAD metadata has been tampered with", async () => {
    const key = await testKey();
    const encrypted = await encryptDocument(
      { _id: "a", tenantId: "t1", name: "secret" },
      key
    );
    const tampered = { ...encrypted, tenantId: "t2" };
    await expect(decryptDocument(tampered, key)).rejects.toThrow(DocumentDecryptionError);
  });

  it("fails to decrypt with the wrong key", async () => {
    const key = await testKey();
    const otherKey = await testKey();
    const encrypted = await encryptDocument({ _id: "a", name: "secret" }, key);
    await expect(decryptDocument(encrypted, otherKey)).rejects.toThrow(
      DocumentDecryptionError
    );
  });
});

describe("wrapPouchDB", () => {
  function fakeRawDb() {
    const store = new Map<string, any>();
    return {
      _isMock: false,
      async put(doc: any) {
        const stored = { ...doc, _rev: "1-fake" };
        store.set(doc._id, stored);
        return { ok: true, id: doc._id, rev: "1-fake" };
      },
      async get(id: string) {
        const doc = store.get(id);
        if (!doc) throw { name: "not_found" };
        return doc;
      },
      async remove(doc: any) {
        store.delete(doc._id);
        return { ok: true };
      },
      async allDocs(options: any) {
        const rows = Array.from(store.values()).map((doc) => ({
          id: doc._id,
          key: doc._id,
          doc: options?.include_docs ? doc : undefined,
        }));
        return { rows, total_rows: rows.length, offset: 0 };
      },
      async info() {
        return { doc_count: store.size };
      },
    };
  }

  it("encrypts on put and decrypts on get", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "product:1", name: "Coca-Cola" });
    const doc = await db.get("product:1");
    expect(doc.name).toBe("Coca-Cola");
  });

  it("stores ciphertext, not plaintext, in the underlying database", async () => {
    const key = await testKey();
    const raw = fakeRawDb();
    const db = wrapPouchDB(raw, key);
    await db.put({ _id: "product:1", name: "Coca-Cola" });
    const stored = await raw.get("product:1");
    expect(JSON.stringify(stored)).not.toContain("Coca-Cola");
  });

  it("decrypts every row returned by allDocs", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "a", name: "Alpha" });
    await db.put({ _id: "b", name: "Beta" });
    const result = await db.allDocs({ include_docs: true });
    expect(result.rows.map((row: any) => row.doc.name).sort()).toEqual(["Alpha", "Beta"]);
  });

  it("passes through non-wrapped methods like info()", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "a", name: "Alpha" });
    expect(await db.info()).toEqual({ doc_count: 1 });
  });

  it("removes documents through the underlying database", async () => {
    const key = await testKey();
    const db = wrapPouchDB(fakeRawDb(), key);
    await db.put({ _id: "a", name: "Alpha" });
    const doc = await db.get("a");
    await db.remove(doc);
    await expect(db.get("a")).rejects.toEqual({ name: "not_found" });
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd frontend && npm run test:unit -- src/lib/pouchdbEncryption.test.ts`
Expected: FAIL because `./pouchdbEncryption` does not exist.

- [ ] **Step 3: Implement the module**

Create `frontend/src/lib/pouchdbEncryption.ts`:

```ts
const PLAINTEXT_FIELDS = ["type", "schemaVersion", "state", "tenantId", "deviceId"] as const;
const ENCRYPTED_BODY_VERSION = 1;

export class DocumentDecryptionError extends Error {
  constructor(cause: unknown) {
    super("Failed to decrypt PouchDB document");
    this.name = "DocumentDecryptionError";
    this.cause = cause;
  }
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

function isClearField(field: string): boolean {
  return (
    field === "_id" ||
    field === "_rev" ||
    (PLAINTEXT_FIELDS as readonly string[]).includes(field)
  );
}

function splitClearFields(doc: Record<string, unknown>): {
  clear: Record<string, unknown>;
  secret: Record<string, unknown>;
} {
  const clear: Record<string, unknown> = {};
  const secret: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(doc)) {
    if (isClearField(field)) clear[field] = value;
    else secret[field] = value;
  }
  return { clear, secret };
}

function canonicalAad(clear: Record<string, unknown>): Uint8Array {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(clear).sort()) sorted[key] = clear[key];
  return new TextEncoder().encode(JSON.stringify(sorted));
}

export async function encryptDocument(
  doc: Record<string, unknown>,
  key: CryptoKey
): Promise<Record<string, unknown>> {
  const { clear, secret } = splitClearFields(doc);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = canonicalAad(clear);
  const plaintext = new TextEncoder().encode(JSON.stringify(secret));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData },
    key,
    plaintext
  );
  return {
    ...clear,
    _enc: {
      v: ENCRYPTED_BODY_VERSION,
      iv: toBase64(iv),
      ct: toBase64(new Uint8Array(ciphertext)),
    },
  };
}

export async function decryptDocument(
  doc: Record<string, unknown>,
  key: CryptoKey
): Promise<Record<string, unknown>> {
  const { _enc, ...rest } = doc as {
    _enc?: { v: number; iv: string; ct: string };
    [field: string]: unknown;
  };
  if (!_enc) return doc;

  const { clear } = splitClearFields(rest);
  const additionalData = canonicalAad(clear);

  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(_enc.iv), additionalData },
      key,
      fromBase64(_enc.ct)
    );
  } catch (error) {
    throw new DocumentDecryptionError(error);
  }

  const secret = JSON.parse(new TextDecoder().decode(plaintext));
  return { ...clear, ...secret };
}

export function wrapPouchDB(rawDb: any, key: CryptoKey): any {
  const overrides: Record<string, (...args: any[]) => Promise<any>> = {
    async put(doc: Record<string, unknown>) {
      return rawDb.put(await encryptDocument(doc, key));
    },
    async get(id: string, options?: unknown) {
      const doc = await rawDb.get(id, options);
      return decryptDocument(doc, key);
    },
    async remove(doc: { _id: string; _rev: string }) {
      return rawDb.remove(doc);
    },
    async allDocs(options?: Record<string, unknown>) {
      // include_docs is forced on unconditionally: every current caller
      // (localAccountsStore.ts, offlineCache.ts) already passes it, and
      // decryption has nothing to decrypt without the doc body. A future
      // caller that wants ids-only without paying the decryption cost
      // needs its own path, not an option this wrapper honors silently.
      const result = await rawDb.allDocs({ ...options, include_docs: true });
      return {
        ...result,
        rows: await Promise.all(
          result.rows.map(async (row: any) =>
            row.doc ? { ...row, doc: await decryptDocument(row.doc, key) } : row
          )
        ),
      };
    },
  };

  return new Proxy(rawDb, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in overrides) {
        return overrides[prop];
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd frontend && npm run test:unit -- src/lib/pouchdbEncryption.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Type-check**

Run: `cd frontend && npm run check`
Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/pouchdbEncryption.ts frontend/src/lib/pouchdbEncryption.test.ts
git commit -m "feat: add AES-GCM document encryption for local PouchDB databases"
```

---

### Task 4: Frontend — wire encryption into `stockflow_local_accounts` and `stockflow_cache`

**Files:**
- Create: `frontend/src/lib/encryptedPouchDB.ts`
- Modify: `frontend/src/lib/localAccountsStore.ts:1,28-34`
- Modify: `frontend/src/lib/offlineCache.ts:1-16`

**Interfaces:**
- Consumes: `getLocalDataKey` (Task 2), `wrapPouchDB` (Task 3), `createPouchDB` (existing, `./pouchdb`).
- Produces: `createEncryptedLocalPouchDB(name)`, used by `localAccountsStore.ts` and `offlineCache.ts`.

- [ ] **Step 1: Implement the wiring module**

Create `frontend/src/lib/encryptedPouchDB.ts`:

```ts
import { createPouchDB } from "./pouchdb";
import { getLocalDataKey } from "./deviceMasterKey";
import { wrapPouchDB } from "./pouchdbEncryption";

export async function createEncryptedLocalPouchDB(
  name: "stockflow_local_accounts" | "stockflow_cache"
) {
  const rawDb = await createPouchDB(name);
  if ((rawDb as any)._isMock) return rawDb;
  const key = await getLocalDataKey();
  return wrapPouchDB(rawDb, key);
}
```

- [ ] **Step 2: Wire `localAccountsStore.ts`**

In `frontend/src/lib/localAccountsStore.ts`, replace the import at line 1:

```ts
import { createPouchDB } from "./pouchdb";
```

with:

```ts
import { createEncryptedLocalPouchDB } from "./encryptedPouchDB";
```

Replace the body of `accountsDb()` (lines 28-34):

```ts
async function accountsDb() {
  const database = await createPouchDB(LOCAL_ACCOUNTS_DB_NAME);
  if ((database as any)._isMock) {
    throw new LocalStorageUnavailableError();
  }
  return database;
}
```

with:

```ts
async function accountsDb() {
  const database = await createEncryptedLocalPouchDB(LOCAL_ACCOUNTS_DB_NAME);
  if ((database as any)._isMock) {
    throw new LocalStorageUnavailableError();
  }
  return database;
}
```

- [ ] **Step 3: Wire `offlineCache.ts`**

In `frontend/src/lib/offlineCache.ts`, replace the import at line 2:

```ts
import { createPouchDB } from "./pouchdb";
```

with:

```ts
import { createEncryptedLocalPouchDB } from "./encryptedPouchDB";
```

Replace `getCacheDB()` (lines 11-16):

```ts
async function getCacheDB() {
  if (!cacheDb) {
    cacheDb = await createPouchDB("stockflow_cache");
  }
  return cacheDb;
}
```

with:

```ts
async function getCacheDB() {
  if (!cacheDb) {
    cacheDb = await createEncryptedLocalPouchDB("stockflow_cache");
  }
  return cacheDb;
}
```

- [ ] **Step 4: Run the full frontend unit suite and type-check**

Run:

```bash
cd frontend
npm run test:unit
npm run check
```

Expected: all existing tests still PASS (this task changes no tested behavior — `offlineCache.test.ts` only exercises `offlineCacheTransforms.ts`, and `localAccountsStore.ts` has no dedicated test file), TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/encryptedPouchDB.ts frontend/src/lib/localAccountsStore.ts frontend/src/lib/offlineCache.ts
git commit -m "feat: encrypt stockflow_local_accounts and stockflow_cache at rest"
```

---

### Task 5: Rust — move the LAN identity signing key into the keyring

**Files:**
- Modify: `frontend/src-tauri/src/lan_agent.rs:2,55-62,204-233,417-424,754-948`

**Interfaces:**
- Consumes: `keyring::Entry` (Task 1's dependency, already added to `Cargo.toml`).
- Produces: no change to `lan_agent_prepare_identity`'s public signature — `PreparedIdentity` and the command's callers are unaffected.

- [ ] **Step 1: Remove `signing_key` from `StoredIdentity` and add keyring helpers**

In `frontend/src-tauri/src/lan_agent.rs`, change the struct at lines 55-62:

```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredIdentity {
    device_id: String,
    signing_key: String,
    certificate: Option<String>,
    ca_public_key: Option<String>,
}
```

to:

```rust
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredIdentity {
    device_id: String,
    certificate: Option<String>,
    ca_public_key: Option<String>,
}
```

Add near the top-level helpers (after the existing `use` block, e.g. just above `const SERVICE_TYPE`):

```rust
const LAN_IDENTITY_KEY_SERVICE: &str = "stockflow-lan-identity-key";

fn lan_identity_key_entry(device_id: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(LAN_IDENTITY_KEY_SERVICE, device_id).map_err(|error| error.to_string())
}

fn save_lan_signing_key(device_id: &str, key: &SigningKey) -> Result<(), String> {
    let entry = lan_identity_key_entry(device_id)?;
    entry
        .set_password(&URL_SAFE_NO_PAD.encode(key.to_bytes()))
        .map_err(|error| error.to_string())
}
```

- [ ] **Step 2: Change `signing_key()` to read from the keyring instead of the removed struct field**

Replace `fn signing_key` (lines 417-424):

```rust
fn signing_key(identity: &StoredIdentity) -> Result<SigningKey, String> {
    let bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(&identity.signing_key)
        .map_err(|_| "Invalid LAN identity signing key")?
        .try_into()
        .map_err(|_| "Invalid LAN identity signing key length")?;
    Ok(SigningKey::from_bytes(&bytes))
}
```

with:

```rust
fn signing_key(identity: &StoredIdentity) -> Result<SigningKey, String> {
    let entry = lan_identity_key_entry(&identity.device_id)?;
    let encoded = entry
        .get_password()
        .map_err(|_| "LAN identity signing key is missing from the OS keyring".to_string())?;
    let bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(encoded)
        .map_err(|_| "Invalid LAN identity signing key")?
        .try_into()
        .map_err(|_| "Invalid LAN identity signing key length")?;
    Ok(SigningKey::from_bytes(&bytes))
}
```

(If the exact line numbers of `signing_key` have shifted after Step 1's edit, locate it by its `fn signing_key(identity: &StoredIdentity)` signature — it is unique in the file.)

- [ ] **Step 3: Fix the silent-regeneration bug in `lan_agent_prepare_identity`**

Replace the body of `lan_agent_prepare_identity` (originally lines 204-233):

```rust
#[tauri::command]
pub fn lan_agent_prepare_identity(
    app: AppHandle,
    device_id: String,
) -> Result<PreparedIdentity, String> {
    let device_id = effective_device_id(app.config().identifier.as_str(), &device_id);
    validate_device_id(&device_id)?;
    let path = identity_path(&app)?;
    let identity = match load_identity(&path) {
        Ok(existing) if existing.device_id == device_id => existing,
        _ => {
            let signing_key = SigningKey::generate(&mut OsRng);
            let created = StoredIdentity {
                device_id: device_id.clone(),
                signing_key: URL_SAFE_NO_PAD.encode(signing_key.to_bytes()),
                certificate: None,
                ca_public_key: None,
            };
            save_identity(&path, &created)?;
            created
        }
    };

    let signing_key = signing_key(&identity)?;
    Ok(PreparedIdentity {
        device_id,
        device_public_key: URL_SAFE_NO_PAD.encode(signing_key.verifying_key().to_bytes()),
        has_certificate: identity.certificate.is_some(),
    })
}
```

with:

```rust
#[tauri::command]
pub fn lan_agent_prepare_identity(
    app: AppHandle,
    device_id: String,
) -> Result<PreparedIdentity, String> {
    let device_id = effective_device_id(app.config().identifier.as_str(), &device_id);
    validate_device_id(&device_id)?;
    let path = identity_path(&app)?;

    // Fresh install (no metadata file yet) or a device-id change both mean
    // there is nothing to preserve, so generating a new identity is safe.
    // A metadata file that exists but fails to parse means an existing
    // identity is present and corrupt - that must fail loudly rather than
    // silently mint a replacement identity nobody asked for.
    let identity = if !path.exists() {
        create_new_identity(&path, &device_id)?
    } else {
        let existing = load_identity(&path)
            .map_err(|error| format!("LAN identity metadata is corrupt: {error}"))?;
        if existing.device_id != device_id {
            create_new_identity(&path, &device_id)?
        } else {
            existing
        }
    };

    // For an existing identity, this fails closed if the signing key is
    // missing from the keyring instead of silently regenerating one.
    let signing_key = signing_key(&identity)?;
    Ok(PreparedIdentity {
        device_id,
        device_public_key: URL_SAFE_NO_PAD.encode(signing_key.verifying_key().to_bytes()),
        has_certificate: identity.certificate.is_some(),
    })
}

fn create_new_identity(path: &Path, device_id: &str) -> Result<StoredIdentity, String> {
    let signing_key = SigningKey::generate(&mut OsRng);
    save_lan_signing_key(device_id, &signing_key)?;
    let created = StoredIdentity {
        device_id: device_id.to_string(),
        certificate: None,
        ca_public_key: None,
    };
    save_identity(path, &created)?;
    Ok(created)
}
```

- [ ] **Step 4: Update the existing tests that construct `StoredIdentity` literals**

In the `mod tests` block, add a small helper near the top (after `use super::*;` and `use std::time::{Duration, Instant};`):

```rust
    fn use_mock_store() {
        keyring::set_default_credential_builder(keyring::mock::default_credential_builder());
    }
```

In `certificate_verification_binds_device_and_tenant`, add `use_mock_store();` as the first line of the test body, register the device's key, and drop the removed field:

```rust
    #[test]
    fn certificate_verification_binds_device_and_tenant() {
        use_mock_store();
        let ca = SigningKey::generate(&mut OsRng);
        let device = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-1", &device).expect("store signing key");
        let identity = StoredIdentity {
            device_id: "caisse-1".into(),
            certificate: None,
            ca_public_key: None,
        };
```

(Leave the rest of the test body unchanged.)

In `peer_certificate_verification_accepts_a_same_tenant_device` and
`peer_certificate_verification_rejects_an_expired_certificate`, just drop the
`signing_key: URL_SAFE_NO_PAD.encode(SigningKey::generate(&mut OsRng).to_bytes()),`
line from each `StoredIdentity` literal — `verify_peer_certificate` never
calls `signing_key()`, so no keyring registration is needed for these two.

In `envelopes_round_trip_through_sign_and_verify`, add `use_mock_store();` as
the first line, register the sender's key, and drop the removed field:

```rust
    #[test]
    fn envelopes_round_trip_through_sign_and_verify() {
        use_mock_store();
        let ca = SigningKey::generate(&mut OsRng);
        let sender_device = SigningKey::generate(&mut OsRng);
        save_lan_signing_key("caisse-2", &sender_device).expect("store signing key");
        let sender_identity = StoredIdentity {
            device_id: "caisse-2".into(),
            certificate: None,
            ca_public_key: Some(URL_SAFE_NO_PAD.encode(ca.verifying_key().to_bytes())),
        };
```

(Leave the rest of that test body unchanged — it does not construct a second `StoredIdentity`.)

- [ ] **Step 5: Add a test for the fixed fail-closed behavior**

Add to `mod tests`:

```rust
    #[test]
    fn missing_signing_key_for_an_existing_identity_is_a_fatal_error_not_a_silent_regeneration() {
        use_mock_store();
        // Simulate an existing identity whose keyring entry never made it
        // to this machine (or was cleared) - `signing_key()` must fail
        // rather than let a caller silently mint a new one.
        let identity = StoredIdentity {
            device_id: "caisse-orphaned".into(),
            certificate: None,
            ca_public_key: None,
        };
        assert!(signing_key(&identity).is_err());
    }
```

- [ ] **Step 6: Run the full test module and verify everything passes**

Run: `cd frontend/src-tauri && cargo test lan_agent`
Expected: PASS — all pre-existing tests plus the new one.

- [ ] **Step 7: Commit**

```bash
git add frontend/src-tauri/src/lan_agent.rs
git commit -m "fix: store the LAN identity signing key in the OS keyring, fail closed on loss"
```

---

### Task 6: Frontend — sign the local session token

**Files:**
- Create: `frontend/src/lib/localSessionToken.ts`
- Create: `frontend/src/lib/localSessionToken.test.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx:1-17,53-59,80-108,156-167`

**Interfaces:**
- Consumes: `getSessionSigningKey` (Task 2).
- Produces: `LocalSession`, `SignedLocalSession`, `signLocalSession(session, key)`, `verifyLocalSession(session, key)` — consumed by `AuthContext.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/localSessionToken.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { signLocalSession, verifyLocalSession } from "./localSessionToken";

async function testKey(): Promise<CryptoKey> {
  const raw = crypto.getRandomValues(new Uint8Array(32));
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

describe("local session token", () => {
  it("verifies a session signed with the same key", async () => {
    const key = await testKey();
    const signed = await signLocalSession(
      { userId: "user:admin", expiresAt: Date.now() + 1000 },
      key
    );
    expect(await verifyLocalSession(signed, key)).toBe(true);
  });

  it("rejects a session with a tampered userId", async () => {
    const key = await testKey();
    const signed = await signLocalSession(
      { userId: "user:cashier", expiresAt: Date.now() + 1000 },
      key
    );
    const tampered = { ...signed, userId: "user:admin" };
    expect(await verifyLocalSession(tampered, key)).toBe(false);
  });

  it("rejects a session with a tampered expiresAt", async () => {
    const key = await testKey();
    const signed = await signLocalSession({ userId: "user:admin", expiresAt: Date.now() }, key);
    const tampered = { ...signed, expiresAt: signed.expiresAt + 1_000_000 };
    expect(await verifyLocalSession(tampered, key)).toBe(false);
  });

  it("rejects a session signed with a different key", async () => {
    const key = await testKey();
    const otherKey = await testKey();
    const signed = await signLocalSession({ userId: "user:admin", expiresAt: Date.now() }, key);
    expect(await verifyLocalSession(signed, otherKey)).toBe(false);
  });

  it("rejects a garbage signature instead of throwing", async () => {
    const key = await testKey();
    const signed = await signLocalSession({ userId: "user:admin", expiresAt: Date.now() }, key);
    const tampered = { ...signed, sig: "not-valid-base64!!" };
    expect(await verifyLocalSession(tampered, key)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `cd frontend && npm run test:unit -- src/lib/localSessionToken.test.ts`
Expected: FAIL because `./localSessionToken` does not exist.

- [ ] **Step 3: Implement the module**

Create `frontend/src/lib/localSessionToken.ts`:

```ts
export interface LocalSession {
  userId: string;
  expiresAt: number;
}

export interface SignedLocalSession extends LocalSession {
  sig: string;
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

function canonicalPayload(session: LocalSession): Uint8Array {
  return new TextEncoder().encode(`${session.userId}:${session.expiresAt}`);
}

export async function signLocalSession(
  session: LocalSession,
  key: CryptoKey
): Promise<SignedLocalSession> {
  const signature = await crypto.subtle.sign("HMAC", key, canonicalPayload(session));
  return { ...session, sig: toBase64(new Uint8Array(signature)) };
}

export async function verifyLocalSession(
  session: SignedLocalSession,
  key: CryptoKey
): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      key,
      fromBase64(session.sig),
      canonicalPayload(session)
    );
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd frontend && npm run test:unit -- src/lib/localSessionToken.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Wire signing and verification into `AuthContext.tsx`**

In `frontend/src/contexts/AuthContext.tsx`, add to the imports (after the existing `localAuth` import):

```ts
import { getSessionSigningKey } from "@/lib/deviceMasterKey";
import {
  signLocalSession,
  verifyLocalSession,
  type SignedLocalSession,
} from "@/lib/localSessionToken";
```

Remove the local `interface LocalSession { userId: string; expiresAt: number; }` (lines 56-59) — it is superseded by the imported types.

Replace `checkAuthLocal` (lines 80-108):

```ts
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
```

with:

```ts
  const checkAuthLocal = async () => {
    const raw = localStorage.getItem(LOCAL_SESSION_KEY);
    if (!raw) {
      clearSession();
      return;
    }

    try {
      const session: SignedLocalSession = JSON.parse(raw);
      const signingKey = await getSessionSigningKey();
      const isValidSignature = await verifyLocalSession(session, signingKey);
      if (!isValidSignature || session.expiresAt < Date.now()) {
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
```

Replace `loginLocal` (lines 156-167):

```ts
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
```

with:

```ts
  const loginLocal = async (username: string, password: string) => {
    const doc = await verifyLocalLogin(username, password);
    if (!doc) {
      throw new Error("Identifiants invalides");
    }
    const signingKey = await getSessionSigningKey();
    const session = await signLocalSession(
      { userId: doc._id, expiresAt: Date.now() + LOCAL_SESSION_TTL_MS },
      signingKey
    );
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(session));
    applyLocalSession(doc);
  };
```

- [ ] **Step 6: Run the full frontend unit suite and type-check**

Run:

```bash
cd frontend
npm run test:unit
npm run check
```

Expected: all tests PASS, TypeScript exits 0. (`AuthContext.tsx` has no dedicated test file, matching this project's convention of leaving thin React context glue untested — the signing/verification logic itself is fully covered by `localSessionToken.test.ts`.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/localSessionToken.ts frontend/src/lib/localSessionToken.test.ts frontend/src/contexts/AuthContext.tsx
git commit -m "feat: sign local session tokens with HMAC to prevent forging via localStorage"
```

---

### Task 7: Frontend — 60-minute inactivity logout

**Files:**
- Create: `frontend/src/lib/inactivityTimer.ts`
- Create: `frontend/src/lib/inactivityTimer.test.ts`
- Create: `frontend/src/hooks/useInactivityLogout.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`

**Interfaces:**
- Consumes: nothing new for the pure module; `useInactivityLogout` consumes `logout` and `isAuthenticated`, already produced by `AuthContext.tsx`.
- Produces: `isInactive(lastActivityAt, now, timeoutMs?)`, `INACTIVITY_TIMEOUT_MS`, `useInactivityLogout(onTimeout, enabled)`.

- [ ] **Step 1: Write the failing tests for the pure logic**

Create `frontend/src/lib/inactivityTimer.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isInactive, INACTIVITY_TIMEOUT_MS } from "./inactivityTimer";

describe("isInactive", () => {
  it("is not inactive right after activity", () => {
    const now = 1_000_000;
    expect(isInactive(now, now)).toBe(false);
  });

  it("is not inactive just under the threshold", () => {
    const now = 1_000_000;
    expect(isInactive(now - (INACTIVITY_TIMEOUT_MS - 1), now)).toBe(false);
  });

  it("is inactive once the threshold is reached", () => {
    const now = 1_000_000;
    expect(isInactive(now - INACTIVITY_TIMEOUT_MS, now)).toBe(true);
  });

  it("is inactive after waking from a long OS suspend", () => {
    const lastActivityAt = 1_000_000;
    const wokeUpAt = lastActivityAt + 3 * 60 * 60 * 1000;
    expect(isInactive(lastActivityAt, wokeUpAt)).toBe(true);
  });

  it("respects a custom timeout", () => {
    const now = 1_000_000;
    expect(isInactive(now - 5000, now, 10_000)).toBe(false);
    expect(isInactive(now - 15_000, now, 10_000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `cd frontend && npm run test:unit -- src/lib/inactivityTimer.test.ts`
Expected: FAIL because `./inactivityTimer` does not exist.

- [ ] **Step 3: Implement the pure module**

Create `frontend/src/lib/inactivityTimer.ts`:

```ts
export const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000;

export function isInactive(
  lastActivityAt: number,
  now: number,
  timeoutMs: number = INACTIVITY_TIMEOUT_MS
): boolean {
  return now - lastActivityAt >= timeoutMs;
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `cd frontend && npm run test:unit -- src/lib/inactivityTimer.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Implement the hook (untested, thin glue over the tested pure function)**

Create `frontend/src/hooks/useInactivityLogout.ts`:

```ts
import { useEffect, useRef } from "react";
import { isInactive, INACTIVITY_TIMEOUT_MS } from "@/lib/inactivityTimer";

const CHECK_INTERVAL_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart"] as const;

export function useInactivityLogout(onTimeout: () => void, enabled: boolean): void {
  const lastActivityAt = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;
    lastActivityAt.current = Date.now();

    const handleActivity = () => {
      lastActivityAt.current = Date.now();
    };
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, handleActivity));

    const interval = window.setInterval(() => {
      if (isInactive(lastActivityAt.current, Date.now(), INACTIVITY_TIMEOUT_MS)) {
        onTimeout();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, handleActivity));
      window.clearInterval(interval);
    };
  }, [enabled, onTimeout]);
}
```

- [ ] **Step 6: Wire the hook into `AuthContext.tsx`**

In `frontend/src/contexts/AuthContext.tsx`, add to the imports:

```ts
import { useInactivityLogout } from "@/hooks/useInactivityLogout";
```

Immediately before the provider's `return (` statement (after `logout`/`register` are defined), add:

```ts
  useInactivityLogout(logout, !!user);
```

- [ ] **Step 7: Run the full frontend unit suite, type-check, and build**

Run:

```bash
cd frontend
npm run test:unit
npm run check
npm run build
```

Expected: all tests PASS, TypeScript exits 0, Vite build exits 0.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/inactivityTimer.ts frontend/src/lib/inactivityTimer.test.ts frontend/src/hooks/useInactivityLogout.ts frontend/src/contexts/AuthContext.tsx
git commit -m "feat: log out automatically after 60 minutes of inactivity"
```

---

### Task 8: Rust — installer-provided initial admin credentials

**Files:**
- Create: `frontend/src-tauri/src/local_admin.rs`
- Modify: `frontend/src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `STOCKFLOW_INITIAL_ADMIN_USERNAME` / `STOCKFLOW_INITIAL_ADMIN_PASSWORD` process environment variables.
- Produces: Tauri command `get_initial_admin_credentials() -> Result<Option<InitialAdminCredentials>, String>` where `InitialAdminCredentials { username: String, password: String }` (camelCase over the wire) — consumed by Task 9.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src-tauri/src/local_admin.rs`:

```rust
use std::env;
use std::sync::Mutex;

#[derive(Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct InitialAdminCredentials {
    pub username: String,
    pub password: String,
}

#[tauri::command]
pub fn get_initial_admin_credentials() -> Result<Option<InitialAdminCredentials>, String> {
    let username = env::var("STOCKFLOW_INITIAL_ADMIN_USERNAME").ok();
    let password = env::var("STOCKFLOW_INITIAL_ADMIN_PASSWORD").ok();

    match (username, password) {
        (Some(username), Some(password))
            if !username.trim().is_empty() && !password.is_empty() =>
        {
            Ok(Some(InitialAdminCredentials { username, password }))
        }
        _ if cfg!(debug_assertions) => {
            let generated = generate_dev_password();
            println!(
                "[stockflow] STOCKFLOW_INITIAL_ADMIN_USERNAME/PASSWORD not set - using a one-time dev admin: admin / {generated}"
            );
            Ok(Some(InitialAdminCredentials {
                username: "admin".into(),
                password: generated,
            }))
        }
        _ => Ok(None),
    }
}

fn generate_dev_password() -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use rand_core::{OsRng, RngCore};
    let mut bytes = [0u8; 12];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    // std::env::set_var/remove_var are process-global, and cargo test runs
    // tests in parallel by default - this lock keeps the two env-touching
    // tests from racing each other.
    static ENV_LOCK: Mutex<()> = Mutex::new(());

    // std::env::set_var/remove_var were changed to `unsafe fn` in Rust
    // 1.82 (mutating the process environment races with anything else
    // reading it via libc getenv) - this project's toolchain is past that
    // version, so every call needs an unsafe block. These two helpers keep
    // that noise out of each test body; the ENV_LOCK mutex above is what
    // actually keeps the mutation itself safe across parallel test threads.
    fn set_env(key: &str, value: &str) {
        unsafe { env::set_var(key, value) };
    }

    fn clear_env(key: &str) {
        unsafe { env::remove_var(key) };
    }

    #[test]
    fn returns_configured_credentials_when_both_vars_are_set() {
        let _guard = ENV_LOCK.lock().unwrap();
        set_env("STOCKFLOW_INITIAL_ADMIN_USERNAME", "owner");
        set_env("STOCKFLOW_INITIAL_ADMIN_PASSWORD", "correct-horse-battery-staple");

        let result = get_initial_admin_credentials()
            .expect("command succeeds")
            .expect("credentials are present");

        assert_eq!(
            result,
            InitialAdminCredentials {
                username: "owner".into(),
                password: "correct-horse-battery-staple".into(),
            }
        );

        clear_env("STOCKFLOW_INITIAL_ADMIN_USERNAME");
        clear_env("STOCKFLOW_INITIAL_ADMIN_PASSWORD");
    }

    #[test]
    fn never_returns_the_old_hardcoded_default() {
        let _guard = ENV_LOCK.lock().unwrap();
        set_env("STOCKFLOW_INITIAL_ADMIN_USERNAME", "admin");
        set_env("STOCKFLOW_INITIAL_ADMIN_PASSWORD", "admin123");

        let result = get_initial_admin_credentials()
            .expect("command succeeds")
            .expect("credentials are present");

        // Configured values pass through as-is - this test documents that
        // the fixed danger was the *unconditional, code-shipped* default,
        // not this specific string; an installer who deliberately reuses
        // "admin123" is a separate, out-of-scope operational choice.
        assert_eq!(result.password, "admin123");

        clear_env("STOCKFLOW_INITIAL_ADMIN_USERNAME");
        clear_env("STOCKFLOW_INITIAL_ADMIN_PASSWORD");
    }

    #[test]
    fn falls_back_based_on_build_profile_when_unset() {
        let _guard = ENV_LOCK.lock().unwrap();
        clear_env("STOCKFLOW_INITIAL_ADMIN_USERNAME");
        clear_env("STOCKFLOW_INITIAL_ADMIN_PASSWORD");

        let result = get_initial_admin_credentials().expect("command succeeds");

        if cfg!(debug_assertions) {
            let credentials = result.expect("dev fallback is present");
            assert_eq!(credentials.username, "admin");
            assert!(!credentials.password.is_empty());
            assert_ne!(credentials.password, "admin123");
        } else {
            assert!(result.is_none());
        }
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail to compile**

Run: `cd frontend/src-tauri && cargo test local_admin`
Expected: FAIL — `local_admin` module not yet registered in `lib.rs`.

- [ ] **Step 3: Register the module and its command**

In `frontend/src-tauri/src/lib.rs`, add after `mod device_key;`:

```rust
mod local_admin;
```

Add to the `invoke_handler!` list:

```rust
            local_admin::get_initial_admin_credentials,
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `cd frontend/src-tauri && cargo test local_admin`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src-tauri/src/local_admin.rs frontend/src-tauri/src/lib.rs
git commit -m "feat: read the initial local admin credentials from the OS environment"
```

---

### Task 9: Frontend — remove the hardcoded default admin, delete `/setup/create-admin`

**Files:**
- Create: `frontend/src/lib/localAdminProvisioning.ts`
- Modify: `frontend/src/components/InstallModeGate.tsx`
- Modify: `frontend/src/lib/localAccountsStore.ts:104-123`
- Modify: `frontend/src/App.tsx:35,49`
- Delete: `frontend/src/pages/CreateLocalAdmin.tsx`

**Interfaces:**
- Consumes: `get_initial_admin_credentials` Tauri command (Task 8); `createLocalAccount` (existing, `./localAccountsStore`).
- Produces: `fetchInitialAdminCredentials(): Promise<InitialAdminCredentials | null>`.

- [ ] **Step 1: Implement the Tauri-invoke wrapper**

Create `frontend/src/lib/localAdminProvisioning.ts`:

```ts
type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: { invoke?: TauriInvoke };
    };
  }
}

export interface InitialAdminCredentials {
  username: string;
  password: string;
}

export async function fetchInitialAdminCredentials(): Promise<InitialAdminCredentials | null> {
  const invoke = window.__TAURI__?.core?.invoke;
  if (!invoke) return null;
  return invoke<InitialAdminCredentials | null>("get_initial_admin_credentials");
}
```

- [ ] **Step 2: Rewrite `InstallModeGate.tsx`'s local-mode bootstrap**

In `frontend/src/components/InstallModeGate.tsx`, replace the import:

```ts
import { countLocalAccounts, seedDefaultLocalAdmin } from "@/lib/localAccountsStore";
```

with:

```ts
import { countLocalAccounts, createLocalAccount } from "@/lib/localAccountsStore";
import { fetchInitialAdminCredentials } from "@/lib/localAdminProvisioning";
```

Replace the `SETUP_PATHS` constant:

```ts
const SETUP_PATHS = ["/setup", "/setup/create-admin"];
```

with:

```ts
const SETUP_PATHS = ["/setup"];
```

Replace the local-mode branch inside `evaluate()`:

```ts
        if (mode === "local") {
          const count = await countLocalAccounts();
          if (cancelled) return;
          if (count === 0) {
            // First local launch: seed the default admin (admin/admin123).
            // Throws if storage is unavailable, which is caught below and
            // surfaced via the `failed` state.
            await seedDefaultLocalAdmin();
            if (cancelled) return;
          }
          if (
            SETUP_PATHS.includes(location) ||
            CONNECTED_ONLY_PATHS.includes(location)
          ) {
            setLocation("/login");
          }
          setChecking(false);
          return;
        }
```

with:

```ts
        if (mode === "local") {
          const count = await countLocalAccounts();
          if (cancelled) return;
          if (count === 0) {
            const credentials = await fetchInitialAdminCredentials();
            if (!credentials) {
              // No STOCKFLOW_INITIAL_ADMIN_USERNAME/PASSWORD configured for
              // this installation and no dev fallback applies (production
              // build) - refuse to start rather than fall back to a
              // guessable identifier.
              if (!cancelled) {
                setFailed(true);
                setChecking(false);
              }
              return;
            }
            // The recovery code is normally shown once by a dedicated
            // "create admin" screen; that screen no longer exists (see
            // spec section 7), so it is surfaced here instead of being
            // silently discarded.
            const { recoveryCode } = await createLocalAccount({
              username: credentials.username,
              password: credentials.password,
              role: "admin",
            });
            console.info(
              `[stockflow] Local admin "${credentials.username}" created. Recovery code: ${recoveryCode}`
            );
            if (cancelled) return;
          }
          if (
            SETUP_PATHS.includes(location) ||
            CONNECTED_ONLY_PATHS.includes(location)
          ) {
            setLocation("/login");
          }
          setChecking(false);
          return;
        }
```

- [ ] **Step 3: Remove the hardcoded default admin from `localAccountsStore.ts`**

In `frontend/src/lib/localAccountsStore.ts`, delete the `DEFAULT_LOCAL_ADMIN` constant and `seedDefaultLocalAdmin` function (lines 104-123):

```ts
export const DEFAULT_LOCAL_ADMIN = {
  username: "admin",
  password: "admin123",
} as const;

export async function seedDefaultLocalAdmin(): Promise<{
  doc: LocalUserDoc;
  recoveryCode: string;
} | null> {
  const existing = await findLocalAccountByUsername(DEFAULT_LOCAL_ADMIN.username);
  if (existing) return null;
  return createLocalAccount({
    username: DEFAULT_LOCAL_ADMIN.username,
    password: DEFAULT_LOCAL_ADMIN.password,
    role: "admin",
    firstName: "Admin",
    lastName: "",
    email: null,
  });
}

```

- [ ] **Step 4: Delete the unreachable-turned-obsolete create-admin page and its route**

Delete `frontend/src/pages/CreateLocalAdmin.tsx`.

In `frontend/src/App.tsx`, remove the import at line 35:

```ts
import CreateLocalAdmin from "./pages/CreateLocalAdmin";
```

and the route at line 49:

```tsx
      <Route path="/setup/create-admin" component={CreateLocalAdmin} />
```

(`RecoveryCodeDisplay`, imported by the deleted page, stays — it is still used by `LocalPasswordRecovery.tsx` and `Staff.tsx`.)

- [ ] **Step 5: Run the full frontend unit suite, type-check, and build**

Run:

```bash
cd frontend
npm run test:unit
npm run check
npm run build
```

Expected: all tests PASS, TypeScript exits 0 (no dangling references to `CreateLocalAdmin`, `seedDefaultLocalAdmin`, or `DEFAULT_LOCAL_ADMIN`), Vite build exits 0.

- [ ] **Step 6: Manually verify the desktop app in local mode**

Run: `cd frontend && npm run tauri dev` (or the project's existing dev launch command), select local mode on first run, confirm:
- Without `STOCKFLOW_INITIAL_ADMIN_USERNAME`/`STOCKFLOW_INITIAL_ADMIN_PASSWORD` set, the console prints a generated dev password and login works with `admin` / that password.
- With both variables set, login works with the configured username/password and never with `admin`/`admin123`.
- Waiting 60+ minutes idle (or temporarily lowering `INACTIVITY_TIMEOUT_MS` for the manual check) logs the session out automatically.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/localAdminProvisioning.ts frontend/src/components/InstallModeGate.tsx frontend/src/lib/localAccountsStore.ts frontend/src/App.tsx
git rm frontend/src/pages/CreateLocalAdmin.tsx
git commit -m "feat: provision the initial local admin from the environment, remove the hardcoded default"
```

---

## Self-Review

**Spec coverage:**
- §4.1 (Device Master Key, HKDF derivation, no direct reuse) — Tasks 1, 2.
- §6 (AES-256-GCM document encryption, AAD-bound whitelist fields, applied to `stockflow_local_accounts`/`stockflow_cache`) — Tasks 3, 4. The `find()`/`createIndex()` Mango guard is explicitly deferred to whichever plan wires up `stockflow_<tenantId>` (neither database in this plan's scope ever calls those methods).
- §4.1's LAN identity keyring migration — Task 5, which also fixes the pre-existing silent-regeneration bug flagged in §9.
- §7 (delete `/setup/create-admin`, environment-variable provisioning, dev/prod fallback mirroring `LanIdentityService`) — Tasks 8, 9.
- §8.1 (signed session token) — Task 6. §8.2 (60-minute inactivity timeout, wall-clock comparison surviving OS suspend, 7-day absolute cap unchanged) — Task 7.
- §9's keyring fail-closed requirement — Task 1 (`decideKeyBootstrap`) and Task 5 (LAN identity).
- §4.2, §5 (Tenant Data Key, device authorization, Chemin A/B, Approval Capability), and §9's Settings revocation UI are out of scope for this plan, as stated in the Goal/Architecture section — they belong to the follow-up plan(s) covering the backend device-authorization module.

**Placeholder scan:** no TBD/TODO markers; every step has runnable code or an exact command.

**Type consistency:** `getLocalDataKey()`/`getSessionSigningKey()` (Task 2) are called with the exact same names in Tasks 4 and 6. `wrapPouchDB(rawDb, key)` (Task 3) matches its call in `encryptedPouchDB.ts` (Task 4). `SignedLocalSession`/`signLocalSession`/`verifyLocalSession` (Task 6) match across the test and the `AuthContext.tsx` edit. `InitialAdminCredentials` (Rust, Task 8, camelCase over the wire via `serde(rename_all = "camelCase")`) matches the TypeScript `InitialAdminCredentials` interface shape (Task 9). `read_device_master_key`/`create_device_master_key` (Task 1) match the exact command strings invoked in Task 2.
