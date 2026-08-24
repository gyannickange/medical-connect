# Kima `qa-scripter` Agent — Design Spec

**Date:** 2026-08-12
**Repo affected:** `~/Sites/React/kima/` (the Kima plugin repo — a separate, standalone git repo, not part of StockFlow). This spec lives in StockFlow's `docs/superpowers/` because that's the repo the authoring session runs in.

## Goal

Kima currently ships one agent, `qa-explorer`, which executes an explicit, human-written `Script` (a numbered list of scenarios) against a running web app with a real browser, and reports bugs. Writing that `Script` by hand — reading the codebase, finding the real UI labels, working out validation/edge cases, tying in known regressions — is itself a repeatable, mechanical-ish task that was just done manually for StockFlow's caisse/sales/products flows (see `frontend/docs/qa/scripts/caisse-ventes-produits.md`).

This spec adds a second agent, `qa-scripter`, whose sole job is to **write** that `Script` content by reading a target project's source code — so that a single invocation like "write the tests for the Products page" or "write the tests for the whole app" produces ready-to-run Kima scripts without a human doing the code reading by hand.

`qa-scripter` writes scripts. `qa-explorer` runs them. Neither writes or fixes application code, and neither replaces the other.

## Non-goals

- `qa-scripter` does not open a browser, does not require the target app to be running, and does not touch application source code.
- `qa-scripter` does not write automated test code (no Playwright specs, no Jest/Vitest tests) — its only output format is the plain-language, numbered `Script` format `qa-explorer` already consumes.
- `qa-scripter` does not decide *whether* to run the scripts it writes, and does not invoke `qa-explorer` itself — it hands off a file for a human (or a separate invocation) to feed in.
- No changes to `qa-explorer.md` itself in this spec — it's additive.

## Architecture

Two independent, single-purpose agents in the same plugin, connected only by a shared file format:

```text
qa-scripter  --writes-->  docs/qa/scripts/<module>.md  --fed as Script into-->  qa-explorer  --writes-->  docs/qa/<timestamp>-report.md
   (reads source code)                                     (drives a real browser)
```

Neither agent invokes the other. The handoff is a file the user (or a future orchestration) copies from one invocation into the next, exactly like the manual workflow just used for StockFlow.

## Components

### 1. `agents/qa-scripter.md` (new)

A new subagent definition, structurally parallel to `agents/qa-explorer.md` (same frontmatter shape: `name`, `description`, `model`, `color`), but with a Discover → Write workflow instead of Discover → Prepare → Execute → Investigate → Report.

**Invocation parameters** (free text, parsed the same loose way `qa-explorer` parses its own):

```text
Use qa-scripter.
Scope: <a page/feature name, a list of them, or "the whole app">
```

`Scope` is required — mirrors `qa-explorer`'s hard requirement for `Target`/`Script`: `qa-scripter` must not guess what to script if not told. No `Depth`/`Credentials`/`Target` parameters — those belong to `qa-explorer`'s invocation, not this one (this agent never touches a running instance or logs in).

**Workflow: Discover → Write**

*Discover:*

1. Identify the target project's page/route structure (framework-appropriate — e.g. a `pages/` directory + router for a Vite/React/Wouter app like StockFlow, an `app/` directory for Next.js, etc.). For a single named `Scope`, resolve it to the matching page/component(s). For "the whole app", enumerate all user-facing top-level pages as the default module unit, skipping non-scenario pages (404/not-found, purely presentational shells). **Grouping heuristic:** a routed page is its own module by default; a flow that has no route of its own and is only reachable as a modal/dialog triggered from another page (e.g. StockFlow's sale-creation `SaleModal`, opened from `Dashboard.tsx`) is grouped into the module of the feature page it most directly serves (here, grouped with `Sales.tsx` into one "sales" module, since both concern the sales entity) rather than becoming its own file or being silently dropped.
2. For each page/module in scope, read its component(s): routes, forms and their validation rules (required fields, uniqueness constraints visible in code, numeric/format constraints), buttons and actions, the project's i18n dictionary for the real on-screen label text (not translation keys), and `data-testid` attributes where present — the same reading pass just done by hand for StockFlow's `SaleModal.tsx`, `Sales.tsx`, `Products.tsx`, `ProductModal.tsx`.
3. Detect the project's existing QA docs convention: look for an existing `docs/qa/` directory (check both project root and one level into common app subdirectories, e.g. `frontend/docs/qa/` as found in StockFlow) so scripts land next to where `qa-explorer` already writes its reports, rather than creating a second, disconnected `docs/qa/` elsewhere. If none exists anywhere, default to `docs/qa/` at the project root.
4. Within that `docs/qa/` location (excluding its own `scripts/` subfolder), look for existing dated report files (`docs/qa/*.md`, `qa-explorer`'s report format). For each in scope, extract any bugs relevant to the page/module currently being scripted and note them for a "Points d'attention" section.

*Write:* for each page/module in scope, produce one file at `docs/qa/scripts/<module-slug>.md` (kebab-case), containing, in order:

1. A short header stating this is a `Script` for `qa-explorer`, not an automated test suite, plus a ready-to-copy invocation template (`Use qa-explorer. Target: ... / Script: ... / Depth: medium / Credentials: ...` — reusing whatever credentials/target info `qa-scripter` can find via the same discovery `qa-explorer` itself does: README, seed scripts, existing e2e tests).
2. A single, continuously-numbered list of concrete scenarios (grouped under un-numbered subheadings for readability), always covering: happy path, form validation/boundary cases, empty/duplicate/edge-case states, and — where the page supports it — pagination, filters, and permission-gated actions visible in the code (e.g. a delete button wrapped in a policy guard).
3. A closing "Points d'attention" section listing any known-bug regression checks pulled from step 4 of Discover, phrased as explicit things to verify carefully rather than trust visually — mirroring what was done manually for StockFlow's edit/delete bugs.

No "coverage" parameter — this depth of coverage is the only mode.

### 2. `README.md` updates (Kima repo)

- Extend the comparison table (or add a short paragraph) explaining the `qa-scripter` → `qa-explorer` pairing: `qa-scripter` reads code and writes a `Script`; `qa-explorer` reads that `Script` and drives a browser against it.
- Add a `qa-scripter` usage example analogous to the existing `qa-explorer` one:

  ```text
  Use qa-scripter.
  Scope: the Products page
  ```

### 3. `.claude-plugin/plugin.json` / `.claude-plugin/marketplace.json` updates

- Bump `plugin.json` version `0.1.0` → `0.2.0` (additive feature).
- Update `marketplace.json`'s plugin `description` field to mention both agents instead of only `qa-explorer`.
- No structural manifest changes needed — agents are auto-discovered from `agents/`, same as `qa-explorer` required no manifest wiring beyond the file existing.

## Data flow (concrete example)

1. User: `Use qa-scripter. Scope: the whole app` (run from within StockFlow).
2. `qa-scripter` discovers `docs/qa/` already exists at `frontend/docs/qa/` (from the prior `qa-explorer` report) and reuses that location.
3. `qa-scripter` enumerates `frontend/src/pages/*.tsx`, groups the caisse/sale-creation flow (which lives in `Dashboard.tsx` + `SaleModal.tsx`, not its own page) with `Sales.tsx` as one logical module, and treats `Products.tsx` (+ `ProductModal.tsx`, `ProductDetails.tsx`) as another, `Customers.tsx` as another, etc.
4. It finds `frontend/docs/qa/2026-08-10-2017-exploratory-qa-report.md`, pulls BUG-001 (silent edit data loss) and BUG-002 (delete 500) as relevant to the Products module.
5. Output: `frontend/docs/qa/scripts/caisse-ventes.md`, `frontend/docs/qa/scripts/produits.md`, `frontend/docs/qa/scripts/clients.md`, etc. — each self-contained and independently feedable into a `qa-explorer` invocation.

## Error handling / edge cases

- **`Scope` names a page that doesn't exist:** `qa-scripter` says so and stops for that item rather than guessing or inventing a plausible-sounding page.
- **No `docs/qa/` convention found anywhere in the project:** default to creating `docs/qa/scripts/` at the project root, same default `qa-explorer` itself falls back to.
- **A module has no forms/validation to speak of (e.g. a pure read-only dashboard):** still write a file, scoped to what's actually there (navigation, data display, links) — don't pad with invented CRUD steps.
- **Existing report files reference a bug that reads as already fixed in current code** (e.g. the code path described no longer matches): still surface it as a "Points d'attention" regression check — `qa-scripter` verifies structure/existence of UI elements, not whether a specific historical bug is currently fixed, since that determination requires actually running the app (`qa-explorer`'s job, not this agent's).
- **A file already exists at the target path from a previous run:** overwrite it — scripts are regenerated artifacts tied to current code state, not hand-maintained files (same spirit as `qa-explorer` reports being timestamped/append-only, except here regeneration is expected since re-running `qa-scripter` after code changes should produce an updated script).

## Verification

No automated test suite applies (this is a prompt/plugin-config change, same situation `qa-explorer` was in). Verification is manual, mirroring how `qa-explorer` was smoke-tested:

1. `claude plugin validate ~/Sites/React/kima` after adding the new agent file — must pass.
2. Reinstall/update the plugin locally (`marketplace update` + `plugin update`, restart session — the cache-staleness issue already documented in the `qa-explorer` plan's implementer notes applies here too).
3. Live smoke test: invoke `qa-scripter` against StockFlow with `Scope: the Products page` and confirm the output file matches the expected format (usage header, numbered scenarios, points d'attention referencing the known BUG-001/BUG-002 from the existing report) without touching any tracked application file (`git status --porcelain` in StockFlow should show only the new `docs/qa/scripts/*.md` file).
4. Confirm the generated script is actually usable: feed it into a real `qa-explorer` invocation and confirm it runs without the agent getting stuck on an unresolvable step.
