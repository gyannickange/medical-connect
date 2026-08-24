# Initial App Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher après la première connexion un assistant obligatoire qui enregistre les informations d’entreprise, la devise, la taxe et le format de document en mode connecté comme en mode local.

**Architecture:** Un module métier pur définit les valeurs, la validation, la décision de redirection et l’ordre des écritures. Un garde placé sous les providers existants dirige l’utilisateur vers une page protégée sans navigation principale. `SettingsContext` reste l’unique source de vérité et reçoit les ajustements nécessaires pour que les réglages créés hors ligne soient immédiatement relus ; un composant `ReceiptPreview` partagé rend un seul aperçu selon le format sélectionné.

**Tech Stack:** React 18, TypeScript 5.6, Wouter, React Hook Form, Zod, TanStack Query, PouchDB via `offlineApiRequest`, Tailwind CSS, Lucide React, Vitest, React DOM Server, Playwright.

## Global Constraints

- Le parcours apparaît après la première authentification réussie en mode `connected` et en mode `local`.
- Le nom de l’entreprise est le seul champ d’identité obligatoire ; téléphone, email, site web et adresse restent facultatifs.
- L’email est validé uniquement lorsqu’il est renseigné.
- Le taux de taxe reste compris entre 0 et 100 et le nombre de décimales entre 0 et 4.
- Les formats `retail` et `invoice` restent disponibles ; un seul aperçu, correspondant au choix courant, est rendu.
- `initialSetupCompleted` est écrit après tous les autres réglages et constitue l’unique marqueur de fin.
- Les réglages restent modifiables dans `Settings.tsx`.
- Les icônes de titre des sections Paramètres utilisent `text-primary` dans les deux thèmes.
- Ne pas ajouter de dépendance npm.
- Préserver toutes les modifications utilisateur sans rapport déjà présentes dans le worktree.

---

## File Structure

- Create `frontend/src/lib/initialSetup.ts`: types, schéma Zod, valeurs par défaut, décision de navigation et persistance ordonnée.
- Create `frontend/src/lib/initialSetup.test.ts`: tests unitaires de validation, redirection et ordre de sauvegarde.
- Create `frontend/src/lib/settingsCache.ts`: normalisation et remplacement optimiste d’un réglage dans une liste.
- Create `frontend/src/lib/settingsCache.test.ts`: tests unitaires des créations et mises à jour optimistes.
- Modify `frontend/src/lib/offlineApiRequest.ts`: retourner une collection vide pour le premier GET des réglages d’une installation locale.
- Modify `frontend/src/lib/offlineApiRequest.test.ts`: couvrir le premier chargement local des réglages et la mise en cache d’un réglage complet.
- Modify `frontend/src/contexts/SettingsContext.tsx`: publier immédiatement les réglages créés ou modifiés et fournir un corps optimiste complet.
- Create `frontend/src/components/ReceiptPreview.tsx`: aperçu exclusif du reçu thermique ou de la facture A4.
- Create `frontend/src/components/ReceiptPreview.test.ts`: vérification de rendu statique des deux formats.
- Create `frontend/src/components/InitialSetupGate.tsx`: garde de navigation après authentification.
- Create `frontend/src/pages/InitialSetup.tsx`: assistant en quatre étapes et sauvegarde finale.
- Modify `frontend/src/App.tsx`: route protégée `/initial-setup` et branchement du garde.
- Modify `frontend/src/pages/Settings.tsx`: icônes bleues et aperçu partagé sous le choix du format.
- Modify `frontend/src/lib/i18n.ts`: libellés français et anglais du parcours et de l’aperçu.
- Modify `frontend/src/lib/i18nCompleteness.test.ts`: assertion ciblée sur les nouveaux libellés français essentiels.
- Modify `frontend/tests/app.spec.ts`: scénario navigateur du parcours initial et aperçu des documents.

---

### Task 1: Initial setup domain contract

**Files:**
- Create: `frontend/src/lib/initialSetup.ts`
- Create: `frontend/src/lib/initialSetup.test.ts`

**Interfaces:**
- Consumes: `z` from `zod`; `CurrencyFormatOptions` from `@/hooks/useSettings`.
- Produces: `InitialSetupValues`, `initialSetupSchema`, `initialSetupDefaults`, `initialSetupCompleted(value)`, `nextInitialSetupLocation(input)`, `persistInitialSetup(values, updateSetting)`.

- [ ] **Step 1: Write failing validation and navigation tests**

```ts
import { describe, expect, it, vi } from "vitest";
import {
  initialSetupSchema,
  initialSetupDefaults,
  nextInitialSetupLocation,
  persistInitialSetup,
} from "./initialSetup";

describe("initial setup", () => {
  it("requires only a non-blank company name from company identity", () => {
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "   ",
    }).success).toBe(false);
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      companyPhone: "",
      companyEmail: "",
      companyWebsite: "",
      companyAddress: "",
    }).success).toBe(true);
  });

  it("rejects invalid optional email, tax and decimal values", () => {
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      companyEmail: "pas-un-email",
    }).success).toBe(false);
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      defaultTaxRate: 101,
    }).success).toBe(false);
    expect(initialSetupSchema.safeParse({
      ...initialSetupDefaults,
      companyName: "Kima",
      decimalPlaces: 5,
    }).success).toBe(false);
  });

  it("redirects authenticated incomplete tenants to setup", () => {
    expect(nextInitialSetupLocation({
      authenticated: true,
      tenantReady: true,
      settingsReady: true,
      completed: false,
      location: "/products",
    })).toBe("/initial-setup");
    expect(nextInitialSetupLocation({
      authenticated: true,
      tenantReady: true,
      settingsReady: true,
      completed: true,
      location: "/products",
    })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cd frontend && npm run test:unit -- src/lib/initialSetup.test.ts`

Expected: FAIL because `./initialSetup` does not exist.

- [ ] **Step 3: Implement the contract and validation**

```ts
import { z } from "zod";

export const initialSetupSchema = z.object({
  companyName: z.string().trim().min(1),
  companyPhone: z.string(),
  companyEmail: z.string().email().or(z.literal("")),
  companyWebsite: z.string(),
  companyAddress: z.string(),
  defaultCurrency: z.string().min(1),
  decimalSeparator: z.enum([".", ","]),
  thousandSeparator: z.enum(["none", ",", ".", " "]),
  decimalPlaces: z.number().int().min(0).max(4),
  symbolPosition: z.enum(["before", "after"]),
  defaultTaxRate: z.number().min(0).max(100),
  autoPrintReceipt: z.boolean(),
  receiptFormat: z.enum(["retail", "invoice"]),
});

export type InitialSetupValues = z.infer<typeof initialSetupSchema>;

export const initialSetupDefaults: InitialSetupValues = {
  companyName: "",
  companyPhone: "",
  companyEmail: "",
  companyWebsite: "",
  companyAddress: "",
  defaultCurrency: "EUR",
  decimalSeparator: ".",
  thousandSeparator: ",",
  decimalPlaces: 2,
  symbolPosition: "after",
  defaultTaxRate: 20,
  autoPrintReceipt: true,
  receiptFormat: "retail",
};

export function initialSetupCompleted(value: unknown): boolean {
  return value === true || value === "true";
}

export function nextInitialSetupLocation(input: {
  authenticated: boolean;
  tenantReady: boolean;
  settingsReady: boolean;
  completed: boolean;
  location: string;
}): string | null {
  if (!input.authenticated || !input.tenantReady || !input.settingsReady) return null;
  if (!input.completed && input.location !== "/initial-setup") return "/initial-setup";
  if (input.completed && input.location === "/initial-setup") return "/";
  return null;
}
```

- [ ] **Step 4: Add and test completion-last persistence**

Append this test before implementation:

```ts
it("writes the completion marker only after every business setting", async () => {
  const calls: string[] = [];
  const updateSetting = vi.fn(async (key: string) => {
    calls.push(key);
  });

  await persistInitialSetup(
    { ...initialSetupDefaults, companyName: "Kima" },
    updateSetting,
  );

  expect(calls.at(-1)).toBe("initialSetupCompleted");
  expect(calls).toContain("companyName");
  expect(calls).toContain("receiptFormat");
});

it("does not write completion when a setting fails", async () => {
  const calls: string[] = [];
  const updateSetting = vi.fn(async (key: string) => {
    calls.push(key);
    if (key === "defaultTaxRate") throw new Error("save failed");
  });

  await expect(persistInitialSetup(
    { ...initialSetupDefaults, companyName: "Kima" },
    updateSetting,
  )).rejects.toThrow("save failed");
  expect(calls).not.toContain("initialSetupCompleted");
});
```

Implement `persistInitialSetup` with the exact signature:

```ts
type UpdateSetting = (
  key: string,
  value: unknown,
  options?: { category?: string; dataType?: string },
) => Promise<void>;

export async function persistInitialSetup(
  values: InitialSetupValues,
  updateSetting: UpdateSetting,
): Promise<void> {
  const writes: Array<[string, unknown, string]> = [
    ["companyName", values.companyName.trim(), "company"],
    ["companyPhone", values.companyPhone.trim(), "company"],
    ["companyEmail", values.companyEmail.trim(), "company"],
    ["companyWebsite", values.companyWebsite.trim(), "company"],
    ["companyAddress", values.companyAddress.trim(), "company"],
    ["defaultCurrency", values.defaultCurrency, "system"],
    ["currencyDecimalSeparator", values.decimalSeparator, "system"],
    ["currencyThousandSeparator", values.thousandSeparator, "system"],
    ["currencyDecimalPlaces", values.decimalPlaces, "system"],
    ["currencySymbolPosition", values.symbolPosition, "system"],
    ["defaultTaxRate", values.defaultTaxRate, "system"],
    ["autoPrintReceipt", values.autoPrintReceipt, "system"],
    ["receiptFormat", values.receiptFormat, "system"],
  ];
  await Promise.all(writes.map(([key, value, category]) =>
    updateSetting(key, value, { category }),
  ));
  await updateSetting("initialSetupCompleted", true, {
    category: "system",
    dataType: "boolean",
  });
}
```

- [ ] **Step 5: Run the focused test and commit**

Run: `cd frontend && npm run test:unit -- src/lib/initialSetup.test.ts`

Expected: PASS.

```bash
git add frontend/src/lib/initialSetup.ts frontend/src/lib/initialSetup.test.ts
git commit -m "feat: define initial setup workflow"
```

---

### Task 2: Reliable settings state in local mode

**Files:**
- Create: `frontend/src/lib/settingsCache.ts`
- Create: `frontend/src/lib/settingsCache.test.ts`
- Modify: `frontend/src/lib/offlineApiRequest.ts`
- Modify: `frontend/src/lib/offlineApiRequest.test.ts`
- Modify: `frontend/src/contexts/SettingsContext.tsx`

**Interfaces:**
- Consumes: current `Setting` shape and `offlineApiRequest`.
- Produces: exported `SettingRecord`, `upsertSettingRecord(previous, next)` and immediate SettingsContext consistency after every mutation.

- [ ] **Step 1: Write failing pure cache tests**

```ts
import { describe, expect, it } from "vitest";
import { upsertSettingRecord } from "./settingsCache";

const base = {
  id: "setting-1", tenantId: "local", key: "companyName", value: "A",
  category: "company", dataType: "string", isEncrypted: false,
  createdAt: "2026-08-15", updatedAt: "2026-08-15",
};

describe("upsertSettingRecord", () => {
  it("adds a newly created setting", () => {
    expect(upsertSettingRecord([], base)).toEqual([base]);
  });

  it("replaces the setting with the same key without duplicating it", () => {
    const next = { ...base, value: "B" };
    expect(upsertSettingRecord([base], next)).toEqual([next]);
  });
});
```

- [ ] **Step 2: Run the cache test and verify RED**

Run: `cd frontend && npm run test:unit -- src/lib/settingsCache.test.ts`

Expected: FAIL because `settingsCache.ts` does not exist.

- [ ] **Step 3: Implement the pure helper and use its exported type in SettingsContext**

```ts
export interface SettingRecord {
  id: string;
  tenantId: string;
  key: string;
  value: string;
  category: string;
  dataType: string;
  isEncrypted: boolean;
  createdAt: string;
  updatedAt: string;
}

export function upsertSettingRecord(
  previous: SettingRecord[],
  next: SettingRecord,
): SettingRecord[] {
  const index = previous.findIndex((setting) => setting.key === next.key);
  if (index === -1) return [...previous, next];
  return previous.map((setting, current) => current === index ? next : setting);
}
```

In `SettingsContext.tsx`, replace the private interface with `SettingRecord`,
send `{ tenantId, key, value, category, dataType }` for both POST and PUT, pass
`entityId: existingSetting.id` for PUT, normalize the response with the known
request fields, and call:

```ts
onSuccess: (savedSetting) => {
  setCachedSettings((previous) =>
    upsertSettingRecord(previous, savedSetting),
  );
  queryClient.invalidateQueries({
    queryKey: ["/api/settings", currentTenant?.id],
  });
},
```

- [ ] **Step 4: Write a failing local-empty-settings request test**

Add to `offlineApiRequest.test.ts`, with a Map-backed `localStorage` stub and
`setInstallMode("local")` in the test:

```ts
it("returns an empty settings collection on the first local launch", async () => {
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "stockflow_install_mode" ? "local" : null,
    setItem: vi.fn(),
  });
  vi.mocked(getCachedResponse).mockResolvedValueOnce(null);

  const response = await offlineApiRequest(
    "GET",
    "/api/settings?tenantId=local",
    undefined,
    { collection: "settings" },
  );

  expect(fetch).not.toHaveBeenCalled();
  await expect(response.json()).resolves.toEqual([]);
});
```

- [ ] **Step 5: Verify RED, then implement the scoped empty response**

Run: `cd frontend && npm run test:unit -- src/lib/offlineApiRequest.test.ts`

Expected: FAIL because the local GET throws when no cache exists.

In the GET catch path, after checking `cachedData`, return
`createCachedResponse([])` only when `getInstallMode() === "local" && collection === "settings"`.
Do not change empty-cache behavior for other collections.

- [ ] **Step 6: Run focused tests and commit**

Run:

```bash
cd frontend
npm run test:unit -- src/lib/settingsCache.test.ts src/lib/offlineApiRequest.test.ts
```

Expected: PASS.

```bash
git add frontend/src/lib/settingsCache.ts frontend/src/lib/settingsCache.test.ts frontend/src/lib/offlineApiRequest.ts frontend/src/lib/offlineApiRequest.test.ts frontend/src/contexts/SettingsContext.tsx
git commit -m "fix: keep local settings immediately consistent"
```

---

### Task 3: Shared exclusive receipt preview

**Files:**
- Create: `frontend/src/components/ReceiptPreview.tsx`
- Create: `frontend/src/components/ReceiptPreview.test.ts`

**Interfaces:**
- Consumes: `formatCurrencyValue` from `@/lib/formatNumber`.
- Produces: `ReceiptPreviewProps` and `ReceiptPreview`.

- [ ] **Step 1: Write the failing static-render tests**

```ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReceiptPreview, type ReceiptPreviewProps } from "./ReceiptPreview";

const props: ReceiptPreviewProps = {
  format: "retail",
  companyName: "Kima",
  companyAddress: "Cotonou",
  companyPhone: "+229 00 00 00 00",
  companyEmail: "contact@kima.bj",
  companyWebsite: "kima.bj",
  currency: "XOF",
  decimalSeparator: ",",
  thousandSeparator: " ",
  decimalPlaces: 0,
  symbolPosition: "after",
  taxRate: 0,
};

describe("ReceiptPreview", () => {
  it("renders only the thermal receipt for retail", () => {
    const html = renderToStaticMarkup(React.createElement(ReceiptPreview, props));
    expect(html).toContain('data-testid="retail-receipt-preview"');
    expect(html).not.toContain('data-testid="invoice-preview"');
  });

  it("renders only the A4 invoice for invoice", () => {
    const html = renderToStaticMarkup(React.createElement(ReceiptPreview, {
      ...props, format: "invoice",
    }));
    expect(html).toContain('data-testid="invoice-preview"');
    expect(html).not.toContain('data-testid="retail-receipt-preview"');
  });
});
```

- [ ] **Step 2: Run the component test and verify RED**

Run: `cd frontend && npm run test:unit -- src/components/ReceiptPreview.test.ts`

Expected: FAIL because `ReceiptPreview.tsx` does not exist.

- [ ] **Step 3: Implement the component**

Define `format: "retail" | "invoice"` and all fields shown above. Use a single
conditional return, not CSS-hidden duplicate documents:

```tsx
if (format === "retail") {
  return <article data-testid="retail-receipt-preview">...</article>;
}
return <article data-testid="invoice-preview">...</article>;
```

Both branches render the same sample sale (three lines, subtotal, tax and total),
format money through `formatCurrencyValue`, omit empty optional company lines,
use semantic `<article>`, `<table>` for the invoice rows, and a responsive wrapper
with `overflow-x-auto`. Style the receipt as a narrow white paper and the invoice
as a wider white A4-like paper inside a dark neutral preview stage; do not invoke
PDF generation or printing.

- [ ] **Step 4: Run the focused test and commit**

Run: `cd frontend && npm run test:unit -- src/components/ReceiptPreview.test.ts`

Expected: PASS.

```bash
git add frontend/src/components/ReceiptPreview.tsx frontend/src/components/ReceiptPreview.test.ts
git commit -m "feat: add receipt and invoice preview"
```

---

### Task 4: Protected four-step initial setup flow

**Files:**
- Create: `frontend/src/components/InitialSetupGate.tsx`
- Create: `frontend/src/pages/InitialSetup.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/src/lib/i18nCompleteness.test.ts`

**Interfaces:**
- Consumes: `nextInitialSetupLocation`, `persistInitialSetup`, `initialSetupSchema`, `ReceiptPreview`, `useAuth`, `useTenant`, `useSettings`.
- Produces: route `/initial-setup` and automatic routing based on `initialSetupCompleted`.

- [ ] **Step 1: Extend the domain test for setup-route exit**

```ts
it("leaves setup only after completion", () => {
  expect(nextInitialSetupLocation({
    authenticated: true,
    tenantReady: true,
    settingsReady: true,
    completed: false,
    location: "/initial-setup",
  })).toBeNull();
  expect(nextInitialSetupLocation({
    authenticated: true,
    tenantReady: true,
    settingsReady: true,
    completed: true,
    location: "/initial-setup",
  })).toBe("/");
});
```

- [ ] **Step 2: Run the test and verify it passes against the established contract**

Run: `cd frontend && npm run test:unit -- src/lib/initialSetup.test.ts`

Expected: PASS. This locks the route behavior before wiring React.

- [ ] **Step 3: Implement InitialSetupGate**

The component must read `isAuthenticated`/`isLoading`, tenant loading/current
tenant, settings loading and `getSetting("initialSetupCompleted", false)`. While
an authenticated tenant or its settings are loading, show the existing centered
`Loader2` pattern. In an effect, compute `nextInitialSetupLocation(...)` and call
`setLocation(destination)` only when the result is non-null. Render children when
no redirect is pending.

- [ ] **Step 4: Implement the four-step page**

Use one `useForm<InitialSetupValues>` with `zodResolver(initialSetupSchema)` and
defaults composed from the `useSettings` getters. Keep `step` in local state:

```ts
const STEP_FIELDS: Array<Array<keyof InitialSetupValues>> = [
  ["companyName", "companyPhone", "companyEmail", "companyWebsite", "companyAddress"],
  ["defaultCurrency", "symbolPosition", "decimalSeparator", "thousandSeparator", "decimalPlaces"],
  ["defaultTaxRate"],
  ["autoPrintReceipt", "receiptFormat"],
];

const goNext = async () => {
  if (await form.trigger(STEP_FIELDS[step])) setStep((current) => current + 1);
};
```

Render a compact brand header, `Étape n sur 4`, a progress bar, Back/Continue
actions and the final `Configurer StockFlow` action. The last step uses two
keyboard-accessible radio-card controls for `retail` and `invoice`, then renders
exactly one `ReceiptPreview` from `form.watch()` values. Submit with
`persistInitialSetup(values, updateSetting)`, call `refreshSettings()`, show a
success toast and navigate to `/`. On failure, preserve the form, remain on the
last step and show a destructive toast.

- [ ] **Step 5: Wire the route and guard**

In `App.tsx`, add:

```tsx
<Route path="/initial-setup">
  <ProtectedRoute><InitialSetup /></ProtectedRoute>
</Route>
```

Place `<InitialSetupGate>` inside `SettingsProvider`, around the existing tooltip,
global workers and router subtree. Do not place `/initial-setup` inside `Layout`.

- [ ] **Step 6: Add English and French translations**

Add aligned keys for: `initialSetup`, `initialSetupIntro`, `stepOf`,
`continue`, `back`, `configureStockFlow`, `optionalInvoiceDetails`,
`chooseDocumentFormat`, `thermalReceiptSize`, `a4InvoiceSize`,
`setupSaved`, `setupSaveError`, `receiptPreview`, `invoicePreview`.

Add to `i18nCompleteness.test.ts`:

```ts
it("keeps the initial setup French copy explicit", () => {
  expect(translations.fr.configureStockFlow).toBe("Configurer StockFlow");
  expect(translations.fr.chooseDocumentFormat).toBe("Quel format voulez-vous utiliser ?");
});
```

- [ ] **Step 7: Run focused tests, type-check and commit**

Run:

```bash
cd frontend
npm run test:unit -- src/lib/initialSetup.test.ts src/lib/i18nCompleteness.test.ts
npm run check
```

Expected: all tests PASS and TypeScript exits 0.

```bash
git add frontend/src/components/InitialSetupGate.tsx frontend/src/pages/InitialSetup.tsx frontend/src/App.tsx frontend/src/lib/i18n.ts frontend/src/lib/i18nCompleteness.test.ts
git commit -m "feat: require setup after first login"
```

---

### Task 5: Settings visual continuity and live document preview

**Files:**
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/components/ReceiptPreview.test.ts`

**Interfaces:**
- Consumes: `ReceiptPreview` and existing `useSettings` getters.
- Produces: blue section-heading icons and a live single-document preview in Settings.

- [ ] **Step 1: Add a regression assertion for optional company lines**

```ts
it("omits empty optional company details", () => {
  const html = renderToStaticMarkup(React.createElement(ReceiptPreview, {
    ...props,
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
    companyWebsite: "",
  }));
  expect(html).not.toContain("undefined");
  expect(html).not.toContain("contact@kima.bj");
});
```

- [ ] **Step 2: Run the preview test and verify the assertion protects real output**

Run: `cd frontend && npm run test:unit -- src/components/ReceiptPreview.test.ts`

Expected: PASS if Task 3 correctly omitted empty details; otherwise FAIL and fix
`ReceiptPreview` before editing Settings.

- [ ] **Step 3: Make every Settings section title icon blue**

Add `text-primary` to the heading icons `Store`, `DollarSign`, `Percent`,
`FileText` and any other section-heading icon in this page. Preserve semantic
colors on warning/destructive/action icons and preserve the already-blue
`Database` heading icon.

- [ ] **Step 4: Add the selected preview below the receipt format control**

Keep the `Select` with both `retail` and `invoice`. Directly below it, render:

```tsx
<ReceiptPreview
  format={receiptFormat as "retail" | "invoice"}
  companyName={getCompanyName()}
  companyAddress={getCompanyAddress()}
  companyPhone={getCompanyPhone()}
  companyEmail={getCompanyEmail()}
  companyWebsite={getCompanyWebsite()}
  currency={getDefaultCurrency()}
  {...getCurrencyFormat()}
  taxRate={getDefaultTaxRate()}
/>
```

The existing `handleReceiptFormatChange` already updates `receiptFormat`, so the
preview switches immediately and never renders both formats.

- [ ] **Step 5: Run checks and commit**

Run:

```bash
cd frontend
npm run test:unit -- src/components/ReceiptPreview.test.ts src/lib/i18nCompleteness.test.ts
npm run check
```

Expected: PASS and TypeScript exits 0.

```bash
git add frontend/src/pages/Settings.tsx frontend/src/components/ReceiptPreview.test.ts frontend/src/components/ReceiptPreview.tsx
git commit -m "feat: preview selected billing document"
```

---

### Task 6: End-to-end and visual verification

**Files:**
- Modify: `frontend/tests/app.spec.ts`

**Interfaces:**
- Consumes: completed `/initial-setup` flow and stable `data-testid` values from Tasks 3–5.
- Produces: browser regression coverage for first-login routing and exclusive previews.

- [ ] **Step 1: Add the first-login Playwright scenario**

Add a test fixture that intercepts `/api/auth/me` with an authenticated admin,
intercepts GET `/api/settings*` with `[]`, and fulfills POST `/api/settings` with
the submitted object plus an `id`. Assert:

```ts
await page.goto("/");
await expect(page).toHaveURL(/\/initial-setup$/);
await page.getByLabel("Nom de l'entreprise").fill("Boutique Kima");
await page.getByRole("button", { name: "Continuer" }).click();
await page.getByRole("button", { name: "Continuer" }).click();
await page.getByRole("button", { name: "Continuer" }).click();
await expect(page.getByTestId("retail-receipt-preview")).toBeVisible();
await page.getByLabel(/Grande facture/).click();
await expect(page.getByTestId("invoice-preview")).toBeVisible();
await expect(page.getByTestId("retail-receipt-preview")).toHaveCount(0);
await page.getByRole("button", { name: "Configurer StockFlow" }).click();
await expect(page).toHaveURL(/\/$/);
```

Capture submitted setting keys and assert `initialSetupCompleted` is the final
POST observed.

- [ ] **Step 2: Run the scenario and fix only product defects it exposes**

Run with the documented backend/frontend prerequisites:

`cd frontend && npx playwright test -g "initial setup" --reporter=line`

Expected: PASS.

- [ ] **Step 3: Run the complete frontend verification**

```bash
cd frontend
npm run test:unit
npm run check
npm run build
```

Expected: all unit tests PASS, TypeScript exits 0 and Vite build exits 0.

- [ ] **Step 4: Inspect the UI in one bounded visual pass**

Use the existing Playwright workflow to capture desktop `1440×900` and mobile
`390×844` screenshots for the setup receipt step and Settings page in light and
dark themes. Verify: no horizontal overflow, one preview only, readable A4
scaling, 44 px controls, visible focus state and blue heading icons. Apply one
batched correction if defects are visible, then perform one confirmation pass.

- [ ] **Step 5: Commit the browser coverage and any verified corrections**

```bash
git add frontend/tests/app.spec.ts frontend/src
git commit -m "test: cover initial configuration journey"
```

Use `git diff --cached --name-only` before committing and unstage any unrelated
user files so this commit contains only files changed by this plan.
