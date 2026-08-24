# Rename to Business Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from "StockFlow" to "Business Connect" everywhere the name appears — user-visible text, package/crate/bundle metadata, and every internal technical identifier (database name prefixes, localStorage/keyring keys, crypto context strings, mDNS service type, env var prefix, Docker service names, CI release name) — with no data-migration path, because no real tenant data exists in the field yet.

**Architecture:** This is a pure mechanical rename, not a feature change. No new behavior is introduced; every changed string is either display text or an internal identifier whose *value* changes but whose *role* stays identical. Each task edits a cohesive group of files and then runs that subsystem's existing test suite to confirm nothing broke. There is no new test-writing (TDD doesn't apply — we're not adding behavior), but every task ends by running the tests that already cover the changed code and confirming they still pass with the new literal values.

**Tech Stack:** TypeScript/React (frontend), NestJS (backend), Rust/Tauri (desktop shell), Vitest (frontend tests), Jest (backend tests), Cargo test (Rust tests).

**Spec:** No separate spec document. Scope was clarified directly with the user via two scoping questions (see below) rather than through the brainstorming/spec-writing flow, because this is a rename, not new functionality.

## Global Constraints

- **Confirmed with the user:** the app is pre-production — no real desktop installs or tenant data exist yet — so this rename does **not** need a data-migration path. Internal identifiers (DB names, Tauri bundle id, storage keys, crypto context strings) can change directly.
- **Naming convention — apply mechanically, do not improvise per-file:**
  | Old form | New form | Where it appears |
  |---|---|---|
  | `StockFlow` (display/prose) | `Business Connect` | UI text, i18n strings, log messages, window titles, doc prose |
  | `stockflow` immediately followed by `_`, end-of-string, or `:` (squashed/underscore identifier) | `businessconnect` | DB name prefixes, localStorage keys, env var prefix (`STOCKFLOW_` → `BUSINESSCONNECT_`), mDNS service type, Rust `snake_case` lib name, standalone bare-word identifiers (e.g. `COUCHDB_USER` value) |
  | `stockflow-` (hyphenated identifier) | `business-connect-` | npm/cargo package names, Docker container/password, keyring service names, HKDF/crypto context strings, log tag prefixes |
  | `com.stockflow.desktop` (Tauri identifier) | `com.businessconnect.desktop` | Tauri bundle identifier (+ `.caisse1`/`.caisse2` variants) |
- **Explicitly out of scope for this plan** (do not touch):
  - The physical repository directory name (`StockFlow/`) and the GitHub remote/repo name — filesystem/hosting-level changes outside a code plan; call these out to the user as optional manual follow-ups once this plan lands.
  - Historical, dated documents that record a point in time: everything under `docs/superpowers/plans/*`, `docs/superpowers/specs/*`, `docs/research/*`, `docs/BRAINSTORMING_FONCTIONNEMENT_ACTUEL_ET_SYNC_LAN.md`, `docs/TEST_SIMULATEUR_LAN.md`, `frontend/docs/*`, `backend/docs/*`, `CRUD_AUDIT_REPORT.md`, `plans/crud-remediation/*`. These are historical records of work done under the old name — rewriting them would misrepresent history. Only *living* reference docs are renamed (Task 9).
  - `frontend/src-tauri/gen/schemas/*.json` and `frontend/src-tauri/Cargo.lock` — both are build-generated artifacts that regenerate automatically (`cargo check`/`tauri build`); hand-editing them is pointless and they're re-derived in Task 1.
  - `.impeccable/hook.cache.json` (both root and `frontend/`) — a generated cache file, not hand-maintained.
- Per project CLAUDE.md: **skip per-task commits.** Implement and verify all tasks with changes left uncommitted; the plan ends by asking the user once, at the end, whether/how to commit. No task below has a "Commit" step for this reason.
- Never run `git commit`/`git push` without the user's explicit go-ahead.

---

### Task 1: Rust/Tauri desktop shell rename

**Files:**
- Modify: `frontend/src-tauri/Cargo.toml`
- Modify: `frontend/src-tauri/src/main.rs`
- Modify: `frontend/src-tauri/src/lib.rs`
- Modify: `frontend/src-tauri/src/device_key.rs`
- Modify: `frontend/src-tauri/src/lan_agent.rs`
- Modify: `frontend/src-tauri/src/local_admin.rs`
- Modify: `frontend/src-tauri/tauri.conf.json`
- Modify: `frontend/src-tauri/tauri.caisse1.conf.json`
- Modify: `frontend/src-tauri/tauri.caisse2.conf.json`
- Modify: `frontend/src-tauri/capabilities/default.json`
- Regenerate (do not hand-edit): `frontend/src-tauri/Cargo.lock`, `frontend/src-tauri/gen/schemas/capabilities.json`

**Interfaces:**
- Produces: Tauri identifier `com.businessconnect.desktop` (+ `.caisse1`/`.caisse2`), env vars `BUSINESSCONNECT_INITIAL_ADMIN_USERNAME`/`BUSINESSCONNECT_INITIAL_ADMIN_PASSWORD`, mDNS service type `_businessconnect._tcp.local.`, keyring service names `business-connect-device-master-key` and `business-connect-lan-identity-key`. These are consumed by Task 2 (frontend reads the same env var name in comments only) — no other task depends on Rust internals directly.

- [ ] **Step 1: Edit `Cargo.toml`**

```toml
[package]
name = "business-connect-desktop"
version = "0.1.0"
description = "Business Connect desktop shell and local LAN agent"
authors = ["Business Connect"]
edition = "2021"

[lib]
name = "business_connect_desktop_lib"
crate-type = ["staticlib", "cdylib", "rlib"]
```

(Only the `name`, `description`, `authors`, and `[lib] name` values change — leave `version`, `edition`, and every dependency line untouched.)

- [ ] **Step 2: Edit `src/main.rs`**

```rust
fn main() {
    business_connect_desktop_lib::run();
}
```

- [ ] **Step 3: Edit `src/lib.rs`**

Replace:
```rust
        "com.stockflow.desktop.caisse1" => Some([
```
with:
```rust
        "com.businessconnect.desktop.caisse1" => Some([
```

Replace:
```rust
        "com.stockflow.desktop.caisse2" => Some([
```
with:
```rust
        "com.businessconnect.desktop.caisse2" => Some([
```

Replace:
```rust
        .expect("error while running StockFlow desktop");
```
with:
```rust
        .expect("error while running Business Connect desktop");
```

- [ ] **Step 4: Edit `src/device_key.rs`**

Replace:
```rust
const SERVICE_NAME: &str = "stockflow-device-master-key";
```
with:
```rust
const SERVICE_NAME: &str = "business-connect-device-master-key";
```

- [ ] **Step 5: Edit `src/lan_agent.rs`**

Replace:
```rust
const LAN_IDENTITY_KEY_SERVICE: &str = "stockflow-lan-identity-key";
```
with:
```rust
const LAN_IDENTITY_KEY_SERVICE: &str = "business-connect-lan-identity-key";
```

Replace:
```rust
const SERVICE_TYPE: &str = "_stockflow._tcp.local.";
```
with:
```rust
const SERVICE_TYPE: &str = "_businessconnect._tcp.local.";
```

Replace:
```rust
    eprintln!("[StockFlow LAN] agent started: {device_id}");
```
with:
```rust
    eprintln!("[Business Connect LAN] agent started: {device_id}");
```

Replace:
```rust
fn effective_device_id(app_identifier: &str, requested_device_id: &str) -> String {
    app_identifier
        .strip_prefix("com.stockflow.desktop.")
```
with:
```rust
fn effective_device_id(app_identifier: &str, requested_device_id: &str) -> String {
    app_identifier
        .strip_prefix("com.businessconnect.desktop.")
```

Replace:
```rust
fn effective_agent_port(app_identifier: &str) -> u16 {
    app_identifier
        .strip_prefix("com.stockflow.desktop.caisse")
```
with:
```rust
fn effective_agent_port(app_identifier: &str) -> u16 {
    app_identifier
        .strip_prefix("com.businessconnect.desktop.caisse")
```

Replace:
```rust
                        eprintln!(
                            "[StockFlow LAN] same-tenant peer discovered: {}",
                            peer.device_id
                        );
```
with:
```rust
                        eprintln!(
                            "[Business Connect LAN] same-tenant peer discovered: {}",
                            peer.device_id
                        );
```

In the `#[cfg(test)]` module, replace the three `effective_device_id`/`effective_agent_port` test bodies:
```rust
    #[test]
    fn simulator_profiles_have_distinct_native_device_ids() {
        assert_eq!(
            effective_device_id("com.stockflow.desktop.caisse1", "browser-device"),
            "device-sim-caisse1"
        );
        assert_eq!(
            effective_device_id("com.stockflow.desktop.caisse2", "browser-device"),
            "device-sim-caisse2"
        );
        assert_eq!(
            effective_device_id("com.stockflow.desktop", "browser-device"),
            "browser-device"
        );
    }

    #[test]
    fn simulator_profiles_have_distinct_agent_ports() {
        assert_eq!(
            effective_agent_port("com.stockflow.desktop.caisse1"),
            DEFAULT_AGENT_PORT + 1
        );
        assert_eq!(
            effective_agent_port("com.stockflow.desktop.caisse2"),
            DEFAULT_AGENT_PORT + 2
        );
        assert_eq!(
            effective_agent_port("com.stockflow.desktop"),
            DEFAULT_AGENT_PORT
        );
    }
```
with:
```rust
    #[test]
    fn simulator_profiles_have_distinct_native_device_ids() {
        assert_eq!(
            effective_device_id("com.businessconnect.desktop.caisse1", "browser-device"),
            "device-sim-caisse1"
        );
        assert_eq!(
            effective_device_id("com.businessconnect.desktop.caisse2", "browser-device"),
            "device-sim-caisse2"
        );
        assert_eq!(
            effective_device_id("com.businessconnect.desktop", "browser-device"),
            "browser-device"
        );
    }

    #[test]
    fn simulator_profiles_have_distinct_agent_ports() {
        assert_eq!(
            effective_agent_port("com.businessconnect.desktop.caisse1"),
            DEFAULT_AGENT_PORT + 1
        );
        assert_eq!(
            effective_agent_port("com.businessconnect.desktop.caisse2"),
            DEFAULT_AGENT_PORT + 2
        );
        assert_eq!(
            effective_agent_port("com.businessconnect.desktop"),
            DEFAULT_AGENT_PORT
        );
    }
```

And the peer-reconciliation test's two `"peer._stockflow._tcp.local."` occurrences:
```rust
        let mut peers = HashMap::from([(
            "peer._stockflow._tcp.local.".into(),
            LanPeer {
                device_id: "peer".into(),
                service_name: "peer._stockflow._tcp.local.".into(),
```
with:
```rust
        let mut peers = HashMap::from([(
            "peer._businessconnect._tcp.local.".into(),
            LanPeer {
                device_id: "peer".into(),
                service_name: "peer._businessconnect._tcp.local.".into(),
```

- [ ] **Step 6: Edit `src/local_admin.rs`** (all occurrences — use find/replace across the file)

Replace every `STOCKFLOW_INITIAL_ADMIN_USERNAME` with `BUSINESSCONNECT_INITIAL_ADMIN_USERNAME`, and every `STOCKFLOW_INITIAL_ADMIN_PASSWORD` with `BUSINESSCONNECT_INITIAL_ADMIN_PASSWORD` (7 lines total: the two `env::var` reads, the log format string, and the 4 test `set_env`/`clear_env` calls).

Also replace:
```rust
                "[stockflow] STOCKFLOW_INITIAL_ADMIN_USERNAME/PASSWORD not set - using a one-time dev admin: admin / {generated}"
```
with (after the env var rename above already applied):
```rust
                "[businessconnect] BUSINESSCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD not set - using a one-time dev admin: admin / {generated}"
```

- [ ] **Step 7: Edit `tauri.conf.json`**

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "Business Connect",
  "version": "0.1.0",
  "identifier": "com.businessconnect.desktop",
  "build": {
    "beforeDevCommand": "npm run dev",
    "devUrl": "http://localhost:3000",
    "beforeBuildCommand": "npm run build",
    "frontendDist": "../dist"
  },
  "app": {
    "withGlobalTauri": true,
    "windows": [
      {
        "title": "Business Connect",
        "width": 1440,
        "height": 900,
        "minWidth": 1024,
        "minHeight": 700
      }
    ],
    "security": {
      "csp": null,
      "capabilities": ["default"]
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

- [ ] **Step 8: Edit `tauri.caisse1.conf.json`**

Replace `"productName": "StockFlow Caisse 1"` → `"productName": "Business Connect Caisse 1"`.
Replace `"identifier": "com.stockflow.desktop.caisse1"` → `"identifier": "com.businessconnect.desktop.caisse1"`.
Replace `"title": "StockFlow — Caisse 1"` → `"title": "Business Connect — Caisse 1"`.

- [ ] **Step 9: Edit `tauri.caisse2.conf.json`**

Replace `"productName": "StockFlow Caisse 2"` → `"productName": "Business Connect Caisse 2"`.
Replace `"identifier": "com.stockflow.desktop.caisse2"` → `"identifier": "com.businessconnect.desktop.caisse2"`.
Replace `"title": "StockFlow — Caisse 2"` → `"title": "Business Connect — Caisse 2"`.

- [ ] **Step 10: Edit `capabilities/default.json`**

Replace:
```json
  "description": "Minimal permissions for the StockFlow desktop window",
```
with:
```json
  "description": "Minimal permissions for the Business Connect desktop window",
```

- [ ] **Step 11: Regenerate `Cargo.lock` and the Tauri-generated schema**

Run: `cd frontend/src-tauri && cargo check`
Expected: succeeds, and rewrites the `stockflow-desktop`/`stockflow_desktop_lib` entries in `Cargo.lock` to the new names. `gen/schemas/capabilities.json` regenerates the next time `tauri dev`/`tauri build` runs (it's a Tauri build artifact) — no separate manual step needed now, but do not hand-edit it if you notice it's stale.

- [ ] **Step 12: Run the Rust test suite**

Run: `cd frontend/src-tauri && cargo test`
Expected: PASS, including `simulator_profiles_have_distinct_native_device_ids`, `simulator_profiles_have_distinct_agent_ports`, `peer_reconciliation_clears_everything_when_the_lan_disappears`, and the `device_key.rs` round-trip tests.

---

### Task 2: Frontend internal identifiers — storage, database naming, and crypto context strings

**Files:**
- Modify: `frontend/src/lib/pouchdb.ts`
- Modify: `frontend/src/lib/categoriesReplica.ts`
- Modify: `frontend/src/lib/categoriesReplica.test.ts`
- Modify: `frontend/src/lib/productsReplica.ts`
- Modify: `frontend/src/lib/productsReplica.test.ts`
- Modify: `frontend/src/lib/stockReplica.ts`
- Modify: `frontend/src/lib/stockReplica.test.ts`
- Modify: `frontend/src/lib/encryptedPouchDB.ts`
- Modify: `frontend/src/lib/offlineCache.ts`
- Modify: `frontend/src/lib/localAccountsStore.ts`
- Modify: `frontend/src/lib/deviceMasterKey.ts`
- Modify: `frontend/src/lib/sealedBox.ts`
- Modify: `frontend/src/lib/deviceIdentity.ts`
- Modify: `frontend/src/lib/deviceIdentity.test.ts`
- Modify: `frontend/src/lib/errorLogStore.ts`
- Modify: `frontend/src/lib/errorLogStore.test.ts`
- Modify: `frontend/src/lib/installMode.ts`
- Modify: `frontend/src/lib/installMode.test.ts`
- Modify: `frontend/src/lib/offlineApiRequest.ts`
- Modify: `frontend/src/lib/i18n/index.ts`
- Modify: `frontend/src/lib/productLock.test.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/contexts/TenantContext.tsx`
- Modify: `frontend/src/contexts/ThemeContext.tsx`

**Interfaces:**
- Consumes: none from other tasks.
- Produces: PouchDB database names `businessconnect_${tenantId}`, `businessconnect_local_accounts`, `businessconnect_cache`; localStorage keys `businessconnect_local_session`, `businessconnect_current_tenant`, `businessconnect_theme`, `businessconnect_language`, `businessconnect_device_id`, `businessconnect_device_name`, `businessconnect_error_logs`, `businessconnect_install_mode`; HKDF context strings `business-connect-local-data-key-v1`, `business-connect-session-signing-key-v1`, `business-connect-tenant-key-wrap-v1`; event name `businessconnect:offline-mutation-saved`. The `business-connect-tenant-key-wrap-v1` string **must match** the one produced by Task 5 in the backend's `sealed-box.ts` — both sides derive the same wrap key from this literal, so they must be renamed identically and land together (they do, both in this single plan).

- [ ] **Step 1: Edit `pouchdb.ts`**

Replace:
```ts
      // Get tenant ID from dbName (format: stockflow_<tenantId>)
      const tenantId = dbName.replace("stockflow_", "");
```
with:
```ts
      // Get tenant ID from dbName (format: businessconnect_<tenantId>)
      const tenantId = dbName.replace("businessconnect_", "");
```

- [ ] **Step 2: Edit `categoriesReplica.ts` and its test**

In `categoriesReplica.ts`, replace:
```ts
  return `stockflow_${tenantId}`;
```
with:
```ts
  return `businessconnect_${tenantId}`;
```

In `categoriesReplica.test.ts`, replace all three occurrences of `stockflow_tenant-1` (lines 16, 23, 45, 47 — appears 4 times total across those lines) with `businessconnect_tenant-1`, e.g.:
```ts
    expect(categoriesReplicaDatabaseName("tenant-1")).toBe("stockflow_tenant-1");
```
→
```ts
    expect(categoriesReplicaDatabaseName("tenant-1")).toBe("businessconnect_tenant-1");
```
and likewise for the `"/api/couch-proxy/stockflow_tenant-1"` and `createPouchDB` assertions on the other lines.

- [ ] **Step 3: Edit `productsReplica.ts` and its test**

In `productsReplica.ts`, replace:
```ts
  return `stockflow_${tenantId}`;
```
with:
```ts
  return `businessconnect_${tenantId}`;
```

In `productsReplica.test.ts`, replace every `stockflow_tenant-1` (lines 97, 104, 126, 128) and the `stockflow_local` on line 223 with `businessconnect_tenant-1` / `businessconnect_local` respectively.

- [ ] **Step 4: Edit `stockReplica.ts` and its test**

In `stockReplica.ts`, replace:
```ts
  return `stockflow_${tenantId}`;
```
with:
```ts
  return `businessconnect_${tenantId}`;
```

In `stockReplica.test.ts`, replace every `stockflow_tenant-1` (lines 16, 23, 45, 47) with `businessconnect_tenant-1`.

- [ ] **Step 5: Edit `encryptedPouchDB.ts`**

Replace:
```ts
  name: "stockflow_local_accounts" | "stockflow_cache"
```
with:
```ts
  name: "businessconnect_local_accounts" | "businessconnect_cache"
```

- [ ] **Step 6: Edit `offlineCache.ts`**

Replace:
```ts
    cacheDb = await createEncryptedLocalPouchDB("stockflow_cache");
```
with:
```ts
    cacheDb = await createEncryptedLocalPouchDB("businessconnect_cache");
```

- [ ] **Step 7: Edit `localAccountsStore.ts`**

Replace:
```ts
export const LOCAL_ACCOUNTS_DB_NAME = "stockflow_local_accounts";
```
with:
```ts
export const LOCAL_ACCOUNTS_DB_NAME = "businessconnect_local_accounts";
```

- [ ] **Step 8: Edit `deviceMasterKey.ts`**

Replace:
```ts
const LOCAL_DB_NAMES = ["stockflow_local_accounts", "stockflow_cache"] as const;
```
with:
```ts
const LOCAL_DB_NAMES = ["businessconnect_local_accounts", "businessconnect_cache"] as const;
```

Replace:
```ts
      "stockflow-local-data-key-v1",
```
with:
```ts
      "business-connect-local-data-key-v1",
```

Replace:
```ts
      "stockflow-session-signing-key-v1",
```
with:
```ts
      "business-connect-session-signing-key-v1",
```

- [ ] **Step 9: Edit `sealedBox.ts`**

Replace:
```ts
      info: new TextEncoder().encode("stockflow-tenant-key-wrap-v1"),
```
with:
```ts
      info: new TextEncoder().encode("business-connect-tenant-key-wrap-v1"),
```

- [ ] **Step 10: Edit `deviceIdentity.ts` and its test**

In `deviceIdentity.ts`, replace:
```ts
const DEVICE_ID_STORAGE_KEY = "stockflow_device_id";
```
with:
```ts
const DEVICE_ID_STORAGE_KEY = "businessconnect_device_id";
```
and:
```ts
const DEVICE_NAME_STORAGE_KEY = "stockflow_device_name";
```
with:
```ts
const DEVICE_NAME_STORAGE_KEY = "businessconnect_device_name";
```

In `deviceIdentity.test.ts`, replace:
```ts
    store.set("stockflow_device_id", "device-fixed");
    store.set("stockflow_device_name", "Caisse Accueil");
```
with:
```ts
    store.set("businessconnect_device_id", "device-fixed");
    store.set("businessconnect_device_name", "Caisse Accueil");
```

- [ ] **Step 11: Edit `errorLogStore.ts` and its test**

In `errorLogStore.ts`, replace:
```ts
const STORAGE_KEY = "stockflow_error_logs";
```
with:
```ts
const STORAGE_KEY = "businessconnect_error_logs";
```

In `errorLogStore.test.ts`, replace:
```ts
        if (key === "stockflow_error_logs") {
```
with:
```ts
        if (key === "businessconnect_error_logs") {
```

- [ ] **Step 12: Edit `installMode.ts` and its test**

In `installMode.ts`, replace:
```ts
const INSTALL_MODE_KEY = "stockflow_install_mode";
```
with:
```ts
const INSTALL_MODE_KEY = "businessconnect_install_mode";
```

In `installMode.test.ts`, replace:
```ts
    store.set("stockflow_install_mode", "garbage");
```
with:
```ts
    store.set("businessconnect_install_mode", "garbage");
```

- [ ] **Step 13: Edit `offlineApiRequest.ts`**

Replace:
```ts
export const OFFLINE_MUTATION_SAVED_EVENT = "stockflow:offline-mutation-saved";
```
with:
```ts
export const OFFLINE_MUTATION_SAVED_EVENT = "businessconnect:offline-mutation-saved";
```

- [ ] **Step 14: Edit `i18n/index.ts`**

Replace both:
```ts
  localStorage.setItem("stockflow_language", lang);
```
```ts
  const stored = localStorage.getItem("stockflow_language") as Language;
```
with:
```ts
  localStorage.setItem("businessconnect_language", lang);
```
```ts
  const stored = localStorage.getItem("businessconnect_language") as Language;
```

- [ ] **Step 15: Edit `productLock.test.ts`**

Replace:
```ts
    serviceName: "stockflow",
```
with:
```ts
    serviceName: "businessconnect",
```

- [ ] **Step 16: Edit `AuthContext.tsx`**

Replace:
```ts
const LOCAL_SESSION_KEY = "stockflow_local_session";
```
with:
```ts
const LOCAL_SESSION_KEY = "businessconnect_local_session";
```

- [ ] **Step 17: Edit `TenantContext.tsx`**

Replace all three occurrences:
```ts
        const savedTenantId = localStorage.getItem("stockflow_current_tenant");
```
```ts
      localStorage.setItem("stockflow_current_tenant", tenant.id);
```
```ts
      localStorage.removeItem("stockflow_current_tenant");
```
with:
```ts
        const savedTenantId = localStorage.getItem("businessconnect_current_tenant");
```
```ts
      localStorage.setItem("businessconnect_current_tenant", tenant.id);
```
```ts
      localStorage.removeItem("businessconnect_current_tenant");
```

- [ ] **Step 18: Edit `ThemeContext.tsx`**

Replace both:
```ts
    const stored = localStorage.getItem('stockflow_theme') as Theme;
```
```ts
    localStorage.setItem('stockflow_theme', theme);
```
with:
```ts
    const stored = localStorage.getItem('businessconnect_theme') as Theme;
```
```ts
    localStorage.setItem('businessconnect_theme', theme);
```

- [ ] **Step 19: Run the frontend unit test suite**

Run: `cd frontend && npm run test:unit`
Expected: PASS, including `categoriesReplica.test.ts`, `productsReplica.test.ts`, `stockReplica.test.ts`, `deviceIdentity.test.ts`, `errorLogStore.test.ts`, `installMode.test.ts`, `productLock.test.ts`.

- [ ] **Step 20: Typecheck the frontend**

Run: `cd frontend && npm run check`
Expected: no TypeScript errors.

---

### Task 3: Frontend display text, i18n strings, and misc literals

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx`
- Modify: `frontend/src/components/DiagnosticsCard.tsx`
- Modify: `frontend/src/components/InstallModeGate.tsx`
- Modify: `frontend/src/lib/i18n/auth.ts`
- Modify: `frontend/src/lib/i18n/setup.ts`
- Modify: `frontend/src/lib/i18n/lan.ts`
- Modify: `frontend/src/lib/i18nCompleteness.test.ts`
- Modify: `frontend/src/pages/Login.tsx`
- Modify: `frontend/src/pages/InitialSetup.tsx`
- Modify: `frontend/src/lib/lanAgent.ts`

**Interfaces:**
- Consumes: none.
- Produces: i18n translation keys `welcomeToBusinessConnect`, `registerToBusinessConnect`, `configureBusinessConnect` (renamed from `welcomeToStockFlow`/`registerToStockFlow`/`configureStockFlow`) — consumed by `Login.tsx` and `InitialSetup.tsx` in the same task.

- [ ] **Step 1: Edit `Sidebar.tsx`**

Replace:
```tsx
              StockFlow
```
with:
```tsx
              Business Connect
```

- [ ] **Step 2: Edit `DiagnosticsCard.tsx`**

Replace:
```ts
  link.download = `stockflow-diagnostic-${new Date()
```
with:
```ts
  link.download = `business-connect-diagnostic-${new Date()
```

- [ ] **Step 3: Edit `InstallModeGate.tsx`**

Replace:
```ts
              // No STOCKFLOW_INITIAL_ADMIN_USERNAME/PASSWORD configured for
```
with:
```ts
              // No BUSINESSCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD configured for
```

- [ ] **Step 4: Edit `i18n/auth.ts`** — rename both keys and values, in both the `en` and `fr` dictionaries

Replace:
```ts
    welcomeToStockFlow: "Welcome to StockFlow",
```
with:
```ts
    welcomeToBusinessConnect: "Welcome to Business Connect",
```

Replace:
```ts
      "Sign in with an account managed by your central StockFlow server.",
```
with:
```ts
      "Sign in with an account managed by your central Business Connect server.",
```

Replace:
```ts
    registerToStockFlow: "Register to start using StockFlow",
```
with:
```ts
    registerToBusinessConnect: "Register to start using Business Connect",
```

Replace:
```ts
    welcomeToStockFlow: "Bienvenue sur StockFlow",
```
with:
```ts
    welcomeToBusinessConnect: "Bienvenue sur Business Connect",
```

Replace:
```ts
      "Se connecter avec un compte géré par votre serveur StockFlow central.",
```
with:
```ts
      "Se connecter avec un compte géré par votre serveur Business Connect central.",
```

Replace:
```ts
    registerToStockFlow: "Inscrivez-vous pour commencer à utiliser StockFlow",
```
with:
```ts
    registerToBusinessConnect: "Inscrivez-vous pour commencer à utiliser Business Connect",
```

- [ ] **Step 5: Edit `i18n/setup.ts`** — rename key and value in both dictionaries

Replace:
```ts
    configureStockFlow: "Configure StockFlow",
```
with:
```ts
    configureBusinessConnect: "Configure Business Connect",
```

Replace:
```ts
    configureStockFlow: "Configurer StockFlow",
```
with:
```ts
    configureBusinessConnect: "Configurer Business Connect",
```

- [ ] **Step 6: Edit `i18n/lan.ts`**

Replace:
```ts
      "LAN synchronization is available in the StockFlow desktop application.",
```
with:
```ts
      "LAN synchronization is available in the Business Connect desktop application.",
```

Replace:
```ts
      "La synchronisation LAN est disponible dans l'application de bureau StockFlow.",
```
with:
```ts
      "La synchronisation LAN est disponible dans l'application de bureau Business Connect.",
```

(Preserve whatever exact apostrophe character the file already uses — verify with a read before editing.)

- [ ] **Step 7: Edit `Login.tsx`**

Replace:
```tsx
            {t("welcomeToStockFlow")}
```
with:
```tsx
            {t("welcomeToBusinessConnect")}
```

- [ ] **Step 8: Edit `InitialSetup.tsx`**

Replace:
```tsx
                  {t("configureStockFlow")}
```
with:
```tsx
                  {t("configureBusinessConnect")}
```

- [ ] **Step 9: Edit `i18nCompleteness.test.ts`**

Replace:
```ts
    expect(translations.fr.configureStockFlow).toBe("Configurer StockFlow");
```
with:
```ts
    expect(translations.fr.configureBusinessConnect).toBe("Configurer Business Connect");
```

- [ ] **Step 10: Edit `lanAgent.ts`**

Replace all five occurrences of the string `"StockFlow LAN Agent is not available in this browser"` with `"Business Connect LAN Agent is not available in this browser"` (lines 55, 63, 106, 142, 162 — identical error message thrown from five different exported functions).

- [ ] **Step 11: Run the frontend unit test suite**

Run: `cd frontend && npm run test:unit`
Expected: PASS, including `i18nCompleteness.test.ts` (verifies every `en` key has a matching `fr` key and vice versa — a key-only rename in one language without the other would fail this).

- [ ] **Step 12: Typecheck the frontend**

Run: `cd frontend && npm run check`
Expected: no TypeScript errors (a stale `t("welcomeToStockFlow")` call after the key rename would surface here if the key type is derived from the dictionary).

---

### Task 4: Backend CouchDB naming and tenant-auth rename

**Files:**
- Modify: `backend/src/database/couchdb-naming.ts`
- Modify: `backend/src/database/couchdb-naming.spec.ts`
- Modify: `backend/src/database/couchdb.service.spec.ts`
- Modify: `backend/src/modules/auth/couch-proxy-auth.service.ts`
- Modify: `backend/src/modules/auth/couch-proxy-auth.service.spec.ts`
- Modify: `backend/src/modules/lan-identity/lan-identity.service.ts`
- Modify: `backend/src/modules/device-authorization/sealed-box.ts`
- Modify: `backend/src/modules/device-authorization/sealed-box.spec.ts`

**Interfaces:**
- Consumes: none.
- Produces: `identityDatabaseName()` returns `"businessconnect_identity"`, `tenantDatabaseName(tenantId)` returns `` `businessconnect_${tenantId}` `` — consumed by Task 5's repository specs (which assert against these same literal strings) and must land in the same overall change as Task 2's frontend `businessconnect_${tenantId}` naming, since both sides read/write the same CouchDB database names.
- The `business-connect-tenant-key-wrap-v1` string here **must match** Task 2 Step 9's frontend `sealedBox.ts` string exactly — same reasoning as noted in Task 2.

- [ ] **Step 1: Edit `couchdb-naming.ts`**

```ts
export const IDENTITY_DATABASE = "businessconnect_identity";

export function identityDatabaseName(): string {
  return IDENTITY_DATABASE;
}

export function tenantDatabaseName(tenantId: string): string {
  return `businessconnect_${tenantId}`;
}
```

(Only lines 1 and 8 change; `couchDocumentId`/`publicDocumentId` are untouched.)

- [ ] **Step 2: Edit `couchdb-naming.spec.ts`**

```ts
  it("uses one identity database and one unified database per tenant", () => {
    expect(identityDatabaseName()).toBe("businessconnect_identity");
    expect(tenantDatabaseName("tenant-1")).toBe("businessconnect_tenant-1");
  });
```

- [ ] **Step 3: Edit `couchdb.service.spec.ts`**

Replace both occurrences of:
```ts
    await service.ensureDesignDocument("stockflow_tenant-1", "stock", views);
```
with:
```ts
    await service.ensureDesignDocument("businessconnect_tenant-1", "stock", views);
```

- [ ] **Step 4: Edit `couch-proxy-auth.service.ts`**

Replace:
```ts
    const isOwnedByCaller = requestedDatabase === `stockflow_${user.tenantId}`;
```
with:
```ts
    const isOwnedByCaller = requestedDatabase === `businessconnect_${user.tenantId}`;
```

- [ ] **Step 5: Edit `couch-proxy-auth.service.spec.ts`**

Replace every occurrence of `stockflow_tenant-1` and `stockflow_tenant-2` (11 occurrences across the file, in URL strings like `/api/couch-proxy/stockflow_tenant-1/_all_docs`) with `businessconnect_tenant-1` / `businessconnect_tenant-2` respectively — the substring to replace is `stockflow_` → `businessconnect_`, applied to every match in the file.

- [ ] **Step 6: Edit `lan-identity.service.ts`**

Replace:
```ts
      .update(`stockflow-tenant:${tenantId}`)
```
with:
```ts
      .update(`business-connect-tenant:${tenantId}`)
```

- [ ] **Step 7: Edit `sealed-box.ts`**

Replace:
```ts
      info: new TextEncoder().encode("stockflow-tenant-key-wrap-v1"),
```
with:
```ts
      info: new TextEncoder().encode("business-connect-tenant-key-wrap-v1"),
```

- [ ] **Step 8: Edit `sealed-box.spec.ts`**

Replace:
```ts
      info: new TextEncoder().encode("stockflow-tenant-key-wrap-v1"),
```
with:
```ts
      info: new TextEncoder().encode("business-connect-tenant-key-wrap-v1"),
```

- [ ] **Step 9: Run the backend test suite for these modules**

Run: `cd backend && npx jest src/database/couchdb-naming.spec.ts src/database/couchdb.service.spec.ts src/modules/auth/couch-proxy-auth.service.spec.ts src/modules/device-authorization/sealed-box.spec.ts`
Expected: PASS.

---

### Task 5: Backend repository spec literal updates

**Files:**
- Modify: `backend/src/modules/audit/audit.repository.spec.ts`
- Modify: `backend/src/modules/categories/categories.repository.spec.ts`
- Modify: `backend/src/modules/customers/customers.repository.spec.ts`
- Modify: `backend/src/modules/device-authorization/device-authorization.repository.spec.ts`
- Modify: `backend/src/modules/device-authorization/tenant-data-key.repository.spec.ts`
- Modify: `backend/src/modules/identity/identity.repositories.spec.ts`
- Modify: `backend/src/modules/products/products.repository.spec.ts`
- Modify: `backend/src/modules/products/products-lock.service.spec.ts`
- Modify: `backend/src/modules/rayons/rayons.repository.spec.ts`
- Modify: `backend/src/modules/sales/sales.repository.spec.ts`
- Modify: `backend/src/modules/settings/settings.repository.spec.ts`
- Modify: `backend/src/modules/stock/stock.repository.spec.ts`
- Modify: `backend/src/modules/suppliers/suppliers.repository.spec.ts`
- Modify: `backend/src/modules/sync/sync.repository.spec.ts`

**Interfaces:**
- Consumes: the renamed `businessconnect_${tenantId}` / `businessconnect_identity` naming from Task 4 — these specs assert against the same literal database-name strings the production code in Task 4 now produces, so Task 4 must land first (or in the same pass) for these assertions to be meaningful.
- Produces: nothing new — this task only updates test literals to match Task 4's renamed output.

Every file in this task follows the same pattern: each has 1–4 occurrences of the literal substring `stockflow_tenant-1`, `stockflow_tenant-2`, or `stockflow_identity` inside a Jest `expect(...).toHaveBeenCalledWith(...)` assertion. Replace every `stockflow_` occurrence with `businessconnect_` in each file listed below. None of these files contain any other use of the substring `stockflow` (verified — each match is exclusively part of one of these three database-name literals), so a plain find/replace of `stockflow_` → `businessconnect_` is safe and complete for each file.

- [ ] **Step 1:** Edit `audit.repository.spec.ts` — replace `stockflow_tenant-1` (1 occurrence) with `businessconnect_tenant-1`.
- [ ] **Step 2:** Edit `categories.repository.spec.ts` — replace `stockflow_tenant-1` (3 occurrences) with `businessconnect_tenant-1`.
- [ ] **Step 3:** Edit `customers.repository.spec.ts` — replace `stockflow_tenant-1` (4 occurrences) with `businessconnect_tenant-1`.
- [ ] **Step 4:** Edit `device-authorization.repository.spec.ts` — replace `stockflow_identity` (1 occurrence) with `businessconnect_identity`.
- [ ] **Step 5:** Edit `tenant-data-key.repository.spec.ts` — replace `stockflow_identity` (1 occurrence) with `businessconnect_identity`.
- [ ] **Step 6:** Edit `identity.repositories.spec.ts` — replace `stockflow_identity` (2 occurrences, including one inside a test description string `"creates and reads tenants from stockflow_identity"`) with `businessconnect_identity`.
- [ ] **Step 7:** Edit `products.repository.spec.ts` — replace `stockflow_tenant-1` (4 occurrences) with `businessconnect_tenant-1`.
- [ ] **Step 8:** Edit `products-lock.service.spec.ts` — replace `stockflow_tenant-1` (1 occurrence) with `businessconnect_tenant-1`.
- [ ] **Step 9:** Edit `rayons.repository.spec.ts` — replace `stockflow_tenant-1` (1 occurrence) with `businessconnect_tenant-1`.
- [ ] **Step 10:** Edit `sales.repository.spec.ts` — replace `stockflow_tenant-1` (2 occurrences) with `businessconnect_tenant-1`.
- [ ] **Step 11:** Edit `settings.repository.spec.ts` — replace `stockflow_tenant-1` (1 occurrence) with `businessconnect_tenant-1`.
- [ ] **Step 12:** Edit `stock.repository.spec.ts` — replace `stockflow_tenant-1` (2 occurrences) with `businessconnect_tenant-1`.
- [ ] **Step 13:** Edit `suppliers.repository.spec.ts` — replace `stockflow_tenant-1` (1 occurrence) with `businessconnect_tenant-1`.
- [ ] **Step 14:** Edit `sync.repository.spec.ts` — replace `stockflow_tenant-1` (1 occurrence) with `businessconnect_tenant-1`.

- [ ] **Step 15: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS across all modules.

---

### Task 6: Package metadata rename

**Files:**
- Modify: `frontend/package.json`
- Modify: `backend/package.json`

**Interfaces:**
- Consumes: none. Produces: nothing consumed elsewhere in this plan (these are purely descriptive `name`/`description` fields, not imported by other code).

- [ ] **Step 1: Edit `frontend/package.json`**

Replace:
```json
  "name": "stockflow-client",
```
with:
```json
  "name": "business-connect-client",
```

- [ ] **Step 2: Edit `backend/package.json`**

Replace:
```json
  "name": "stockflow-nestjs",
```
with:
```json
  "name": "business-connect-nestjs",
```

Replace:
```json
  "description": "StockFlow - NestJS + Fastify Backend",
```
with:
```json
  "description": "Business Connect - NestJS + Fastify Backend",
```

- [ ] **Step 3: Verify both install cleanly**

Run: `cd frontend && npm install --package-lock-only` and `cd backend && npm install --package-lock-only`
Expected: both succeed and only the `name`/`description` fields in the respective `package-lock.json` root entries change (no dependency versions change).

---

### Task 7: Dev environment (Docker) rename

**Files:**
- Modify: `backend/docker-compose.yml`

**Interfaces:**
- Consumes: none. Produces: a differently-named local dev CouchDB container/credentials — since this is pre-production, any developer with an existing `stockflow-couchdb` container/volume from before this change should run `docker compose down` in `backend/` before pulling this change and `docker compose up -d` after, to start fresh under the new name (call this out to the user in the final summary — it's a local dev-environment note, not a migration).

- [ ] **Step 1: Edit `docker-compose.yml`**

```yaml
services:
  couchdb:
    image: couchdb:3.3
    container_name: business-connect-couchdb
    restart: unless-stopped
    ports:
      - "127.0.0.1:5984:5984"
    environment:
      COUCHDB_USER: businessconnect
      COUCHDB_PASSWORD: business-connect-dev-password
    volumes:
      - couchdb-data:/opt/couchdb/data

volumes:
  couchdb-data:
```

- [ ] **Step 2: Validate the compose file**

Run: `cd backend && docker compose config`
Expected: prints the resolved config with `container_name: business-connect-couchdb` and no YAML errors. (Do not `docker compose up` here — verifying it parses is enough; actually starting/stopping the dev database is the user's call.)

---

### Task 8: CI release workflow rename

**Files:**
- Modify: `.github/workflows/desktop-release.yml`

**Interfaces:**
- Consumes: none.

- [ ] **Step 1: Edit `desktop-release.yml`**

Replace:
```yaml
          releaseName: "StockFlow ${{ github.ref_name }}"
```
with:
```yaml
          releaseName: "Business Connect ${{ github.ref_name }}"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `cd "/Volumes/System 1/Sites/React/StockFlow" && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/desktop-release.yml'))"`
Expected: no error (confirms the YAML still parses after the edit; this doesn't run the workflow).

---

### Task 9: Living documentation rename

**Files:**
- Modify: `frontend/README.md`
- Modify: `backend/README.md`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: none. These are prose docs — no test coverage; verification is a manual read-through.

- [ ] **Step 1: Edit `frontend/README.md`**

Replace:
```md
# StockFlow Client

A modern React-based client application for StockFlow inventory management system. This client connects to the StockFlow NestJS backend for API operations.
```
with:
```md
# Business Connect Client

A modern React-based client application for the Business Connect inventory management system. This client connects to the Business Connect NestJS backend for API operations.
```

Read the rest of the file for any further "StockFlow" mentions beyond this header and replace each with "Business Connect", preserving surrounding sentence structure.

- [ ] **Step 2: Edit `backend/README.md`**

Replace:
```md
# StockFlow - NestJS Server

A modern, high-performance backend for StockFlow built with **NestJS** and **Fastify**.
```
with:
```md
# Business Connect - NestJS Server

A modern, high-performance backend for Business Connect built with **NestJS** and **Fastify**.
```

Read the rest of the file for any further "StockFlow" mentions and replace each with "Business Connect".

- [ ] **Step 3: Edit `DESIGN.md`**

Replace:
```md
name: StockFlow-design-tokens
description: "StockFlow's own dark-first glassmorphic system: a near-black canvas (#0A0B0D) layered with translucent charcoal glass panels (rgba(26, 29, 36, 0.6)), white text (#FFFFFF), and a single chromatic accent — StockFlow blue (#3B82F6) — used on the brand mark, primary CTAs, focus rings, active nav state, and chart highlights. The system reads as a dense operations console: glass cards with backdrop-blur, soft blue glows, and a subtle gradient background, rather than flat hairline panels. A first-class light theme exists (white canvas, slate-900 ink) toggled via a `.light` class. Display type runs Space Grotesk over an Inter body; JetBrains Mono covers code/barcode contexts. Semantic status colors (success green, warning amber, danger red) are reserved for stock alerts, badges, and chart series — never used decoratively."
```
with:
```md
name: BusinessConnect-design-tokens
description: "Business Connect's own dark-first glassmorphic system: a near-black canvas (#0A0B0D) layered with translucent charcoal glass panels (rgba(26, 29, 36, 0.6)), white text (#FFFFFF), and a single chromatic accent — Business Connect blue (#3B82F6) — used on the brand mark, primary CTAs, focus rings, active nav state, and chart highlights. The system reads as a dense operations console: glass cards with backdrop-blur, soft blue glows, and a subtle gradient background, rather than flat hairline panels. A first-class light theme exists (white canvas, slate-900 ink) toggled via a `.light` class. Display type runs Space Grotesk over an Inter body; JetBrains Mono covers code/barcode contexts. Semantic status colors (success green, warning amber, danger red) are reserved for stock alerts, badges, and chart series — never used decoratively."
```

Read the rest of `DESIGN.md` (color tokens, component notes) for any further prose mentions of "StockFlow" and replace with "Business Connect" — do not change any hex/rgba color values, only prose text.

- [ ] **Step 4: Read all three files back and confirm no stray "StockFlow" remains**

Run: `grep -in "stockflow" frontend/README.md backend/README.md DESIGN.md`
Expected: no output (empty match).

---

### Task 10: Final full-repo verification sweep

**Files:** none modified — this task only verifies.

**Interfaces:** Consumes the completed state of Tasks 1–9.

- [ ] **Step 1: Confirm no stray "stockflow" remains outside the explicitly excluded historical docs**

Run:
```bash
cd "/Volumes/System 1/Sites/React/StockFlow" && grep -ril "stockflow" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=target \
  --exclude-dir=gen . \
  | grep -v "^./docs/superpowers/plans/" \
  | grep -v "^./docs/superpowers/specs/" \
  | grep -v "^./docs/research/" \
  | grep -v "^./docs/BRAINSTORMING_FONCTIONNEMENT_ACTUEL_ET_SYNC_LAN.md" \
  | grep -v "^./docs/TEST_SIMULATEUR_LAN.md" \
  | grep -v "^./frontend/docs/" \
  | grep -v "^./backend/docs/" \
  | grep -v "^./CRUD_AUDIT_REPORT.md" \
  | grep -v "^./plans/crud-remediation/" \
  | grep -v "Cargo.lock" \
  | grep -v ".impeccable/hook.cache.json" \
  | grep -v "^./docs/superpowers/plans/2026-08-24-rename-to-business-connect.md"
```
Expected: no output. If anything appears, it's a file this plan missed — go back and add a task/step for it before proceeding (do not silently skip it).

- [ ] **Step 2: Run the full frontend test suite and typecheck**

Run: `cd frontend && npm run check && npm run test:unit`
Expected: PASS.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS.

- [ ] **Step 4: Run the full Rust test suite**

Run: `cd frontend/src-tauri && cargo test`
Expected: PASS.

- [ ] **Step 5: Report the out-of-scope manual follow-ups to the user**

Summarize for the user (no action needed from the executor beyond stating it): the repository directory (`StockFlow/`) and the GitHub remote/repo name were left untouched per Global Constraints — renaming either is the user's call and independent of this code change.

---

## Self-Review Notes

- **Spec coverage:** every `grep -ril stockflow` hit found during research across `frontend/src`, `frontend/src-tauri/src`, `backend/src`, `tauri.conf.json`+variants, `capabilities/default.json`, both `package.json`s, `docker-compose.yml`, and the release workflow is covered by Tasks 1–8. Living docs (Task 9) and the verification sweep (Task 10) close the loop.
- **Cross-task dependency called out explicitly:** the `business-connect-tenant-key-wrap-v1` HKDF string must match between Task 2 (frontend `sealedBox.ts`) and Task 4 (backend `sealed-box.ts`) — both are in this plan and will land together, so this is safe, but it's flagged in both tasks' Interfaces sections so a reviewer approving one without the other would notice the coupling.
- **Type/name consistency:** i18n key renames (`welcomeToStockFlow`→`welcomeToBusinessConnect` etc.) are defined and consumed within the same Task 3, and the `i18nCompleteness.test.ts` update is in the same task so key-parity checking still passes.
- **No placeholders:** every step above names an exact file and exact old/new literal text; none defer detail to "later" or reference unlisted types.
