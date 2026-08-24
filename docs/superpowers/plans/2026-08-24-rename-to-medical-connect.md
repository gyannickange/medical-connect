# Rename to Medical Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from "Business Connect" to "Medical Connect" everywhere the name appears — user-visible text, package/crate/bundle metadata, and every internal technical identifier (database name prefixes, localStorage/keyring keys, crypto context strings, mDNS service type, env var prefix, Docker service names, CI release name) — so the app can be marketed as the hospital/pharmacy-oriented edition of the product (in-hospital and out-of-hospital pharmacies alike) without any leftover "Business Connect" branding. This plan also closes out one leftover from the *original* rename (StockFlow → Business Connect): `backend/scripts/seed-database.ts` still has two literal `"StockFlow"` strings that were never updated — those go straight to "Medical Connect" (Task 11), following the same living-code-vs-historical-docs rule used throughout this plan. This is a pure rename: no data-migration path, because no real tenant data exists in the field yet.

**Architecture:** Pure mechanical rename, not a feature change — the actual hospital-pharmacy feature work referenced in the request is a separate, later effort and is out of scope for this plan. No new behavior is introduced; every changed string is either display text or an internal identifier whose *value* changes but whose *role* stays identical. Each task edits a cohesive group of files and then runs that subsystem's existing test suite to confirm nothing broke. There is no new test-writing (TDD doesn't apply — we're not adding behavior), but every task ends by running the tests that already cover the changed code and confirming they still pass with the new literal values.

**Tech Stack:** TypeScript/React (frontend), NestJS (backend), Rust/Tauri (desktop shell), Vitest (frontend unit tests), Playwright (frontend E2E), Jest (backend tests), Cargo test (Rust tests).

**Spec:** No separate spec document — this is a straight repeat of the mechanical rename already executed once in this codebase (StockFlow → Business Connect, see `docs/superpowers/plans/2026-08-24-rename-to-business-connect.md`, which this plan mirrors task-for-task with an updated naming table). Scope was confirmed with the user via the same reasoning as that prior rename: this is a rename, not new functionality, so brainstorming/spec-writing was skipped.

## Global Constraints

- **This working directory is not currently a git repository** (`git status` → `fatal: not a git repository`). Do not run any `git` commands as part of this plan. The final "ask the user how to commit" step from the prior rename plan does not apply here — instead, flag to the user at the end that there is no git history to commit into, in case that's unexpected.
- **Confirmed by the same reasoning as the prior rename:** the app is pre-production — no real desktop installs or tenant data exist yet — so this rename does **not** need a data-migration path. Internal identifiers (DB names, Tauri bundle id, storage keys, crypto context strings) can change directly.
- **Naming convention — apply mechanically, do not improvise per-file:**
  | Old form | New form | Where it appears |
  |---|---|---|
  | `Business Connect` (display/prose, space-separated) | `Medical Connect` | UI text, i18n strings, log/`eprintln!` messages, window titles, doc prose, code comments |
  | `businessconnect` immediately followed by `_`, end-of-string, or `:` (squashed/underscore identifier) | `medicalconnect` | DB name prefixes, localStorage keys, Rust `snake_case` lib name, standalone bare-word identifiers (e.g. `COUCHDB_USER` value, the `[businessconnect]` log tag) |
  | `business-connect` (hyphenated identifier) | `medical-connect` | npm/cargo package names, Docker container/password, keyring service names, HKDF/crypto context strings, download-filename prefix |
  | `BUSINESSCONNECT` (screaming-snake prefix) | `MEDICALCONNECT` | env var prefix (`BUSINESSCONNECT_INITIAL_ADMIN_*` → `MEDICALCONNECT_INITIAL_ADMIN_*`) |
  | `BusinessConnect` (PascalCase, no space) | `MedicalConnect` | `DESIGN.md` design-token name |
  | `com.businessconnect.desktop` (Tauri identifier) | `com.medicalconnect.desktop` | Tauri bundle identifier (+ `.caisse1`/`.caisse2` variants) |
- **Explicitly out of scope for this plan** (do not touch):
  - The repository directory name — it has already been renamed to `medical-connect` outside of this plan (confirmed: the working directory is already `.../medical-connect`). No filesystem rename task is needed this time.
  - The GitHub remote/repo name — hosting-level change outside a code plan; call this out to the user as an optional manual follow-up, same as last time (and moot until the directory is a git repo again).
  - Historical, dated documents that record a point in time: everything under `docs/superpowers/plans/*`, `docs/superpowers/specs/*`, `docs/research/*`, `docs/BRAINSTORMING_FONCTIONNEMENT_ACTUEL_ET_SYNC_LAN.md`, `docs/TEST_SIMULATEUR_LAN.md`, `frontend/docs/*`, `backend/docs/*`, `CRUD_AUDIT_REPORT.md`, `plans/crud-remediation/*`. These are historical records of work done under earlier names — rewriting them would misrepresent history. Only *living* reference docs are renamed (Task 10).
  - `frontend/src-tauri/gen/schemas/*.json` and `frontend/src-tauri/Cargo.lock` — both are build-generated artifacts that regenerate automatically (`cargo check`/`tauri build`); hand-editing them is pointless and they're re-derived in Task 1.
  - `.impeccable/hook.cache.json` (both root and `frontend/`) — a generated cache file, not hand-maintained.
- **New feature scope (hospital/out-of-hospital pharmacy support) is NOT part of this plan.** The user's stated motivation for the rename is to position the product for hospital and non-hospital pharmacies, but no new functionality is requested yet — that should be scoped as its own brainstorming/plan once this rename lands.
- Per project CLAUDE.md: **skip per-task commits.** Implement and verify all tasks with changes left uncommitted; there is no git repository here to commit into regardless (see Global Constraint above). No task below has a "Commit" step.
- Never run `git commit`/`git push` without the user's explicit go-ahead (moot here until a repo exists, but stated for completeness).

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
- Consumes: none from other tasks.
- Produces: Tauri identifier `com.medicalconnect.desktop` (+ `.caisse1`/`.caisse2`), env vars `MEDICALCONNECT_INITIAL_ADMIN_USERNAME`/`MEDICALCONNECT_INITIAL_ADMIN_PASSWORD`, mDNS service type `_medicalconnect._tcp.local.`, keyring service names `medical-connect-device-master-key` and `medical-connect-lan-identity-key`. No other task depends on Rust internals directly.

- [ ] **Step 1: Edit `Cargo.toml`**

Replace:
```toml
name = "business-connect-desktop"
version = "0.1.0"
description = "Business Connect desktop shell and local LAN agent"
authors = ["Business Connect"]
edition = "2021"

[lib]
name = "businessconnect_desktop_lib"
```
with:
```toml
name = "medical-connect-desktop"
version = "0.1.0"
description = "Medical Connect desktop shell and local LAN agent"
authors = ["Medical Connect"]
edition = "2021"

[lib]
name = "medicalconnect_desktop_lib"
```
(Only `name`, `description`, `authors`, and `[lib] name` change — leave `version`, `edition`, and every dependency line untouched.)

- [ ] **Step 2: Edit `src/main.rs`**

Replace:
```rust
fn main() {
    businessconnect_desktop_lib::run();
}
```
with:
```rust
fn main() {
    medicalconnect_desktop_lib::run();
}
```

- [ ] **Step 3: Edit `src/lib.rs`**

Replace:
```rust
        "com.businessconnect.desktop.caisse1" => Some([
```
with:
```rust
        "com.medicalconnect.desktop.caisse1" => Some([
```

Replace:
```rust
        "com.businessconnect.desktop.caisse2" => Some([
```
with:
```rust
        "com.medicalconnect.desktop.caisse2" => Some([
```

Replace:
```rust
        .expect("error while running Business Connect desktop");
```
with:
```rust
        .expect("error while running Medical Connect desktop");
```

- [ ] **Step 4: Edit `src/device_key.rs`**

Replace:
```rust
const SERVICE_NAME: &str = "business-connect-device-master-key";
```
with:
```rust
const SERVICE_NAME: &str = "medical-connect-device-master-key";
```

- [ ] **Step 5: Edit `src/lan_agent.rs`**

Replace:
```rust
const LAN_IDENTITY_KEY_SERVICE: &str = "business-connect-lan-identity-key";
```
with:
```rust
const LAN_IDENTITY_KEY_SERVICE: &str = "medical-connect-lan-identity-key";
```

Replace:
```rust
const SERVICE_TYPE: &str = "_businessconnect._tcp.local.";
```
with:
```rust
const SERVICE_TYPE: &str = "_medicalconnect._tcp.local.";
```

Replace:
```rust
    eprintln!("[Business Connect LAN] agent started: {device_id}");
```
with:
```rust
    eprintln!("[Medical Connect LAN] agent started: {device_id}");
```

Replace:
```rust
fn effective_device_id(app_identifier: &str, requested_device_id: &str) -> String {
    app_identifier
        .strip_prefix("com.businessconnect.desktop.")
```
with:
```rust
fn effective_device_id(app_identifier: &str, requested_device_id: &str) -> String {
    app_identifier
        .strip_prefix("com.medicalconnect.desktop.")
```

Replace:
```rust
fn effective_agent_port(app_identifier: &str) -> u16 {
    app_identifier
        .strip_prefix("com.businessconnect.desktop.caisse")
```
with:
```rust
fn effective_agent_port(app_identifier: &str) -> u16 {
    app_identifier
        .strip_prefix("com.medicalconnect.desktop.caisse")
```

Replace:
```rust
                        eprintln!(
                            "[Business Connect LAN] same-tenant peer discovered: {}",
                            peer.device_id
                        );
```
with:
```rust
                        eprintln!(
                            "[Medical Connect LAN] same-tenant peer discovered: {}",
                            peer.device_id
                        );
```

In the `#[cfg(test)]` module, replace the two `effective_device_id`/`effective_agent_port` test bodies:
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
with:
```rust
    #[test]
    fn simulator_profiles_have_distinct_native_device_ids() {
        assert_eq!(
            effective_device_id("com.medicalconnect.desktop.caisse1", "browser-device"),
            "device-sim-caisse1"
        );
        assert_eq!(
            effective_device_id("com.medicalconnect.desktop.caisse2", "browser-device"),
            "device-sim-caisse2"
        );
        assert_eq!(
            effective_device_id("com.medicalconnect.desktop", "browser-device"),
            "browser-device"
        );
    }

    #[test]
    fn simulator_profiles_have_distinct_agent_ports() {
        assert_eq!(
            effective_agent_port("com.medicalconnect.desktop.caisse1"),
            DEFAULT_AGENT_PORT + 1
        );
        assert_eq!(
            effective_agent_port("com.medicalconnect.desktop.caisse2"),
            DEFAULT_AGENT_PORT + 2
        );
        assert_eq!(
            effective_agent_port("com.medicalconnect.desktop"),
            DEFAULT_AGENT_PORT
        );
    }
```

And the peer-reconciliation test's two `"peer._businessconnect._tcp.local."` occurrences:
```rust
        let mut peers = HashMap::from([(
            "peer._businessconnect._tcp.local.".into(),
            LanPeer {
                device_id: "peer".into(),
                service_name: "peer._businessconnect._tcp.local.".into(),
```
with:
```rust
        let mut peers = HashMap::from([(
            "peer._medicalconnect._tcp.local.".into(),
            LanPeer {
                device_id: "peer".into(),
                service_name: "peer._medicalconnect._tcp.local.".into(),
```

- [ ] **Step 6: Edit `src/local_admin.rs`** (all occurrences)

Replace every `BUSINESSCONNECT_INITIAL_ADMIN_USERNAME` with `MEDICALCONNECT_INITIAL_ADMIN_USERNAME`, and every `BUSINESSCONNECT_INITIAL_ADMIN_PASSWORD` with `MEDICALCONNECT_INITIAL_ADMIN_PASSWORD` (13 occurrences total: the two `env::var` reads on lines 12–13, the log format string on line 24 — which also contains the `[businessconnect]` tag — and 10 more across the three `#[test]` functions' `set_env`/`remove_var` calls on lines 56, 58, 74, 75, 81, 82, 94, 95, 101, 102).

Also replace, on line 24:
```rust
                "[businessconnect] BUSINESSCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD not set - using a one-time dev admin: admin / {generated}"
```
with (after the env var rename above already applied):
```rust
                "[medicalconnect] MEDICALCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD not set - using a one-time dev admin: admin / {generated}"
```

- [ ] **Step 7: Edit `tauri.conf.json`**

Replace:
```json
  "productName": "Business Connect",
  "version": "0.1.1",
  "identifier": "com.businessconnect.desktop",
```
with:
```json
  "productName": "Medical Connect",
  "version": "0.1.1",
  "identifier": "com.medicalconnect.desktop",
```

Replace:
```json
        "title": "Business Connect",
```
with:
```json
        "title": "Medical Connect",
```
(Only these four values change — `$schema`, `version`, `build`, `security`, and `bundle` blocks stay exactly as they are.)

- [ ] **Step 8: Edit `tauri.caisse1.conf.json`**

Replace `"productName": "Business Connect Caisse 1"` → `"productName": "Medical Connect Caisse 1"`.
Replace `"identifier": "com.businessconnect.desktop.caisse1"` → `"identifier": "com.medicalconnect.desktop.caisse1"`.
Replace `"title": "Business Connect — Caisse 1"` → `"title": "Medical Connect — Caisse 1"`.

- [ ] **Step 9: Edit `tauri.caisse2.conf.json`**

Replace `"productName": "Business Connect Caisse 2"` → `"productName": "Medical Connect Caisse 2"`.
Replace `"identifier": "com.businessconnect.desktop.caisse2"` → `"identifier": "com.medicalconnect.desktop.caisse2"`.
Replace `"title": "Business Connect — Caisse 2"` → `"title": "Medical Connect — Caisse 2"`.

- [ ] **Step 10: Edit `capabilities/default.json`**

Replace:
```json
  "description": "Minimal permissions for the Business Connect desktop window",
```
with:
```json
  "description": "Minimal permissions for the Medical Connect desktop window",
```

- [ ] **Step 11: Regenerate `Cargo.lock` and the Tauri-generated schema**

Run: `cd frontend/src-tauri && cargo check`
Expected: succeeds, and rewrites the `business-connect-desktop`/`businessconnect_desktop_lib` entries in `Cargo.lock` to the new names. `gen/schemas/capabilities.json` regenerates the next time `tauri dev`/`tauri build` runs — no separate manual step needed now, but do not hand-edit it if you notice it's stale.

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
- Modify: `frontend/src/hooks/useOfflineSync.ts`
- Modify: `frontend/src/hooks/usePeerSync.ts`

**Interfaces:**
- Consumes: none from other tasks.
- Produces: PouchDB database names `medicalconnect_${tenantId}`, `medicalconnect_local_accounts`, `medicalconnect_cache`; localStorage keys `medicalconnect_local_session`, `medicalconnect_current_tenant`, `medicalconnect_theme`, `medicalconnect_language`, `medicalconnect_device_id`, `medicalconnect_device_name`, `medicalconnect_error_logs`, `medicalconnect_install_mode`; HKDF context strings `medical-connect-local-data-key-v1`, `medical-connect-session-signing-key-v1`, `medical-connect-tenant-key-wrap-v1`; event name `medicalconnect:offline-mutation-saved`. Consumed by Task 4 (backend must derive/read the same `medicalconnect_${tenantId}` database names and the same `medical-connect-tenant-key-wrap-v1` HKDF string — both sides must land together) and by Task 9 (Playwright tests assert the same localStorage key literals).

- [ ] **Step 1: Edit `pouchdb.ts`**

Replace:
```ts
      // Get tenant ID from dbName (format: businessconnect_<tenantId>)
      const tenantId = dbName.replace("businessconnect_", "");
```
with:
```ts
      // Get tenant ID from dbName (format: medicalconnect_<tenantId>)
      const tenantId = dbName.replace("medicalconnect_", "");
```

- [ ] **Step 2: Edit `categoriesReplica.ts` and its test**

In `categoriesReplica.ts`, replace:
```ts
  return `businessconnect_${tenantId}`;
```
with:
```ts
  return `medicalconnect_${tenantId}`;
```

In `categoriesReplica.test.ts`, replace all four occurrences of `businessconnect_tenant-1` (lines 16, 23, 45, 47) with `medicalconnect_tenant-1`, e.g.:
```ts
    expect(categoriesReplicaDatabaseName("tenant-1")).toBe("businessconnect_tenant-1");
```
→
```ts
    expect(categoriesReplicaDatabaseName("tenant-1")).toBe("medicalconnect_tenant-1");
```
and likewise for the `"/api/couch-proxy/businessconnect_tenant-1"` and `createPouchDB` assertions on the other lines.

- [ ] **Step 3: Edit `productsReplica.ts` and its test**

In `productsReplica.ts`, replace:
```ts
  return `businessconnect_${tenantId}`;
```
with:
```ts
  return `medicalconnect_${tenantId}`;
```

In `productsReplica.test.ts`, replace every `businessconnect_tenant-1` (lines 97, 104, 126, 128) with `medicalconnect_tenant-1`, and `businessconnect_local` on line 223 with `medicalconnect_local`.

- [ ] **Step 4: Edit `stockReplica.ts` and its test**

In `stockReplica.ts`, replace:
```ts
  return `businessconnect_${tenantId}`;
```
with:
```ts
  return `medicalconnect_${tenantId}`;
```

In `stockReplica.test.ts`, replace every `businessconnect_tenant-1` (lines 16, 23, 45, 47) with `medicalconnect_tenant-1`.

- [ ] **Step 5: Edit `encryptedPouchDB.ts`**

Replace:
```ts
  name: "businessconnect_local_accounts" | "businessconnect_cache"
```
with:
```ts
  name: "medicalconnect_local_accounts" | "medicalconnect_cache"
```

- [ ] **Step 6: Edit `offlineCache.ts`**

Replace:
```ts
    cacheDb = await createEncryptedLocalPouchDB("businessconnect_cache");
```
with:
```ts
    cacheDb = await createEncryptedLocalPouchDB("medicalconnect_cache");
```

- [ ] **Step 7: Edit `localAccountsStore.ts`**

Replace:
```ts
export const LOCAL_ACCOUNTS_DB_NAME = "businessconnect_local_accounts";
```
with:
```ts
export const LOCAL_ACCOUNTS_DB_NAME = "medicalconnect_local_accounts";
```

- [ ] **Step 8: Edit `deviceMasterKey.ts`**

Replace:
```ts
const LOCAL_DB_NAMES = ["businessconnect_local_accounts", "businessconnect_cache"] as const;
```
with:
```ts
const LOCAL_DB_NAMES = ["medicalconnect_local_accounts", "medicalconnect_cache"] as const;
```

Replace:
```ts
      "business-connect-local-data-key-v1",
```
with:
```ts
      "medical-connect-local-data-key-v1",
```

Replace:
```ts
      "business-connect-session-signing-key-v1",
```
with:
```ts
      "medical-connect-session-signing-key-v1",
```

- [ ] **Step 9: Edit `sealedBox.ts`**

Replace:
```ts
      info: new TextEncoder().encode("business-connect-tenant-key-wrap-v1"),
```
with:
```ts
      info: new TextEncoder().encode("medical-connect-tenant-key-wrap-v1"),
```

- [ ] **Step 10: Edit `deviceIdentity.ts` and its test**

In `deviceIdentity.ts`, replace:
```ts
const DEVICE_ID_STORAGE_KEY = "businessconnect_device_id";
```
with:
```ts
const DEVICE_ID_STORAGE_KEY = "medicalconnect_device_id";
```
and:
```ts
const DEVICE_NAME_STORAGE_KEY = "businessconnect_device_name";
```
with:
```ts
const DEVICE_NAME_STORAGE_KEY = "medicalconnect_device_name";
```

In `deviceIdentity.test.ts`, replace:
```ts
    store.set("businessconnect_device_id", "device-fixed");
    store.set("businessconnect_device_name", "Caisse Accueil");
```
with:
```ts
    store.set("medicalconnect_device_id", "device-fixed");
    store.set("medicalconnect_device_name", "Caisse Accueil");
```

- [ ] **Step 11: Edit `errorLogStore.ts` and its test**

In `errorLogStore.ts`, replace:
```ts
const STORAGE_KEY = "businessconnect_error_logs";
```
with:
```ts
const STORAGE_KEY = "medicalconnect_error_logs";
```

In `errorLogStore.test.ts`, replace:
```ts
        if (key === "businessconnect_error_logs") {
```
with:
```ts
        if (key === "medicalconnect_error_logs") {
```

- [ ] **Step 12: Edit `installMode.ts` and its test**

In `installMode.ts`, replace:
```ts
const INSTALL_MODE_KEY = "businessconnect_install_mode";
```
with:
```ts
const INSTALL_MODE_KEY = "medicalconnect_install_mode";
```

In `installMode.test.ts`, replace:
```ts
    store.set("businessconnect_install_mode", "garbage");
```
with:
```ts
    store.set("medicalconnect_install_mode", "garbage");
```

- [ ] **Step 13: Edit `offlineApiRequest.ts`**

Replace:
```ts
export const OFFLINE_MUTATION_SAVED_EVENT = "businessconnect:offline-mutation-saved";
```
with:
```ts
export const OFFLINE_MUTATION_SAVED_EVENT = "medicalconnect:offline-mutation-saved";
```

- [ ] **Step 14: Edit `i18n/index.ts`**

Replace both:
```ts
  localStorage.setItem("businessconnect_language", lang);
```
```ts
  const stored = localStorage.getItem("businessconnect_language") as Language;
```
with:
```ts
  localStorage.setItem("medicalconnect_language", lang);
```
```ts
  const stored = localStorage.getItem("medicalconnect_language") as Language;
```

- [ ] **Step 15: Edit `productLock.test.ts`**

Replace:
```ts
    expect(createPouchDB).toHaveBeenCalledWith("businessconnect_tenant-1");
```
with:
```ts
    expect(createPouchDB).toHaveBeenCalledWith("medicalconnect_tenant-1");
```

Replace:
```ts
    serviceName: "businessconnect",
```
with:
```ts
    serviceName: "medicalconnect",
```

- [ ] **Step 16: Edit `AuthContext.tsx`**

Replace:
```ts
const LOCAL_SESSION_KEY = "businessconnect_local_session";
```
with:
```ts
const LOCAL_SESSION_KEY = "medicalconnect_local_session";
```

- [ ] **Step 17: Edit `TenantContext.tsx`**

Replace all three occurrences:
```ts
        const savedTenantId = localStorage.getItem("businessconnect_current_tenant");
```
```ts
      localStorage.setItem("businessconnect_current_tenant", tenant.id);
```
```ts
      localStorage.removeItem("businessconnect_current_tenant");
```
with:
```ts
        const savedTenantId = localStorage.getItem("medicalconnect_current_tenant");
```
```ts
      localStorage.setItem("medicalconnect_current_tenant", tenant.id);
```
```ts
      localStorage.removeItem("medicalconnect_current_tenant");
```

- [ ] **Step 18: Edit `ThemeContext.tsx`**

Replace both:
```ts
    const stored = localStorage.getItem('businessconnect_theme') as Theme;
```
```ts
    localStorage.setItem('businessconnect_theme', theme);
```
with:
```ts
    const stored = localStorage.getItem('medicalconnect_theme') as Theme;
```
```ts
    localStorage.setItem('medicalconnect_theme', theme);
```

- [ ] **Step 19: Edit `useOfflineSync.ts`**

Replace:
```ts
  } = usePouchDB(`businessconnect_${currentTenant?.id || "default"}`);
```
with:
```ts
  } = usePouchDB(`medicalconnect_${currentTenant?.id || "default"}`);
```

- [ ] **Step 20: Edit `usePeerSync.ts`**

Replace:
```ts
  } = usePouchDB(`businessconnect_${currentTenant?.id || "default"}`);
```
with:
```ts
  } = usePouchDB(`medicalconnect_${currentTenant?.id || "default"}`);
```

- [ ] **Step 21: Run the frontend unit test suite**

Run: `cd frontend && npm run test:unit`
Expected: PASS, including `categoriesReplica.test.ts`, `productsReplica.test.ts`, `stockReplica.test.ts`, `deviceIdentity.test.ts`, `errorLogStore.test.ts`, `installMode.test.ts`, `productLock.test.ts`.

- [ ] **Step 22: Typecheck the frontend**

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
- Produces: i18n translation keys `welcomeToMedicalConnect`, `registerToMedicalConnect`, `configureMedicalConnect` (renamed from `welcomeToBusinessConnect`/`registerToBusinessConnect`/`configureBusinessConnect`) — consumed by `Login.tsx` and `InitialSetup.tsx` in this same task, and by Task 9's Playwright assertion against the rendered French button text.

- [ ] **Step 1: Edit `Sidebar.tsx`**

Replace:
```tsx
              Business Connect
```
with:
```tsx
              Medical Connect
```

- [ ] **Step 2: Edit `DiagnosticsCard.tsx`**

Replace:
```ts
  link.download = `business-connect-diagnostic-${new Date()
```
with:
```ts
  link.download = `medical-connect-diagnostic-${new Date()
```

- [ ] **Step 3: Edit `InstallModeGate.tsx`**

Replace:
```ts
              // No BUSINESSCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD configured for
```
with:
```ts
              // No MEDICALCONNECT_INITIAL_ADMIN_USERNAME/PASSWORD configured for
```

- [ ] **Step 4: Edit `i18n/auth.ts`** — rename both keys and values, in both the `en` and `fr` dictionaries

Replace:
```ts
    welcomeToBusinessConnect: "Welcome to Business Connect",
```
with:
```ts
    welcomeToMedicalConnect: "Welcome to Medical Connect",
```

Replace:
```ts
      "Sign in with an account managed by your central Business Connect server.",
```
with:
```ts
      "Sign in with an account managed by your central Medical Connect server.",
```

Replace:
```ts
    registerToBusinessConnect: "Register to start using Business Connect",
```
with:
```ts
    registerToMedicalConnect: "Register to start using Medical Connect",
```

Replace:
```ts
    welcomeToBusinessConnect: "Bienvenue sur Business Connect",
```
with:
```ts
    welcomeToMedicalConnect: "Bienvenue sur Medical Connect",
```

Replace:
```ts
      "Se connecter avec un compte géré par votre serveur Business Connect central.",
```
with:
```ts
      "Se connecter avec un compte géré par votre serveur Medical Connect central.",
```

Replace:
```ts
    registerToBusinessConnect: "Inscrivez-vous pour commencer à utiliser Business Connect",
```
with:
```ts
    registerToMedicalConnect: "Inscrivez-vous pour commencer à utiliser Medical Connect",
```

- [ ] **Step 5: Edit `i18n/setup.ts`** — rename key and value in both dictionaries

Replace:
```ts
    configureBusinessConnect: "Configure Business Connect",
```
with:
```ts
    configureMedicalConnect: "Configure Medical Connect",
```

Replace:
```ts
    configureBusinessConnect: "Configurer Business Connect",
```
with:
```ts
    configureMedicalConnect: "Configurer Medical Connect",
```

- [ ] **Step 6: Edit `i18n/lan.ts`**

Replace:
```ts
      "LAN synchronization is available in the Business Connect desktop application.",
```
with:
```ts
      "LAN synchronization is available in the Medical Connect desktop application.",
```

Replace (this line uses a curly apostrophe `’`, not a straight one — preserve it exactly):
```ts
      "La synchronisation LAN est disponible dans l’application de bureau Business Connect.",
```
with:
```ts
      "La synchronisation LAN est disponible dans l’application de bureau Medical Connect.",
```

- [ ] **Step 7: Edit `Login.tsx`**

Replace:
```tsx
            {t("welcomeToBusinessConnect")}
```
with:
```tsx
            {t("welcomeToMedicalConnect")}
```

- [ ] **Step 8: Edit `InitialSetup.tsx`**

Replace:
```tsx
                  {t("configureBusinessConnect")}
```
with:
```tsx
                  {t("configureMedicalConnect")}
```

- [ ] **Step 9: Edit `i18nCompleteness.test.ts`**

Replace:
```ts
    expect(translations.fr.configureBusinessConnect).toBe("Configurer Business Connect");
```
with:
```ts
    expect(translations.fr.configureMedicalConnect).toBe("Configurer Medical Connect");
```

- [ ] **Step 10: Edit `lanAgent.ts`**

Replace all five occurrences of the string `"Business Connect LAN Agent is not available in this browser"` with `"Medical Connect LAN Agent is not available in this browser"` (lines 55, 63, 106, 142, 162 — identical error message thrown from five different exported functions).

- [ ] **Step 11: Run the frontend unit test suite**

Run: `cd frontend && npm run test:unit`
Expected: PASS, including `i18nCompleteness.test.ts` (verifies every `en` key has a matching `fr` key and vice versa — a key-only rename in one language without the other would fail this).

- [ ] **Step 12: Typecheck the frontend**

Run: `cd frontend && npm run check`
Expected: no TypeScript errors (a stale `t("welcomeToBusinessConnect")` call after the key rename would surface here if the key type is derived from the dictionary).

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
- Produces: `identityDatabaseName()` returns `"medicalconnect_identity"`, `tenantDatabaseName(tenantId)` returns `` `medicalconnect_${tenantId}` `` — consumed by Task 5's repository specs (which assert against these same literal strings) and must land in the same overall change as Task 2's frontend `medicalconnect_${tenantId}` naming, since both sides read/write the same CouchDB database names.
- The `medical-connect-tenant-key-wrap-v1` string here **must match** Task 2 Step 9's frontend `sealedBox.ts` string exactly — both sides derive the same HKDF wrap key from this literal.

- [ ] **Step 1: Edit `couchdb-naming.ts`**

Replace:
```ts
export const IDENTITY_DATABASE = "businessconnect_identity";
```
with:
```ts
export const IDENTITY_DATABASE = "medicalconnect_identity";
```

Replace:
```ts
  return `businessconnect_${tenantId}`;
```
with:
```ts
  return `medicalconnect_${tenantId}`;
```
(Only these two lines change; `couchDocumentId`/`publicDocumentId` are untouched.)

- [ ] **Step 2: Edit `couchdb-naming.spec.ts`**

Replace:
```ts
    expect(identityDatabaseName()).toBe("businessconnect_identity");
    expect(tenantDatabaseName("tenant-1")).toBe("businessconnect_tenant-1");
```
with:
```ts
    expect(identityDatabaseName()).toBe("medicalconnect_identity");
    expect(tenantDatabaseName("tenant-1")).toBe("medicalconnect_tenant-1");
```

- [ ] **Step 3: Edit `couchdb.service.spec.ts`**

Replace both occurrences of:
```ts
    await service.ensureDesignDocument("businessconnect_tenant-1", "stock", views);
```
with:
```ts
    await service.ensureDesignDocument("medicalconnect_tenant-1", "stock", views);
```

- [ ] **Step 4: Edit `couch-proxy-auth.service.ts`**

Replace:
```ts
    const isOwnedByCaller = requestedDatabase === `businessconnect_${user.tenantId}`;
```
with:
```ts
    const isOwnedByCaller = requestedDatabase === `medicalconnect_${user.tenantId}`;
```

- [ ] **Step 5: Edit `couch-proxy-auth.service.spec.ts`**

Replace every occurrence of `businessconnect_tenant-1` and `businessconnect_tenant-2` (11 occurrences across the file, in URL strings like `/api/couch-proxy/businessconnect_tenant-1/_all_docs`) with `medicalconnect_tenant-1` / `medicalconnect_tenant-2` respectively — the substring to replace is `businessconnect_` → `medicalconnect_`, applied to every match in the file (lines 23, 39, 58, 73, 89, 105, 121, 137, 153, 169, 201).

- [ ] **Step 6: Edit `lan-identity.service.ts`**

Replace:
```ts
      .update(`business-connect-tenant:${tenantId}`)
```
with:
```ts
      .update(`medical-connect-tenant:${tenantId}`)
```

- [ ] **Step 7: Edit `sealed-box.ts`**

Replace:
```ts
      info: new TextEncoder().encode("business-connect-tenant-key-wrap-v1"),
```
with:
```ts
      info: new TextEncoder().encode("medical-connect-tenant-key-wrap-v1"),
```

- [ ] **Step 8: Edit `sealed-box.spec.ts`**

Replace:
```ts
      info: new TextEncoder().encode("business-connect-tenant-key-wrap-v1"),
```
with:
```ts
      info: new TextEncoder().encode("medical-connect-tenant-key-wrap-v1"),
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
- Consumes: the renamed `medicalconnect_${tenantId}` / `medicalconnect_identity` naming from Task 4 — these specs assert against the same literal database-name strings the production code in Task 4 now produces, so Task 4 must land first (or in the same pass) for these assertions to be meaningful.
- Produces: nothing new — this task only updates test literals to match Task 4's renamed output.

Every file in this task follows the same pattern: each has 1–4 occurrences of the literal substring `businessconnect_tenant-1`, `businessconnect_tenant-2`, or `businessconnect_identity` inside a Jest `expect(...).toHaveBeenCalledWith(...)` assertion. Replace every `businessconnect_` occurrence with `medicalconnect_` in each file listed below.

- [ ] **Step 1:** Edit `audit.repository.spec.ts` — replace `businessconnect_tenant-1` (1 occurrence) with `medicalconnect_tenant-1`.
- [ ] **Step 2:** Edit `categories.repository.spec.ts` — replace `businessconnect_tenant-1` (3 occurrences) with `medicalconnect_tenant-1`.
- [ ] **Step 3:** Edit `customers.repository.spec.ts` — replace `businessconnect_tenant-1` (4 occurrences) with `medicalconnect_tenant-1`.
- [ ] **Step 4:** Edit `device-authorization.repository.spec.ts` — replace `businessconnect_identity` (1 occurrence) with `medicalconnect_identity`.
- [ ] **Step 5:** Edit `tenant-data-key.repository.spec.ts` — replace `businessconnect_identity` (1 occurrence) with `medicalconnect_identity`.
- [ ] **Step 6:** Edit `identity.repositories.spec.ts` — replace `businessconnect_identity` (2 occurrences, including one inside a test description string `"creates and reads tenants from businessconnect_identity"`) with `medicalconnect_identity`.
- [ ] **Step 7:** Edit `products.repository.spec.ts` — replace `businessconnect_tenant-1` (5 occurrences, lines 366, 777, 779, 871, 1143) with `medicalconnect_tenant-1`.
- [ ] **Step 8:** Edit `products-lock.service.spec.ts` — replace `businessconnect_tenant-1` (1 occurrence) with `medicalconnect_tenant-1`.
- [ ] **Step 9:** Edit `rayons.repository.spec.ts` — replace `businessconnect_tenant-1` (1 occurrence) with `medicalconnect_tenant-1`.
- [ ] **Step 10:** Edit `sales.repository.spec.ts` — replace `businessconnect_tenant-1` (3 occurrences, lines 49, 119, 121) with `medicalconnect_tenant-1`.
- [ ] **Step 11:** Edit `settings.repository.spec.ts` — replace `businessconnect_tenant-1` (1 occurrence) with `medicalconnect_tenant-1`.
- [ ] **Step 12:** Edit `stock.repository.spec.ts` — replace `businessconnect_tenant-1` (2 occurrences, lines 58, 117) with `medicalconnect_tenant-1`.
- [ ] **Step 13:** Edit `suppliers.repository.spec.ts` — replace `businessconnect_tenant-1` (1 occurrence) with `medicalconnect_tenant-1`.
- [ ] **Step 14:** Edit `sync.repository.spec.ts` — replace `businessconnect_tenant-1` (1 occurrence) with `medicalconnect_tenant-1`.

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
  "name": "business-connect-client",
```
with:
```json
  "name": "medical-connect-client",
```

- [ ] **Step 2: Edit `backend/package.json`**

Replace:
```json
  "name": "business-connect-nestjs",
```
with:
```json
  "name": "medical-connect-nestjs",
```

Replace:
```json
  "description": "Business Connect - NestJS + Fastify Backend",
```
with:
```json
  "description": "Medical Connect - NestJS + Fastify Backend",
```

- [ ] **Step 3: Verify both install cleanly**

Run: `cd frontend && npm install --package-lock-only` and `cd backend && npm install --package-lock-only`
Expected: both succeed and only the `name`/`description` fields in the respective `package-lock.json` root entries change (no dependency versions change).

---

### Task 7: Dev environment (Docker + env template) rename

**Files:**
- Modify: `backend/docker-compose.yml`
- Modify: `backend/env.template`

**Interfaces:**
- Consumes: none. Produces: a differently-named local dev CouchDB container/credentials — since this is pre-production, any developer with an existing `business-connect-couchdb` container/volume from before this change should run `docker compose down` in `backend/` before pulling this change and `docker compose up -d` after, to start fresh under the new name (call this out to the user in the final summary — it's a local dev-environment note, not a migration).
- The `COUCHDB_USER`/`COUCHDB_PASSWORD` values in `docker-compose.yml` must match the credentials embedded in `backend/env.template`'s `COUCHDB_URL` — both are edited in this task so they land together.

- [ ] **Step 1: Edit `docker-compose.yml`**

Replace:
```yaml
    container_name: business-connect-couchdb
    restart: unless-stopped
    ports:
      - "127.0.0.1:5984:5984"
    environment:
      COUCHDB_USER: businessconnect
      COUCHDB_PASSWORD: business-connect-dev-password
```
with:
```yaml
    container_name: medical-connect-couchdb
    restart: unless-stopped
    ports:
      - "127.0.0.1:5984:5984"
    environment:
      COUCHDB_USER: medicalconnect
      COUCHDB_PASSWORD: medical-connect-dev-password
```

- [ ] **Step 2: Edit `env.template`**

Replace:
```
COUCHDB_URL=http://businessconnect:business-connect-dev-password@localhost:5984
```
with:
```
COUCHDB_URL=http://medicalconnect:medical-connect-dev-password@localhost:5984
```

- [ ] **Step 3: Validate the compose file**

Run: `cd backend && docker compose config`
Expected: prints the resolved config with `container_name: medical-connect-couchdb` and no YAML errors. (Do not `docker compose up` here — verifying it parses is enough; actually starting/stopping the dev database is the user's call.)

---

### Task 8: CI release workflow rename

**Files:**
- Modify: `.github/workflows/desktop-release.yml`

**Interfaces:**
- Consumes: none.

- [ ] **Step 1: Edit `desktop-release.yml`**

Replace:
```yaml
          releaseName: "Business Connect ${{ github.ref_name }}"
```
with:
```yaml
          releaseName: "Medical Connect ${{ github.ref_name }}"
```

Replace:
```yaml
            **macOS:** if you see "Business Connect is damaged and can't be opened" (or it ends up in the Trash), open Terminal and run:
            ```
            xattr -cr "/Applications/Business Connect.app"
```
with:
```yaml
            **macOS:** if you see "Medical Connect is damaged and can't be opened" (or it ends up in the Trash), open Terminal and run:
            ```
            xattr -cr "/Applications/Medical Connect.app"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `cd "/Volumes/System 1/Sites/React/medical-connect" && python3 -c "import yaml; yaml.safe_load(open('.github/workflows/desktop-release.yml'))"`
Expected: no error (confirms the YAML still parses after the edit; this doesn't run the workflow).

---

### Task 9: Playwright E2E/QA test literal and prose updates

**Files:**
- Modify: `frontend/tests/app.spec.ts`
- Modify: `frontend/tests/README.md`
- Modify: `frontend/output/playwright/visual-qa.mjs`

**Interfaces:**
- Consumes: the `medicalconnect_install_mode`/`medicalconnect_language`/`medicalconnect_theme` localStorage keys from Task 2, and the `configureMedicalConnect` i18n value ("Configurer Medical Connect") from Task 3 — this task's assertions must land after (or together with) both, otherwise the Playwright test would assert against localStorage keys and button text the app no longer produces.
- Produces: nothing consumed elsewhere.

- [ ] **Step 1: Edit `frontend/tests/app.spec.ts`**

Replace the file-header comment:
```ts
 * Business Connect — Full Application Smoke Test
```
with:
```ts
 * Medical Connect — Full Application Smoke Test
```

Replace all four occurrences of the pair:
```ts
      localStorage.setItem("businessconnect_install_mode", "connected");
      localStorage.setItem("businessconnect_language", "fr");
```
(lines 42–43 and 114–115) with:
```ts
      localStorage.setItem("medicalconnect_install_mode", "connected");
      localStorage.setItem("medicalconnect_language", "fr");
```

Replace:
```ts
      .getByRole("button", { name: "Configurer Business Connect" })
```
with:
```ts
      .getByRole("button", { name: "Configurer Medical Connect" })
```

- [ ] **Step 2: Edit `frontend/tests/README.md`**

Replace:
```md
Playwright end-to-end tests for the Business Connect application.
```
with:
```md
Playwright end-to-end tests for the Medical Connect application.
```

- [ ] **Step 3: Edit `frontend/output/playwright/visual-qa.mjs`**

Replace:
```js
    localStorage.setItem("businessconnect_install_mode", "connected");
    localStorage.setItem("businessconnect_language", "fr");
    localStorage.setItem("businessconnect_theme", selectedTheme);
```
with:
```js
    localStorage.setItem("medicalconnect_install_mode", "connected");
    localStorage.setItem("medicalconnect_language", "fr");
    localStorage.setItem("medicalconnect_theme", selectedTheme);
```

- [ ] **Step 4: Run the Playwright smoke test**

Run: `cd frontend && npx playwright test tests/app.spec.ts` (requires the backend running on port 5200 and the frontend dev server on port 3000 per `frontend/tests/README.md` — start both first if not already running).
Expected: PASS, including the initial-setup test that clicks the `"Configurer Medical Connect"` button.

---

### Task 10: Living documentation rename

**Files:**
- Modify: `frontend/README.md`
- Modify: `backend/README.md`
- Modify: `DESIGN.md`

**Interfaces:**
- Consumes: none. These are prose docs — no test coverage; verification is a manual read-through plus the grep sweep in Task 12.

- [ ] **Step 1: Edit `frontend/README.md`**

Replace every occurrence of `Business Connect` / `Business-Connect` with `Medical Connect` / `Medical-Connect` respectively, preserving surrounding sentence structure and capitalization pattern. Confirmed occurrences (read the file first to catch the exact surrounding text before editing):
- Line 1: `# Business Connect Client` → `# Medical Connect Client`
- Line 3: `A modern React-based client application for Business Connect inventory management system. This client connects to the Business Connect NestJS backend for API operations.` → same sentence with both `Business Connect` → `Medical Connect`
- Line 19: `- Business Connect Backend running on \`http://localhost:5000\`` → `- Medical Connect Backend running on ...`
- Line 86: `Ensure the Business Connect backend is running before starting the client:` → `Ensure the Medical Connect backend is running before starting the client:`
- Line 89: `cd ../Business Connect/backend` → `cd ../Medical Connect/backend`
- Line 98: `Business-Connect-Client/` → `Medical-Connect-Client/`
- Line 266: `- [Business Connect Backend](../Business Connect/backend) - NestJS backend API` → `- [Medical Connect Backend](../Medical Connect/backend) - NestJS backend API`
- Line 267: `- [Business Connect 2](../Business%20Connect%202) - Original full-stack application` → `- [Medical Connect 2](../Medical%20Connect%202) - Original full-stack application`
- Line 280: `**Note**: This client requires the Business Connect NestJS backend to be running. Make sure to start the backend before launching the client application.` → same with `Business Connect` → `Medical Connect`

- [ ] **Step 2: Edit `backend/README.md`**

Replace:
```md
# Business Connect - NestJS Server

A modern, high-performance backend for Business Connect built with **NestJS** and **Fastify**.
```
with:
```md
# Medical Connect - NestJS Server

A modern, high-performance backend for Medical Connect built with **NestJS** and **Fastify**.
```

Read the rest of the file for any further "Business Connect" mentions and replace each with "Medical Connect".

- [ ] **Step 3: Edit `DESIGN.md`**

Replace:
```md
name: BusinessConnect-design-tokens
description: "Business Connect's own dark-first glassmorphic system: a near-black canvas (#0A0B0D) layered with translucent charcoal glass panels (rgba(26, 29, 36, 0.6)), white text (#FFFFFF), and a single chromatic accent — Business Connect blue (#3B82F6) — used on the brand mark, primary CTAs, focus rings, active nav state, and chart highlights. The system reads as a dense operations console: glass cards with backdrop-blur, soft blue glows, and a subtle gradient background, rather than flat hairline panels. A first-class light theme exists (white canvas, slate-900 ink) toggled via a `.light` class. Display type runs Space Grotesk over an Inter body; JetBrains Mono covers code/barcode contexts. Semantic status colors (success green, warning amber, danger red) are reserved for stock alerts, badges, and chart series — never used decoratively."
```
with:
```md
name: MedicalConnect-design-tokens
description: "Medical Connect's own dark-first glassmorphic system: a near-black canvas (#0A0B0D) layered with translucent charcoal glass panels (rgba(26, 29, 36, 0.6)), white text (#FFFFFF), and a single chromatic accent — Medical Connect blue (#3B82F6) — used on the brand mark, primary CTAs, focus rings, active nav state, and chart highlights. The system reads as a dense operations console: glass cards with backdrop-blur, soft blue glows, and a subtle gradient background, rather than flat hairline panels. A first-class light theme exists (white canvas, slate-900 ink) toggled via a `.light` class. Display type runs Space Grotesk over an Inter body; JetBrains Mono covers code/barcode contexts. Semantic status colors (success green, warning amber, danger red) are reserved for stock alerts, badges, and chart series — never used decoratively."
```

Then replace every remaining prose occurrence of `Business Connect` with `Medical Connect` at these confirmed locations (do not change any hex/rgba color values, only prose text):
- Line 266: `Business Connect's canvas is near-black — ...`
- Line 268: `The single chromatic accent is **Business Connect blue** ...`
- Line 286: `... (Business Connect's actual design tokens, dark theme = ...)`
- Line 289: `- **Business Connect Blue** ({colors.primary}): The signature accent ...`
- Line 394: `Business Connect's depth is carried by translucency + blur + soft glow, ...`
- Line 400: `... the signature Business Connect "lift", in place of Linear's hairline-only elevation.`
- Line 503: `... Business Connect ships both themes.`
- Line 508: `... Business Connect is theme-aware (\`darkMode: ["class"]\`, \`.light\` overrides) ...`
- Line 513: `... Business Connect's canvas carries a deliberate near-black, not pure black.`
- Line 558: `... they are Business Connect's actual, shipped tokens, not an approximation.`
- Line 560: `... but Business Connect's toggle mechanism (class-based, not \`prefers-color-scheme\`) should be respected ...`
- Line 562: `... Business Connect's — only color tokens were reconciled with the app. Business Connect's real type stack is Space Grotesk ...` (two occurrences on this line)

- [ ] **Step 4: Read all three files back and confirm no stray "Business Connect" remains**

Run: `grep -in "business connect\|businessconnect\|business-connect" frontend/README.md backend/README.md DESIGN.md`
Expected: no output (empty match).

---

### Task 11: fix stale "StockFlow" seed data

**Context:** `backend/scripts/seed-database.ts` still contains two literal `"StockFlow"` strings that were missed by the *prior* rename (StockFlow → Business Connect) — they were never `"Business Connect"` in the first place. The user has confirmed these should also become "Medical Connect", following the same rule applied throughout this plan: living code gets renamed all the way to the current name; only historical/dated documents (specs, research notes, migration summaries, etc. — see Global Constraints) stay untouched because rewriting them would misrepresent history. This is the only living-code file with a residual "StockFlow" string — confirmed via a full-repo grep during planning.

**Files:**
- Modify: `backend/scripts/seed-database.ts`

**Interfaces:**
- Consumes: none. Produces: nothing consumed elsewhere — this only changes dev seed-data sample values.

- [ ] **Step 1: Edit `seed-database.ts`**

Replace:
```ts
    name: "StockFlow Store",
```
with:
```ts
    name: "Medical Connect Store",
```

Replace:
```ts
    firstName: "StockFlow",
```
with:
```ts
    firstName: "Medical Connect",
```

- [ ] **Step 2: Typecheck the backend**

Run: `cd backend && npm run build` (or the project's typecheck script if different — confirm the exact script name in `backend/package.json` before running)
Expected: no errors (this is a plain string literal change with no type impact, so this step just guards against an unrelated pre-existing break).

---

### Task 12: Final full-repo verification sweep

**Files:** none modified — this task only verifies.

**Interfaces:** Consumes the completed state of Tasks 1–11.

- [ ] **Step 1: Confirm no stray "Business Connect" branding remains outside the explicitly excluded historical docs**

Run:
```bash
cd "/Volumes/System 1/Sites/React/medical-connect" && grep -riIl "business[ _-]\?connect" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  --exclude-dir=target --exclude-dir=gen --exclude-dir=.git . \
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
  | grep -v ".impeccable/hook.cache.json"
```
Expected: no output. If anything appears, it's a file this plan missed — go back and add a task/step for it before proceeding (do not silently skip it).

- [ ] **Step 1b: Confirm no stray "StockFlow" branding remains outside the explicitly excluded historical docs**

Run the same command as Step 1, replacing the grep pattern with `-riIl "stockflow"`:
```bash
cd "/Volumes/System 1/Sites/React/medical-connect" && grep -riIl "stockflow" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=build \
  --exclude-dir=target --exclude-dir=gen --exclude-dir=.git . \
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
  | grep -v ".impeccable/hook.cache.json"
```
Expected: no output once Task 11 lands. If anything appears outside the excluded historical docs, it's a file this plan missed — add a step for it before proceeding.

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

Summarize for the user (no action needed from the executor beyond stating it):
- The repository directory was already renamed to `medical-connect` before this plan ran — no filesystem action needed.
- This directory is not currently a git repository, so there is no GitHub remote/repo name to rename and nothing to commit — flag this in case it's unexpected, since the prior rename plan assumed a git repo that no longer exists here.
- Task 11 fixed the two remaining "StockFlow" strings in `backend/scripts/seed-database.ts`, closing the gap left by the *original* StockFlow → Business Connect rename.
- Historical/dated documents (`docs/superpowers/specs/*`, `docs/research/*`, `docs/BRAINSTORMING_FONCTIONNEMENT_ACTUEL_ET_SYNC_LAN.md`, `docs/TEST_SIMULATEUR_LAN.md`, `backend/docs/*`, `CRUD_AUDIT_REPORT.md`, `plans/crud-remediation/*`) still say "StockFlow" and/or "Business Connect" by design — they're point-in-time records, not living reference docs, so this plan deliberately leaves them alone.

---

## Self-Review Notes

- **Spec coverage:** every `grep -rniE "business[ _-]?connect"` hit found during research across `frontend/src`, `frontend/src-tauri/src`, `frontend/tests`, `frontend/output`, `backend/src`, `tauri.conf.json` + variants, `capabilities/default.json`, both `package.json`s, `docker-compose.yml`, `env.template`, and the release workflow is covered by Tasks 1–9. Living docs (Task 10) and the verification sweep (Task 12) close the loop. A full-repo `grep -riIl "stockflow"` during research turned up exactly one living-code file with a residual, never-updated "StockFlow" string — `backend/scripts/seed-database.ts` — closed by Task 11 per the user's explicit request to sweep StockFlow too; every other "stockflow" hit falls inside the already-excluded historical-docs category.
- **New files not present when the prior rename plan was written:** `frontend/src/hooks/useOfflineSync.ts`, `frontend/src/hooks/usePeerSync.ts` (Task 2), `frontend/tests/app.spec.ts`, `frontend/tests/README.md`, `frontend/output/playwright/visual-qa.mjs` (Task 9), and two extra lines in `.github/workflows/desktop-release.yml` (Task 8) — all confirmed present via a fresh repo-wide grep, not assumed from the prior plan.
- **Cross-task dependency called out explicitly:** the `medical-connect-tenant-key-wrap-v1` HKDF string must match between Task 2 (frontend `sealedBox.ts`) and Task 4 (backend `sealed-box.ts`) — both are in this plan and will land together, flagged in both tasks' Interfaces sections. Task 9's Playwright assertions depend on Task 2 (storage keys) and Task 3 (i18n button text) landing first — also flagged explicitly.
- **Type/name consistency:** i18n key renames (`welcomeToBusinessConnect`→`welcomeToMedicalConnect` etc.) are defined and consumed within the same Task 3, and the `i18nCompleteness.test.ts` update is in the same task so key-parity checking still passes. `MEDICALCONNECT_INITIAL_ADMIN_USERNAME`/`PASSWORD` is renamed consistently across Task 1 (Rust reads/writes it) and Task 3 (the one frontend comment referencing it).
- **No placeholders:** every step above names an exact file and exact old/new literal text; none defer detail to "later" or reference unlisted types.
