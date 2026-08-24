# Prix / Coût / Devise — Plan d'implémentation

> **Statut : implémenté.** Les 11 tâches ont été livrées dans le commit `26008d2` ("feat: add selling price history, purchases with CUMP, and reference currency"). Vérifié le 2026-08-19 : `cd backend && npx jest products settings stock` → 58 suites / 378 tests PASS ; `cd frontend && npx vitest run src/lib/resolveProductPrice.test.ts src/lib/calculateProfitability.test.ts` → 18 tests PASS. Cases à cocher mises à jour en conséquence.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter l'historique de prix de vente daté, les approvisionnements avec conversion de devise manuelle, le CUMP (coût moyen pondéré), le tout scopé par variante, sur le backend NestJS/CouchDB de StockFlow.

**Architecture:** Tout est embarqué sur le document produit CouchDB (`sellingPrices[]`, `purchases[]`), au même niveau que `variants`/`pricingRules` déjà existants, muté via le helper `ProductsRepository.patchProduct` (retry optimiste sur conflit 409) déjà utilisé par `createPricing`/`createVariant`. Aucune nouvelle collection CouchDB, aucun nouvel endpoint hors ceux listés en section 6 du spec.

**Tech Stack:** NestJS, CouchDB (via `nano`, `CouchDBService`), `class-validator`/`class-transformer` pour les DTO, Jest (backend, instanciation directe des services avec mocks Jest — pas de `TestingModule`), Vitest (frontend, `environment: "node"`).

**Spec:** `docs/superpowers/specs/2026-08-16-pricing-cost-currency-design.md`

## Global Constraints

- Immuabilité stricte : `sellingPrices[]`/`purchases[]` n'ont **aucune** route `PUT`/`DELETE` — uniquement `POST` (ajout) et `GET` (lecture).
- Aucune migration de données : produits existants sans historique fonctionnent avec `price`/`cost` en repli, inchangé.
- Un produit à variantes n'a **jamais** d'entrée `sellingPrices`/`purchases` avec `variantId: null` ; un produit simple n'en a **jamais** avec `variantId` non-null (section 3.5 du spec, validation backend obligatoire, pas seulement documentaire).
- Argent : `Number(...)` puis `.toFixed(2)` partout, exactement la convention déjà en place dans `products.repository.ts` — pas de bibliothèque décimale.
- Permission `POST` sur les deux sous-ressources : `isAdminOrManager()` (réutiliser `ProductsPolicy.create()`, déjà ce comportement). Permission `GET` : tous rôles (`ProductsPolicy.view()`, déjà `return true`).
- Idempotence : un `id` client-fourni déjà présent dans `purchases`/`sellingPrices` ne doit jamais produire une deuxième entrée ni un deuxième mouvement de stock (retry offline-first).
- Tri par défaut : `effectiveAt`/`purchaseDate` décroissant, puis `createdAt` décroissant en cas d'égalité.
- Rollback d'un achat (section 4 du spec) : si l'écriture du `StockMovement` échoue, la quantité **et** le coût (`product.cost`/`variant.cost`) sont tous deux restaurés à leur valeur d'avant l'achat ; la `PurchaseEntry` n'est, elle, jamais retirée.

---

## File Structure

Backend :
- `backend/src/shared/schema.ts` — modifié : nouveaux types `SellingPriceEntry`/`PurchaseEntry` + schémas zod, `StockMovement.purchaseId`.
- `backend/src/modules/settings/settings.service.ts` — modifié : `getReferenceCurrency`.
- `backend/src/modules/products/product-pricing-history.ts` — nouveau : résolution du prix courant + tri des historiques (pur, sans dépendance NestJS).
- `backend/src/modules/products/product-profitability.ts` — nouveau : calcul de rentabilité (pur).
- `backend/src/modules/products/product-purchases.service.ts` — nouveau : orchestration du flux d'achat (section 4 du spec).
- `backend/src/modules/products/products.repository.ts` — modifié : init des tableaux embarqués, validation section 3.5, CRUD `sellingPrices`/`purchases`, CUMP, rollback.
- `backend/src/modules/products/products.service.ts` — modifié : `getSellingPrices`/`addSellingPrice`.
- `backend/src/modules/products/products.controller.ts` — modifié : 4 nouvelles routes.
- `backend/src/modules/products/products.module.ts` — modifié : import `SettingsModule`, provider `ProductPurchasesService`.
- `backend/src/modules/products/dto/product-selling-price.dto.ts` — nouveau.
- `backend/src/modules/products/dto/product-purchase.dto.ts` — nouveau.
- `backend/src/modules/stock/stock.repository.ts` — modifié : `purchaseId` dans `toDocument`.
- `backend/src/modules/stock/stock.service.ts` — modifié : `purchaseId: null` sur le mouvement construit par `adjust()`.

Frontend :
- `frontend/shared/schema.ts` — modifié : `SellingPriceEntry`/`InsertSellingPriceEntry`, `StockMovement.purchaseId` (miroir manuel existant, déjà en dérive partielle du backend — cf. Tâche 1).
- `frontend/src/lib/resolveProductPrice.ts` — modifié : résolution du prix courant via `sellingPrices` avant repli `variant.price`/`product.price`.
- `frontend/src/lib/calculateProfitability.ts` — nouveau : miroir pur de `product-profitability.ts`.

Tests : un fichier `*.spec.ts`/`*.test.ts` à côté de chaque fichier ci-dessus, suivant la convention déjà en place (`products.repository.spec.ts`, `resolveProductPrice.test.ts`, etc.).

---

### Task 1: Types, schémas zod et champ `purchaseId`

**Files:**
- Modify: `backend/src/shared/schema.ts`
- Modify: `frontend/shared/schema.ts`

**Interfaces:**
- Produces: `SellingPriceEntry`, `InsertSellingPriceEntry`, `PurchaseEntry`, `InsertPurchaseEntry` (types + `insertSellingPriceEntrySchema`/`insertPurchaseEntrySchema` zod backend), `StockMovement.purchaseId: string | null` (backend + frontend), `SellingPriceEntry`/`InsertSellingPriceEntry` (frontend, `effectiveAt`/`createdAt: string`).

Il n'existe pas de fichier de test dédié aux schémas zod dans ce projet (aucun `schema.spec.ts`) — ces types sont validés indirectement par les tests des tâches suivantes qui les consomment. Cette tâche n'a donc pas de cycle rouge/vert propre ; elle se termine par une vérification de compilation.

- [x] **Step 1: Ajouter les types et schémas zod côté backend**

Dans `backend/src/shared/schema.ts`, juste après le bloc `ProductAnalytics`/`InsertProductAnalytics` (avant `ProductReview`) :

```ts
export interface SellingPriceEntry { id: string; variantId: string | null; price: Money; effectiveAt: Date; createdByUserId: string; createdAt: Date }
export interface InsertSellingPriceEntry { id?: string; variantId?: string | null; price: MoneyInput; effectiveAt?: Date | string; createdByUserId: string }

export interface PurchaseEntry { id: string; variantId: string | null; quantity: number; unitPurchasePrice: Money; purchaseCurrency: string; conversionRate: Money; referenceCurrency: string; unitCostConverted: Money; supplierId: string | null; purchaseDate: Date; createdByUserId: string; createdAt: Date }
export interface InsertPurchaseEntry { id?: string; variantId?: string | null; quantity: number; unitPurchasePrice: MoneyInput; purchaseCurrency: string; conversionRate: MoneyInput; supplierId?: string | null; purchaseDate?: Date | string; createdByUserId: string }
```

Puis, sur la ligne existante de `StockMovement`/`InsertStockMovement`, ajouter `purchaseId` :

```ts
export interface StockMovement { id: string; productId: string; variantId: string | null; type: StockMovementType; quantity: number; previousQuantity: number; newQuantity: number; reason: string | null; priceType: string | null; unitPrice: Money | null; purchaseId: string | null; userId: string | null; tenantId: string; createdAt: Date }
```

(`InsertStockMovement` reste `Omit<StockMovement, "id" | "createdAt">` — il hérite automatiquement du nouveau champ.)

Dans la zone des schémas zod, à la suite de `insertProductAnalyticsSchema` :

```ts
export const insertSellingPriceEntrySchema = z.object({ id, variantId: nullableString, price: money, effectiveAt: z.union([z.date(), z.string()]).optional(), createdByUserId: z.string() });
export const insertPurchaseEntrySchema = z.object({ id, variantId: nullableString, quantity: z.number().int().min(1), unitPurchasePrice: money, purchaseCurrency: z.string().min(1), conversionRate: money, supplierId: nullableString, purchaseDate: z.union([z.date(), z.string()]).optional(), createdByUserId: z.string() });
```

Et sur `insertStockMovementSchema`, ajouter `purchaseId: nullableString`.

- [x] **Step 2: Vérifier la compilation backend**

Run: `cd backend && npx tsc --noEmit`
Expected: échec attendu à ce stade sur deux sites qui construisent un `StockMovement` sans `purchaseId` (`stock.service.ts`, `products.service.ts`) — ce sont les seuls échecs attendus, corrigés en Tâche 7. Confirmer qu'aucune autre erreur n'apparaît.

- [x] **Step 3: Ajouter le miroir frontend**

Dans `frontend/shared/schema.ts`, à la suite du bloc `ProductPricing`/`InsertProductPricing` :

```ts
export interface SellingPriceEntry { id: string; variantId: string | null; price: Money; effectiveAt: string; createdByUserId: string; createdAt: string }
export interface InsertSellingPriceEntry { id?: string; variantId?: string | null; price: MoneyInput; effectiveAt?: string; createdByUserId: string }
```

Sur la ligne `StockMovement` existante de ce fichier, ajouter `purchaseId: string | null` (même position que côté backend).

- [x] **Step 4: Vérifier la compilation frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: aucune erreur nouvelle (rien ne consomme encore ces types côté frontend).

- [x] **Step 5: Commit**

```bash
git add backend/src/shared/schema.ts frontend/shared/schema.ts
git commit -m "feat: add SellingPriceEntry/PurchaseEntry types and StockMovement.purchaseId"
```

---

### Task 2: `SettingsService.getReferenceCurrency`

**Files:**
- Modify: `backend/src/modules/settings/settings.service.ts`
- Test: `backend/src/modules/settings/settings.service.spec.ts`

**Interfaces:**
- Consumes: `SettingsRepository.findByKey(key: string, tenantId: string): Promise<Setting | null>` (déjà existant).
- Produces: `SettingsService.getReferenceCurrency(tenantId: string): Promise<string>`.

- [x] **Step 1: Écrire le test qui échoue**

Ajouter dans `backend/src/modules/settings/settings.service.spec.ts`, à la suite du test existant :

```ts
describe("getReferenceCurrency", () => {
  it("returns the tenant's configured reference currency", async () => {
    const repository = {
      findByKey: jest.fn().mockResolvedValue({ id: "s1", key: "currency.reference", value: "NGN" }),
    };
    const service = new SettingsService(repository as any);

    await expect(service.getReferenceCurrency("tenant-1")).resolves.toBe("NGN");
    expect(repository.findByKey).toHaveBeenCalledWith("currency.reference", "tenant-1");
  });

  it("falls back to XOF when no setting exists for the tenant", async () => {
    const repository = { findByKey: jest.fn().mockResolvedValue(null) };
    const service = new SettingsService(repository as any);

    await expect(service.getReferenceCurrency("tenant-1")).resolves.toBe("XOF");
  });
});
```

- [x] **Step 2: Lancer le test et vérifier l'échec**

Run: `cd backend && npx jest settings/settings.service.spec.ts -t getReferenceCurrency`
Expected: FAIL — `service.getReferenceCurrency is not a function`.

- [x] **Step 3: Implémenter**

Dans `backend/src/modules/settings/settings.service.ts`, ajouter la méthode :

```ts
async getReferenceCurrency(tenantId: string): Promise<string> {
  const setting = await this.settingsRepository.findByKey("currency.reference", tenantId);
  return setting?.value ?? "XOF";
}
```

- [x] **Step 4: Lancer le test et vérifier le succès**

Run: `cd backend && npx jest settings/settings.service.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add backend/src/modules/settings/settings.service.ts backend/src/modules/settings/settings.service.spec.ts
git commit -m "feat: add SettingsService.getReferenceCurrency with XOF fallback"
```

---

### Task 3: Résolution du prix de vente courant + tri des historiques

**Files:**
- Create: `backend/src/modules/products/product-pricing-history.ts`
- Test: `backend/src/modules/products/product-pricing-history.spec.ts`
- Modify: `backend/src/modules/products/products.repository.ts:644-689` (`calculateProductPrice`)
- Modify: `backend/src/modules/products/products.repository.spec.ts`

**Interfaces:**
- Consumes: `SellingPriceEntry`, `PurchaseEntry` (Tâche 1).
- Produces: `resolveCurrentSellingPrice(sellingPrices: SellingPriceEntry[] | undefined, variantId: string | null, fallback: string): string`, `sortSellingPricesDesc(entries: SellingPriceEntry[]): SellingPriceEntry[]`, `sortPurchasesDesc(entries: PurchaseEntry[]): PurchaseEntry[]`.

- [x] **Step 1: Écrire les tests qui échouent**

Créer `backend/src/modules/products/product-pricing-history.spec.ts` :

```ts
import {
  resolveCurrentSellingPrice,
  sortSellingPricesDesc,
  sortPurchasesDesc,
} from "./product-pricing-history";
import type { SellingPriceEntry, PurchaseEntry } from "@shared/schema";

function sellingPrice(overrides: Partial<SellingPriceEntry> = {}): SellingPriceEntry {
  return {
    id: "sp-1",
    variantId: null,
    price: "10.00",
    effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
    createdByUserId: "user-1",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("resolveCurrentSellingPrice", () => {
  it("falls back when there is no selling price history", () => {
    expect(resolveCurrentSellingPrice(undefined, null, "9.99")).toBe("9.99");
    expect(resolveCurrentSellingPrice([], null, "9.99")).toBe("9.99");
  });

  it("picks the most recent entry that is already effective", () => {
    const entries = [
      sellingPrice({ id: "sp-old", price: "10.00", effectiveAt: new Date("2026-08-01") }),
      sellingPrice({ id: "sp-new", price: "12.00", effectiveAt: new Date("2026-08-10") }),
    ];
    expect(resolveCurrentSellingPrice(entries, null, "9.99")).toBe("12.00");
  });

  it("ignores an entry scheduled in the future", () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const entries = [
      sellingPrice({ id: "sp-current", price: "10.00", effectiveAt: new Date("2026-08-01") }),
      sellingPrice({ id: "sp-future", price: "15.00", effectiveAt: future as any }),
    ];
    expect(resolveCurrentSellingPrice(entries, null, "9.99")).toBe("10.00");
  });

  it("scopes resolution to the given variantId", () => {
    const entries = [
      sellingPrice({ id: "sp-parent", variantId: null, price: "10.00" }),
      sellingPrice({ id: "sp-variant", variantId: "variant-1", price: "20.00" }),
    ];
    expect(resolveCurrentSellingPrice(entries, "variant-1", "9.99")).toBe("20.00");
    expect(resolveCurrentSellingPrice(entries, "variant-2", "9.99")).toBe("9.99");
  });
});

describe("sortSellingPricesDesc", () => {
  it("sorts by effectiveAt desc, then createdAt desc on ties", () => {
    const entries = [
      sellingPrice({ id: "a", effectiveAt: new Date("2026-08-01"), createdAt: new Date("2026-08-01T08:00:00Z") }),
      sellingPrice({ id: "b", effectiveAt: new Date("2026-08-01"), createdAt: new Date("2026-08-01T09:00:00Z") }),
      sellingPrice({ id: "c", effectiveAt: new Date("2026-08-05"), createdAt: new Date("2026-08-05T00:00:00Z") }),
    ];
    expect(sortSellingPricesDesc(entries).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});

describe("sortPurchasesDesc", () => {
  it("sorts by purchaseDate desc, then createdAt desc on ties", () => {
    const purchase = (overrides: Partial<PurchaseEntry>): PurchaseEntry => ({
      id: "p",
      variantId: null,
      quantity: 1,
      unitPurchasePrice: "1.00",
      purchaseCurrency: "XOF",
      conversionRate: "1.00",
      referenceCurrency: "XOF",
      unitCostConverted: "1.00",
      supplierId: null,
      purchaseDate: new Date("2026-08-01"),
      createdByUserId: "user-1",
      createdAt: new Date("2026-08-01"),
      ...overrides,
    });
    const entries = [
      purchase({ id: "a", purchaseDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T08:00:00Z") }),
      purchase({ id: "b", purchaseDate: new Date("2026-08-01"), createdAt: new Date("2026-08-01T09:00:00Z") }),
      purchase({ id: "c", purchaseDate: new Date("2026-08-05"), createdAt: new Date("2026-08-05T00:00:00Z") }),
    ];
    expect(sortPurchasesDesc(entries).map((e) => e.id)).toEqual(["c", "b", "a"]);
  });
});
```

- [x] **Step 2: Lancer les tests et vérifier l'échec**

Run: `cd backend && npx jest product-pricing-history.spec.ts`
Expected: FAIL — le module `./product-pricing-history` n'existe pas.

- [x] **Step 3: Implémenter**

Créer `backend/src/modules/products/product-pricing-history.ts` :

```ts
import type { PurchaseEntry, SellingPriceEntry } from "@shared/schema";

export function resolveCurrentSellingPrice(
  sellingPrices: SellingPriceEntry[] | undefined,
  variantId: string | null,
  fallback: string
): string {
  const now = Date.now();
  const candidates = (sellingPrices ?? [])
    .filter((entry) => (entry.variantId ?? null) === variantId)
    .filter((entry) => new Date(entry.effectiveAt).getTime() <= now)
    .sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime());
  return candidates[0] ? String(candidates[0].price) : fallback;
}

export function sortSellingPricesDesc(entries: SellingPriceEntry[]): SellingPriceEntry[] {
  return [...entries].sort((a, b) => {
    const byEffectiveAt = new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime();
    if (byEffectiveAt !== 0) return byEffectiveAt;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export function sortPurchasesDesc(entries: PurchaseEntry[]): PurchaseEntry[] {
  return [...entries].sort((a, b) => {
    const byPurchaseDate = new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
    if (byPurchaseDate !== 0) return byPurchaseDate;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}
```

- [x] **Step 4: Lancer les tests et vérifier le succès**

Run: `cd backend && npx jest product-pricing-history.spec.ts`
Expected: PASS.

- [x] **Step 5: Brancher dans `calculateProductPrice` (le "point d'entrée unique" du spec section 2)**

Dans `backend/src/modules/products/products.repository.ts`, ajouter l'import en tête de fichier :

```ts
import { resolveCurrentSellingPrice } from "./product-pricing-history";
```

Puis remplacer les deux dernières lignes de `calculateProductPrice` (`products.repository.ts:687-688`) :

```ts
    if (rules[0]) return { price: String(rules[0].price), rule: rules[0] };
    return { price: String(variant?.price ?? product.price) };
```

par :

```ts
    if (rules[0]) return { price: String(rules[0].price), rule: rules[0] };
    const fallback = String(variant?.price ?? product.price);
    return { price: resolveCurrentSellingPrice(product.sellingPrices, variantId ?? null, fallback) };
```

- [x] **Step 6: Écrire un test de régression pour ce branchement**

Ajouter dans `backend/src/modules/products/products.repository.spec.ts`, dans le bloc `describe("calculateProductPrice", ...)` existant (le créer s'il n'existe pas encore autour des tests de `pricingRules`) :

```ts
it("prefers a dated selling price over the static product.price when no pricing rule matches", async () => {
  const db = {
    get: jest.fn().mockResolvedValue({
      _id: "product:product-1",
      id: "product-1",
      tenantId: "tenant-1",
      price: "9.99",
      pricingRules: [],
      variants: [],
      sellingPrices: [
        {
          id: "sp-1",
          variantId: null,
          price: "12.50",
          effectiveAt: new Date("2026-08-01").toISOString(),
          createdByUserId: "user-1",
          createdAt: new Date("2026-08-01").toISOString(),
        },
      ],
    }),
  };
  const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
  const repository = new ProductsRepository(couchDBService as any);

  const result = await repository.calculateProductPrice("tenant-1", "product-1", 1);

  expect(result).toEqual({ price: "12.50" });
});
```

- [x] **Step 7: Lancer les tests et vérifier le succès**

Run: `cd backend && npx jest products.repository.spec.ts -t calculateProductPrice`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add backend/src/modules/products/product-pricing-history.ts backend/src/modules/products/product-pricing-history.spec.ts backend/src/modules/products/products.repository.ts backend/src/modules/products/products.repository.spec.ts
git commit -m "feat: resolve current selling price from history in calculateProductPrice"
```

---

### Task 4: Miroir frontend — `resolveProductPrice.ts`

**Files:**
- Modify: `frontend/src/lib/resolveProductPrice.ts`
- Modify: `frontend/src/lib/resolveProductPrice.test.ts`

**Interfaces:**
- Consumes: `SellingPriceEntry` (Tâche 1, frontend).
- Produces: `ProductWithPricing.sellingPrices?: SellingPriceEntry[]` ; comportement de repli mis à jour dans `resolveProductPrice`.

Ce fichier documente déjà dans son commentaire d'en-tête qu'il doit rester un miroir manuel exact du calcul backend ("Keeping this in sync with the backend algorithm is what makes an offline-computed sale total match what SalesService.resolveAndVerify recomputes on sync") — c'est pour ça qu'il n'importe pas `product-pricing-history.ts` du backend et duplique la logique localement, comme il le fait déjà pour `pricingRules`.

- [x] **Step 1: Écrire le test qui échoue**

Ajouter dans `frontend/src/lib/resolveProductPrice.test.ts` :

```ts
it("prefers a dated selling price over product.price when no pricing rule matches", () => {
  const p = product({
    price: "9.99",
    sellingPrices: [
      {
        id: "sp-1",
        variantId: null,
        price: "12.50",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        createdByUserId: "user-1",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  });

  expect(resolveProductPrice(p, 1)).toEqual({ price: "12.50" });
});

it("ignores a selling price scheduled in the future", () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const p = product({
    price: "9.99",
    sellingPrices: [
      {
        id: "sp-1",
        variantId: null,
        price: "15.00",
        effectiveAt: future,
        createdByUserId: "user-1",
        createdAt: future,
      },
    ],
  });

  expect(resolveProductPrice(p, 1)).toEqual({ price: "9.99" });
});
```

- [x] **Step 2: Lancer les tests et vérifier l'échec**

Run: `cd frontend && npx vitest run src/lib/resolveProductPrice.test.ts`
Expected: FAIL — `sellingPrices` n'existe pas sur le type `ProductWithPricing`, le prix résolu reste `"9.99"` au lieu de `"12.50"`.

- [x] **Step 3: Implémenter**

Dans `frontend/src/lib/resolveProductPrice.ts`, mettre à jour l'import et le type :

```ts
import type { Product, ProductPricing, ProductVariant, SellingPriceEntry } from "@shared/schema";

export type ProductWithPricing = Product & {
  variants?: ProductVariant[];
  pricingRules?: ProductPricing[];
  sellingPrices?: SellingPriceEntry[];
};
```

Ajouter, avant `resolveProductPrice` :

```ts
function resolveCurrentSellingPrice(
  sellingPrices: SellingPriceEntry[] | undefined,
  variantId: string | undefined,
  fallback: string
): string {
  const now = Date.now();
  const candidates = (sellingPrices ?? [])
    .filter((entry) => (entry.variantId ?? undefined) === variantId)
    .filter((entry) => new Date(entry.effectiveAt).getTime() <= now)
    .sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime());
  return candidates[0] ? String(candidates[0].price) : fallback;
}
```

Puis remplacer la dernière ligne de `resolveProductPrice` :

```ts
  if (rules[0]) {
    return { price: String(rules[0].price), rule: rules[0] };
  }
  return { price: String(variant?.price ?? product.price) };
```

par :

```ts
  if (rules[0]) {
    return { price: String(rules[0].price), rule: rules[0] };
  }
  const fallback = String(variant?.price ?? product.price);
  return { price: resolveCurrentSellingPrice(product.sellingPrices, variantId, fallback) };
```

- [x] **Step 4: Lancer les tests et vérifier le succès**

Run: `cd frontend && npx vitest run src/lib/resolveProductPrice.test.ts`
Expected: PASS (tous les tests, y compris les préexistants).

- [x] **Step 5: Commit**

```bash
git add frontend/src/lib/resolveProductPrice.ts frontend/src/lib/resolveProductPrice.test.ts
git commit -m "feat: resolve current selling price from history in the offline price mirror"
```

---

### Task 5: `ProductsRepository` — validation section 3.5, `sellingPrices` CRUD embarqué

**Files:**
- Modify: `backend/src/modules/products/products.repository.ts`
- Modify: `backend/src/modules/products/products.repository.spec.ts`

**Interfaces:**
- Consumes: `sortSellingPricesDesc` (Tâche 3), `BadRequestException`/`NotFoundException` (`@nestjs/common`), `VariantNotFoundException` (déjà importé).
- Produces: `ProductsRepository.getSellingPrices(productId, tenantId, variantId: string | null): Promise<SellingPriceEntry[]>`, `ProductsRepository.addSellingPrice(productId, tenantId, data): Promise<SellingPriceEntry>`, méthode privée `assertVariantScope(product, variantId): string | null` (réutilisée par la Tâche 8).

- [x] **Step 1: Écrire les tests qui échouent**

Ajouter dans `backend/src/modules/products/products.repository.spec.ts` un nouveau bloc :

```ts
describe("sellingPrices", () => {
  function dbWithProduct(product: Record<string, unknown>) {
    const state = { doc: { _rev: "1-a", ...product } };
    return {
      get: jest.fn().mockImplementation(() => Promise.resolve(state.doc)),
      insert: jest.fn().mockImplementation((doc: any) => {
        state.doc = { ...doc, _rev: `${Number(state.doc._rev.split("-")[0]) + 1}-b` };
        return Promise.resolve({ ok: true, rev: state.doc._rev });
      }),
    };
  }

  it("rejects a variantId on a product without variants", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      variants: [], sellingPrices: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    await expect(
      repository.addSellingPrice("p1", "tenant-1", {
        variantId: "variant-x", price: "10.00", createdByUserId: "user-1",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a missing variantId on a product with variants", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      variants: [{ id: "variant-1", isActive: true }], sellingPrices: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    await expect(
      repository.addSellingPrice("p1", "tenant-1", { price: "10.00", createdByUserId: "user-1" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an unknown variantId with VariantNotFoundException", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      variants: [{ id: "variant-1", isActive: true }], sellingPrices: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    await expect(
      repository.addSellingPrice("p1", "tenant-1", {
        variantId: "variant-unknown", price: "10.00", createdByUserId: "user-1",
      })
    ).rejects.toBeInstanceOf(VariantNotFoundException);
  });

  it("appends a new selling price entry and returns it sorted on read", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      variants: [], sellingPrices: [
        { id: "sp-old", variantId: null, price: "9.00", effectiveAt: "2026-08-01T00:00:00.000Z", createdByUserId: "user-1", createdAt: "2026-08-01T00:00:00.000Z" },
      ],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    const created = await repository.addSellingPrice("p1", "tenant-1", {
      price: "12.00", createdByUserId: "user-2", effectiveAt: "2026-08-10T00:00:00.000Z",
    });
    expect(created).toMatchObject({ variantId: null, price: "12.00", createdByUserId: "user-2" });

    const history = await repository.getSellingPrices("p1", "tenant-1", null);
    expect(history.map((e) => e.id)).toEqual([created.id, "sp-old"]);
  });

  it("replays the same client-supplied id idempotently instead of duplicating", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      variants: [], sellingPrices: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    const first = await repository.addSellingPrice("p1", "tenant-1", {
      id: "sp-fixed", price: "10.00", createdByUserId: "user-1",
    });
    const second = await repository.addSellingPrice("p1", "tenant-1", {
      id: "sp-fixed", price: "999.00", createdByUserId: "user-1",
    });

    expect(second).toEqual(first);
    const history = await repository.getSellingPrices("p1", "tenant-1", null);
    expect(history).toHaveLength(1);
  });
});
```

- [x] **Step 2: Lancer les tests et vérifier l'échec**

Run: `cd backend && npx jest products.repository.spec.ts -t sellingPrices`
Expected: FAIL — `repository.addSellingPrice is not a function`.

- [x] **Step 3: Implémenter**

Dans `backend/src/modules/products/products.repository.ts`, ajouter `BadRequestException` à l'import `@nestjs/common` existant, et `sortSellingPricesDesc` :

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
// ...
import { sortSellingPricesDesc } from "./product-pricing-history";
```

Dans `create()`, sur le `db.insert` initial (`products.repository.ts:80-90`), ajouter les deux tableaux vides à côté de `variants: []`/`pricingRules: []` :

```ts
        variants: [],
        pricingRules: [],
        sellingPrices: [],
        purchases: [],
```

Ajouter les méthodes publiques (à la suite de `getPricing`/`createPricing`, par exemple juste avant `getProductAnalytics`) :

```ts
  async getSellingPrices(
    productId: string,
    tenantId: string,
    variantId: string | null = null
  ): Promise<any[]> {
    const product = await this.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Product not found");
    return sortSellingPricesDesc(
      (product.sellingPrices ?? []).filter(
        (entry: any) => (entry.variantId ?? null) === variantId
      )
    );
  }

  async addSellingPrice(productId: string, tenantId: string, data: any): Promise<any> {
    const entryId = data.id ?? randomUUID();
    // Cheap pre-check so a sequential offline retry (the common case) never
    // triggers a redundant patchProduct write. The identical check stays
    // inside the patch callback below as a safety net for the rare case of
    // two concurrent requests racing between this read and that write.
    const existingProduct = await this.findById(productId, tenantId);
    if (!existingProduct) throw new NotFoundException("Product not found");
    const alreadyPresent = (existingProduct.sellingPrices ?? []).find(
      (entry: any) => entry.id === entryId
    );
    if (alreadyPresent) return alreadyPresent;

    let result: any;
    await this.patchProduct(productId, tenantId, (product) => {
      const existing = (product.sellingPrices ?? []).find((entry: any) => entry.id === entryId);
      if (existing) {
        result = existing;
        return {};
      }
      const variantId = this.assertVariantScope(product, data.variantId ?? null);
      const entry = {
        id: entryId,
        variantId,
        price: Number(data.price).toFixed(2),
        effectiveAt: data.effectiveAt
          ? new Date(data.effectiveAt).toISOString()
          : new Date().toISOString(),
        createdByUserId: data.createdByUserId,
        createdAt: new Date().toISOString(),
      };
      result = entry;
      return { sellingPrices: [...(product.sellingPrices ?? []), entry] };
    });
    return result;
  }
```

Et la méthode privée partagée (section 3.5 du spec), par exemple juste avant `private aggregateVariantStock` :

```ts
  /**
   * Section 3.5 du spec : un produit à variantes n'a jamais d'entrée
   * (sellingPrices/purchases) au niveau parent, un produit simple n'en a
   * jamais au niveau variante. Retourne le variantId normalisé (null si
   * produit simple) ou lève.
   */
  private assertVariantScope(
    product: Record<string, any>,
    variantId: string | null | undefined
  ): string | null {
    const hasVariants = (product.variants ?? []).some((v: any) => v.isActive !== false);
    if (!hasVariants) {
      if (variantId) {
        throw new BadRequestException(
          "This product has no variants; variantId must be omitted"
        );
      }
      return null;
    }
    if (!variantId) {
      throw new BadRequestException(
        "This product has variants; variantId is required"
      );
    }
    const variant = (product.variants ?? []).find(
      (v: any) => v.id === variantId && v.isActive !== false
    );
    if (!variant) {
      throw new VariantNotFoundException(variantId, product.id);
    }
    return variantId;
  }
```

- [x] **Step 4: Lancer les tests et vérifier le succès**

Run: `cd backend && npx jest products.repository.spec.ts`
Expected: PASS (y compris les tests préexistants — vérifier qu'aucun n'a régressé avec l'ajout de `sellingPrices: []`/`purchases: []` dans `create()`).

- [x] **Step 5: Commit**

```bash
git add backend/src/modules/products/products.repository.ts backend/src/modules/products/products.repository.spec.ts
git commit -m "feat: add embedded selling price CRUD with variant-scope validation"
```

---

### Task 6: DTO, service et routes pour l'historique de prix de vente

**Files:**
- Create: `backend/src/modules/products/dto/product-selling-price.dto.ts`
- Modify: `backend/src/modules/products/products.service.ts`
- Modify: `backend/src/modules/products/products.controller.ts`
- Test: `backend/src/modules/products/products-selling-prices.spec.ts`

**Interfaces:**
- Consumes: `ProductsRepository.getSellingPrices`/`addSellingPrice` (Tâche 5).
- Produces: `CreateSellingPriceDto`, `ProductsService.getSellingPrices(productId, tenantId, variantId?): Promise<SellingPriceEntry[]>`, `ProductsService.addSellingPrice(productId, tenantId, dto, userId): Promise<SellingPriceEntry>`, routes `GET /api/products/selling-prices/:productId`, `POST /api/products/:productId/selling-prices`.

- [x] **Step 1: Écrire le test qui échoue (niveau service)**

Créer `backend/src/modules/products/products-selling-prices.spec.ts` :

```ts
import { ProductsService } from "./products.service";

describe("ProductsService selling prices", () => {
  const tenantId = "tenant-a";

  function setup() {
    const entry = { id: "sp-1", variantId: null, price: "12.00", createdByUserId: "user-1" };
    const embedded = {
      getSellingPrices: jest.fn().mockResolvedValue([entry]),
      addSellingPrice: jest.fn().mockResolvedValue(entry),
    };
    const products = {};
    return {
      service: new ProductsService(embedded as any, products as any),
      embedded,
      entry,
    };
  }

  it("delegates read to the repository with the requested variantId", async () => {
    const { service, embedded } = setup();
    await service.getSellingPrices("product-1", tenantId, "variant-1");
    expect(embedded.getSellingPrices).toHaveBeenCalledWith("product-1", tenantId, "variant-1");
  });

  it("defaults the read variantId to null when omitted", async () => {
    const { service, embedded } = setup();
    await service.getSellingPrices("product-1", tenantId);
    expect(embedded.getSellingPrices).toHaveBeenCalledWith("product-1", tenantId, null);
  });

  it("stamps the authenticated user as createdByUserId when adding an entry", async () => {
    const { service, embedded } = setup();
    await service.addSellingPrice(
      "product-1",
      tenantId,
      { price: 12 } as any,
      "user-42"
    );
    expect(embedded.addSellingPrice).toHaveBeenCalledWith("product-1", tenantId, {
      price: 12,
      createdByUserId: "user-42",
    });
  });
});
```

- [x] **Step 2: Lancer le test et vérifier l'échec**

Run: `cd backend && npx jest products-selling-prices.spec.ts`
Expected: FAIL — `service.getSellingPrices is not a function`.

- [x] **Step 3: Créer le DTO**

Créer `backend/src/modules/products/dto/product-selling-price.dto.ts` :

```ts
import { Transform, Type } from "class-transformer";
import { IsDate, IsNumber, IsOptional, IsString, Min } from "class-validator";

const optionalDate = ({ value }: { value: unknown }) =>
  value === "" || value === null || value === undefined
    ? undefined
    : new Date(value as string | number | Date);

export class CreateSellingPriceDto {
  @IsOptional()
  @IsString()
  id?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  price: number;

  @IsOptional()
  @IsString()
  variantId?: string | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  effectiveAt?: Date;
}
```

- [x] **Step 4: Implémenter le service**

Dans `backend/src/modules/products/products.service.ts`, ajouter l'import du DTO et les deux méthodes, à la suite de `deleteProductPricing` :

```ts
import type { CreateSellingPriceDto } from "./dto/product-selling-price.dto";
```

```ts
  async getSellingPrices(
    productId: string,
    tenantId: string,
    variantId?: string | null
  ) {
    return this.embeddedRepository.getSellingPrices(productId, tenantId, variantId ?? null);
  }

  async addSellingPrice(
    productId: string,
    tenantId: string,
    data: CreateSellingPriceDto,
    userId: string
  ) {
    return this.embeddedRepository.addSellingPrice(productId, tenantId, {
      ...data,
      createdByUserId: userId,
    });
  }
```

- [x] **Step 5: Lancer le test et vérifier le succès**

Run: `cd backend && npx jest products-selling-prices.spec.ts`
Expected: PASS.

- [x] **Step 6: Ajouter les routes contrôleur**

Dans `backend/src/modules/products/products.controller.ts`, importer `CreateSellingPriceDto` et ajouter les deux routes dans le bloc "Product Pricing — MUST be before generic :id routes" (juste avant `@Get("pricing/:productId")`, pour rester avant les routes génériques `:id`/`:tenantId`) :

```ts
import { CreateSellingPriceDto } from "./dto/product-selling-price.dto";
```

```ts
  // Selling price history - MUST be before generic :id routes
  @Get("selling-prices/:productId")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getSellingPrices(
    @Param("productId") productId: string,
    @Query("variantId") variantId: string | undefined,
    @Request() req: any
  ) {
    return this.productsService.getSellingPrices(productId, this.tenantId(req), variantId ?? null);
  }

  @Post(":productId/selling-prices")
  @CheckPolicy(ProductsPolicy, "create")
  async addSellingPrice(
    @Param("productId") productId: string,
    @Body() dto: CreateSellingPriceDto,
    @Request() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.productsService.addSellingPrice(productId, this.tenantId(req), dto, userId);
  }
```

- [x] **Step 7: Vérifier la compilation et les tests du module**

Run: `cd backend && npx jest products`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add backend/src/modules/products/dto/product-selling-price.dto.ts backend/src/modules/products/products.service.ts backend/src/modules/products/products.controller.ts backend/src/modules/products/products-selling-prices.spec.ts
git commit -m "feat: expose selling price history read/write routes"
```

---

### Task 7: `purchaseId` sur `StockMovement` — persistance

**Files:**
- Modify: `backend/src/modules/stock/stock.repository.ts`
- Modify: `backend/src/modules/stock/stock.service.ts`
- Modify: `backend/src/modules/products/products.service.ts:175-189` (mouvement construit par `updateVariant`)
- Test: `backend/src/modules/stock/stock.repository.spec.ts`

**Interfaces:**
- Consumes: `StockMovement.purchaseId` (Tâche 1).
- Produces: `purchaseId` persisté par `StockRepository.recordRequired`/`record` (consommé par la Tâche 9).

- [x] **Step 1: Écrire le test qui échoue**

Ajouter dans `backend/src/modules/stock/stock.repository.spec.ts`, à la suite d'un test existant sur `recordRequired` :

```ts
it("persists purchaseId on the stored movement document", async () => {
  const db = { insert: jest.fn().mockResolvedValue({ ok: true }) };
  const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
  const repository = new StockRepository(couchDBService as any);

  await repository.recordRequired({
    id: "movement-1",
    productId: "product-1",
    variantId: null,
    type: "entry",
    quantity: 10,
    previousQuantity: 0,
    newQuantity: 10,
    reason: "purchase",
    priceType: null,
    unitPrice: "5.00",
    purchaseId: "purchase-1",
    userId: "user-1",
    tenantId: "tenant-1",
    createdAt: new Date("2026-08-16T00:00:00.000Z"),
  } as any);

  expect(db.insert).toHaveBeenCalledWith(
    expect.objectContaining({ purchaseId: "purchase-1" })
  );
});
```

- [x] **Step 2: Lancer le test et vérifier l'échec**

Run: `cd backend && npx jest stock.repository.spec.ts -t purchaseId`
Expected: FAIL — la propriété `purchaseId` est absente du document inséré.

- [x] **Step 3: Implémenter**

Dans `backend/src/modules/stock/stock.repository.ts`, sur `private toDocument`, ajouter le champ :

```ts
  private toDocument(movement: StockMovement) {
    return {
      type: "stock_movement" as const,
      productId: movement.productId,
      variantId: movement.variantId ?? null,
      movementType: movement.type,
      quantity: movement.quantity,
      previousQuantity: movement.previousQuantity,
      newQuantity: movement.newQuantity,
      reason: movement.reason ?? null,
      priceType: movement.priceType ?? null,
      unitPrice: movement.unitPrice ?? null,
      purchaseId: movement.purchaseId ?? null,
      userId: movement.userId ?? null,
      tenantId: movement.tenantId,
      createdAt: movement.createdAt.toISOString(),
    };
  }
```

- [x] **Step 4: Lancer le test et vérifier le succès**

Run: `cd backend && npx jest stock.repository.spec.ts`
Expected: PASS.

- [x] **Step 5: Corriger les deux sites qui construisent un `StockMovement` littéral**

`purchaseId` étant désormais un champ requis de l'interface `StockMovement` (Tâche 1), les deux constructions `as StockMovement` existantes doivent l'inclure pour compiler.

Dans `backend/src/modules/stock/stock.service.ts`, sur l'objet `movement` construit dans `private async adjust(...)` :

```ts
    const movement = {
      id: randomUUID(),
      productId,
      variantId,
      type,
      quantity: Math.abs(delta),
      previousQuantity: result.previousQuantity,
      newQuantity: result.newQuantity,
      reason: reason || null,
      priceType: null,
      unitPrice: null,
      purchaseId: null,
      userId,
      tenantId,
      createdAt: new Date(),
    } as StockMovement;
```

Dans `backend/src/modules/products/products.service.ts`, sur l'objet passé à `this.stockRepository.recordRequired` dans `updateVariant` :

```ts
          await this.stockRepository.recordRequired({
            id: randomUUID(),
            productId: existing.productId,
            variantId: id,
            type: delta > 0 ? "entry" : "exit",
            quantity: Math.abs(delta),
            previousQuantity,
            newQuantity,
            reason: "Stock correction from variant update",
            priceType: null,
            unitPrice: null,
            purchaseId: null,
            userId: null,
            tenantId,
            createdAt: new Date(),
          } as StockMovement);
```

- [x] **Step 6: Vérifier la compilation complète**

Run: `cd backend && npx tsc --noEmit`
Expected: aucune erreur (les deux échecs identifiés en Tâche 1 Step 2 sont maintenant résolus).

- [x] **Step 7: Lancer les suites stock et products**

Run: `cd backend && npx jest stock products.service.spec`
Expected: PASS — les assertions existantes utilisent `expect.objectContaining`, donc l'ajout de `purchaseId` ne casse aucun test préexistant.

- [x] **Step 8: Commit**

```bash
git add backend/src/modules/stock/stock.repository.ts backend/src/modules/stock/stock.service.ts backend/src/modules/products/products.service.ts backend/src/modules/stock/stock.repository.spec.ts
git commit -m "feat: persist purchaseId on stock movements"
```

---

### Task 8: `ProductsRepository` — CUMP, `addPurchase`, rollback

**Files:**
- Modify: `backend/src/modules/products/products.repository.ts`
- Modify: `backend/src/modules/products/products.repository.spec.ts`

**Interfaces:**
- Consumes: `assertVariantScope` (Tâche 5), `sortPurchasesDesc` (Tâche 3).
- Produces: `ProductsRepository.getPurchases(productId, tenantId, variantId): Promise<PurchaseEntry[]>`, `ProductsRepository.addPurchase(productId, tenantId, data): Promise<{ purchase: PurchaseEntry; variantId: string | null; previousQuantity: number; previousCost: string; newQuantity: number; newCost: string; alreadyApplied: boolean }>`, `ProductsRepository.revertPurchaseImpact(productId, tenantId, variantId, previousQuantity, previousCost): Promise<void>`.

**Note d'implémentation :** le spec section 4 suggère de réutiliser `adjustStock` pour la quantité séparément de la mise à jour du coût. Ce plan les combine dans une **seule** écriture `patchProduct` (coût + quantité + `purchases[]` en même temps) : deux écritures séparées sur le même document laisseraient une fenêtre où `cost` est mis à jour sans que la quantité le soit (ou l'inverse), visible par un lecteur concurrent — une seule transaction optimiste est strictement plus sûre et reste la responsabilité du même repository. `adjustStock` continue d'exister pour les entrées/sorties manuelles hors achat, inchangé.

- [x] **Step 1: Écrire les tests qui échouent**

Ajouter dans `backend/src/modules/products/products.repository.spec.ts` :

```ts
describe("purchases", () => {
  function dbWithProduct(product: Record<string, unknown>) {
    const state = { doc: { _rev: "1-a", ...product } };
    return {
      get: jest.fn().mockImplementation(() => Promise.resolve(state.doc)),
      insert: jest.fn().mockImplementation((doc: any) => {
        state.doc = { ...doc, _rev: `${Number(state.doc._rev.split("-")[0]) + 1}-b` };
        return Promise.resolve({ ok: true, rev: state.doc._rev });
      }),
    };
  }

  it("computes CUMP against currentQuantity=0 as a straight passthrough", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      cost: "0.00", stocks: { quantity: 0, reservedQuantity: 0 },
      variants: [], purchases: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    const result = await repository.addPurchase("p1", "tenant-1", {
      quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF",
      conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
    });

    expect(result.newCost).toBe("2000.00");
    expect(result.newQuantity).toBe(100);
    expect(result.previousQuantity).toBe(0);
    expect(result.previousCost).toBe("0.00");
  });

  it("computes the weighted average cost against existing stock", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      cost: "1000.00", stocks: { quantity: 10, reservedQuantity: 0 },
      variants: [], purchases: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    const result = await repository.addPurchase("p1", "tenant-1", {
      quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF",
      conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
    });

    // (10*1000 + 100*2000) / 110 = 1909.09
    expect(result.newCost).toBe("1909.09");
    expect(result.previousCost).toBe("1000.00");
    expect(result.previousQuantity).toBe(10);
  });

  it("scopes CUMP to the targeted variant without touching sibling variants", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      variants: [
        { id: "variant-m", isActive: true, quantity: 10, cost: "1000.00" },
        { id: "variant-l", isActive: true, quantity: 5, cost: "1200.00" },
      ],
      purchases: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    const result = await repository.addPurchase("p1", "tenant-1", {
      variantId: "variant-m", quantity: 100, unitPurchasePrice: 2000,
      purchaseCurrency: "XOF", conversionRate: 1, referenceCurrency: "XOF",
      createdByUserId: "user-1",
    });

    expect(result.newCost).toBe("1909.09");
    const untouched = await repository.findById("p1", "tenant-1");
    expect(untouched.variants.find((v: any) => v.id === "variant-l")).toMatchObject({
      cost: "1200.00", quantity: 5,
    });
  });

  it("rejects a purchase without variantId on a product with variants", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      variants: [{ id: "variant-1", isActive: true, quantity: 0, cost: "0.00" }],
      purchases: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    await expect(
      repository.addPurchase("p1", "tenant-1", {
        quantity: 10, unitPurchasePrice: 100, purchaseCurrency: "XOF",
        conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("replays the same client-supplied id idempotently instead of duplicating", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      cost: "1000.00", stocks: { quantity: 10, reservedQuantity: 0 },
      variants: [], purchases: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    const first = await repository.addPurchase("p1", "tenant-1", {
      id: "purchase-fixed", quantity: 100, unitPurchasePrice: 2000,
      purchaseCurrency: "XOF", conversionRate: 1, referenceCurrency: "XOF",
      createdByUserId: "user-1",
    });
    const second = await repository.addPurchase("p1", "tenant-1", {
      id: "purchase-fixed", quantity: 999, unitPurchasePrice: 1, purchaseCurrency: "XOF",
      conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
    });

    expect(second.alreadyApplied).toBe(true);
    expect(second.purchase).toEqual(first.purchase);
    const product = await repository.findById("p1", "tenant-1");
    expect(product.purchases).toHaveLength(1);
    expect(product.stocks.quantity).toBe(110);
  });

  it("restores quantity and cost on revertPurchaseImpact, leaving purchases untouched", async () => {
    const db = dbWithProduct({
      _id: "product:p1", id: "p1", type: "product", tenantId: "tenant-1",
      cost: "1000.00", stocks: { quantity: 10, reservedQuantity: 0 },
      variants: [], purchases: [],
    });
    const couchDBService = { getDatabase: jest.fn().mockResolvedValue(db) };
    const repository = new ProductsRepository(couchDBService as any);

    const result = await repository.addPurchase("p1", "tenant-1", {
      quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF",
      conversionRate: 1, referenceCurrency: "XOF", createdByUserId: "user-1",
    });
    await repository.revertPurchaseImpact(
      "p1", "tenant-1", result.variantId, result.previousQuantity, result.previousCost
    );

    const product = await repository.findById("p1", "tenant-1");
    expect(product.cost).toBe("1000.00");
    expect(product.stocks.quantity).toBe(10);
    expect(product.purchases).toHaveLength(1); // l'achat reste dans l'historique
  });
});
```

- [x] **Step 2: Lancer les tests et vérifier l'échec**

Run: `cd backend && npx jest products.repository.spec.ts -t purchases`
Expected: FAIL — `repository.addPurchase is not a function`.

- [x] **Step 3: Implémenter**

Ajouter l'import de `sortPurchasesDesc` (à côté de `sortSellingPricesDesc` déjà importé, Tâche 5) :

```ts
import { resolveCurrentSellingPrice, sortPurchasesDesc, sortSellingPricesDesc } from "./product-pricing-history";
```

Ajouter les trois méthodes, à la suite de `addSellingPrice` :

```ts
  async getPurchases(
    productId: string,
    tenantId: string,
    variantId: string | null = null
  ): Promise<any[]> {
    const product = await this.findById(productId, tenantId);
    if (!product) throw new NotFoundException("Product not found");
    return sortPurchasesDesc(
      (product.purchases ?? []).filter(
        (entry: any) => (entry.variantId ?? null) === variantId
      )
    );
  }

  async addPurchase(productId: string, tenantId: string, data: any): Promise<{
    purchase: any;
    variantId: string | null;
    previousQuantity: number;
    previousCost: string;
    newQuantity: number;
    newCost: string;
    alreadyApplied: boolean;
  }> {
    const entryId = data.id ?? randomUUID();
    // Same pre-check as addSellingPrice: avoids a redundant patchProduct
    // write on a sequential offline retry, while the identical check inside
    // the patch callback below still guards the rare concurrent-race case.
    const existingProduct = await this.findById(productId, tenantId);
    if (!existingProduct) throw new NotFoundException("Product not found");
    const alreadyPresent = (existingProduct.purchases ?? []).find(
      (entry: any) => entry.id === entryId
    );
    if (alreadyPresent) {
      return {
        purchase: alreadyPresent,
        variantId: alreadyPresent.variantId,
        previousQuantity: 0,
        previousCost: "0.00",
        newQuantity: 0,
        newCost: "0.00",
        alreadyApplied: true,
      };
    }

    let outcome!: {
      purchase: any;
      variantId: string | null;
      previousQuantity: number;
      previousCost: string;
      newQuantity: number;
      newCost: string;
      alreadyApplied: boolean;
    };

    await this.patchProduct(productId, tenantId, (product) => {
      const existing = (product.purchases ?? []).find((entry: any) => entry.id === entryId);
      if (existing) {
        outcome = {
          purchase: existing,
          variantId: existing.variantId,
          previousQuantity: 0,
          previousCost: "0.00",
          newQuantity: 0,
          newCost: "0.00",
          alreadyApplied: true,
        };
        return {};
      }

      const variantId = this.assertVariantScope(product, data.variantId ?? null);
      const variant = variantId
        ? (product.variants ?? []).find((v: any) => v.id === variantId)
        : null;
      const currentQuantity = variantId
        ? Number(variant?.quantity ?? 0)
        : Number(product.stocks?.quantity ?? 0);
      const currentCost = Number(variantId ? (variant?.cost ?? 0) : (product.cost ?? 0));
      const unitCostConverted = Number(
        (Number(data.unitPurchasePrice) * Number(data.conversionRate)).toFixed(2)
      );
      const newQuantity = currentQuantity + Number(data.quantity);
      const newCost =
        newQuantity === 0
          ? unitCostConverted
          : Number(
              (
                (currentQuantity * currentCost + Number(data.quantity) * unitCostConverted) /
                newQuantity
              ).toFixed(2)
            );

      const purchase = {
        id: entryId,
        variantId,
        quantity: Number(data.quantity),
        unitPurchasePrice: Number(data.unitPurchasePrice).toFixed(2),
        purchaseCurrency: data.purchaseCurrency,
        conversionRate: Number(data.conversionRate).toFixed(4),
        referenceCurrency: data.referenceCurrency,
        unitCostConverted: unitCostConverted.toFixed(2),
        supplierId: data.supplierId ?? null,
        purchaseDate: data.purchaseDate
          ? new Date(data.purchaseDate).toISOString()
          : new Date().toISOString(),
        createdByUserId: data.createdByUserId,
        createdAt: new Date().toISOString(),
      };

      outcome = {
        purchase,
        variantId,
        previousQuantity: currentQuantity,
        previousCost: currentCost.toFixed(2),
        newQuantity,
        newCost: newCost.toFixed(2),
        alreadyApplied: false,
      };

      const purchases = [...(product.purchases ?? []), purchase];
      if (variantId) {
        const variants = (product.variants ?? []).map((v: any) =>
          v.id === variantId
            ? { ...v, cost: newCost.toFixed(2), quantity: newQuantity, updatedAt: new Date().toISOString() }
            : v
        );
        return { purchases, variants, stocks: this.aggregateVariantStock(product, variants) };
      }
      return {
        purchases,
        cost: newCost.toFixed(2),
        stocks: {
          ...(product.stocks ?? {}),
          quantity: newQuantity,
          lastUpdated: new Date().toISOString(),
        },
      };
    });

    return outcome;
  }

  async revertPurchaseImpact(
    productId: string,
    tenantId: string,
    variantId: string | null,
    previousQuantity: number,
    previousCost: string
  ): Promise<void> {
    await this.patchProduct(productId, tenantId, (product) => {
      if (variantId) {
        const variants = (product.variants ?? []).map((v: any) =>
          v.id === variantId
            ? { ...v, cost: previousCost, quantity: previousQuantity, updatedAt: new Date().toISOString() }
            : v
        );
        return { variants, stocks: this.aggregateVariantStock(product, variants) };
      }
      return {
        cost: previousCost,
        stocks: {
          ...(product.stocks ?? {}),
          quantity: previousQuantity,
          lastUpdated: new Date().toISOString(),
        },
      };
    });
  }
```

- [x] **Step 4: Lancer les tests et vérifier le succès**

Run: `cd backend && npx jest products.repository.spec.ts`
Expected: PASS (toute la suite, y compris les tests des tâches précédentes).

- [x] **Step 5: Commit**

```bash
git add backend/src/modules/products/products.repository.ts backend/src/modules/products/products.repository.spec.ts
git commit -m "feat: add embedded purchase CUMP with idempotent replay and revert"
```

---

### Task 9: `ProductPurchasesService` — flux complet, normalisation, rollback

**Files:**
- Create: `backend/src/modules/products/dto/product-purchase.dto.ts`
- Create: `backend/src/modules/products/product-purchases.service.ts`
- Create: `backend/src/modules/products/product-purchases.service.spec.ts`
- Modify: `backend/src/modules/products/products.controller.ts`

**Interfaces:**
- Consumes: `SettingsService.getReferenceCurrency` (Tâche 2), `ProductsRepository.addPurchase`/`getPurchases`/`revertPurchaseImpact` (Tâche 8), `StockRepository.recordRequired` (existant, `purchaseId` Tâche 7).
- Produces: `CreatePurchaseDto`, `ProductPurchasesService.addPurchase(productId, tenantId, dto, userId): Promise<PurchaseEntry>`, `ProductPurchasesService.getPurchases(productId, tenantId, variantId?): Promise<PurchaseEntry[]>`, routes `GET /api/products/purchases/:productId`, `POST /api/products/:productId/purchases`.

- [x] **Step 1: Écrire les tests qui échouent**

Créer `backend/src/modules/products/product-purchases.service.spec.ts` :

```ts
import { ProductPurchasesService } from "./product-purchases.service";

describe("ProductPurchasesService", () => {
  const tenantId = "tenant-1";

  function setup(overrides: Partial<{ addPurchaseResult: any }> = {}) {
    const addPurchaseResult = overrides.addPurchaseResult ?? {
      purchase: { id: "purchase-1", quantity: 100, unitCostConverted: "2000.00", variantId: null },
      variantId: null,
      previousQuantity: 10,
      previousCost: "1000.00",
      newQuantity: 110,
      newCost: "1909.09",
      alreadyApplied: false,
    };
    const productsRepository = {
      addPurchase: jest.fn().mockResolvedValue(addPurchaseResult),
      getPurchases: jest.fn().mockResolvedValue([addPurchaseResult.purchase]),
      revertPurchaseImpact: jest.fn().mockResolvedValue(undefined),
    };
    const stockRepository = { recordRequired: jest.fn().mockResolvedValue(undefined) };
    const settingsService = { getReferenceCurrency: jest.fn().mockResolvedValue("XOF") };
    const service = new ProductPurchasesService(
      productsRepository as any,
      stockRepository as any,
      settingsService as any
    );
    return { service, productsRepository, stockRepository, settingsService, addPurchaseResult };
  }

  it("resolves the tenant reference currency and records the stock movement with purchaseId", async () => {
    const { service, productsRepository, stockRepository, settingsService } = setup();

    const result = await service.addPurchase(
      "product-1",
      tenantId,
      { quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "xof", conversionRate: 1 } as any,
      "user-1"
    );

    expect(settingsService.getReferenceCurrency).toHaveBeenCalledWith(tenantId);
    expect(productsRepository.addPurchase).toHaveBeenCalledWith(
      "product-1",
      tenantId,
      expect.objectContaining({ referenceCurrency: "XOF", createdByUserId: "user-1" })
    );
    expect(stockRepository.recordRequired).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: "product-1",
        type: "entry",
        quantity: 100,
        previousQuantity: 10,
        newQuantity: 110,
        reason: "purchase",
        unitPrice: "2000.00",
        purchaseId: "purchase-1",
      })
    );
    expect(result).toEqual(expect.objectContaining({ id: "purchase-1" }));
  });

  it("forces conversionRate to 1 when purchaseCurrency equals the reference currency", async () => {
    const { service, productsRepository } = setup();

    await service.addPurchase(
      "product-1",
      tenantId,
      { quantity: 10, unitPurchasePrice: 500, purchaseCurrency: "xof", conversionRate: 1.15 } as any,
      "user-1"
    );

    expect(productsRepository.addPurchase).toHaveBeenCalledWith(
      "product-1",
      tenantId,
      expect.objectContaining({ purchaseCurrency: "XOF", conversionRate: 1 })
    );
  });

  it("keeps the submitted conversionRate for a genuinely foreign currency", async () => {
    const { service, productsRepository } = setup();

    await service.addPurchase(
      "product-1",
      tenantId,
      { quantity: 10, unitPurchasePrice: 500, purchaseCurrency: "ngn", conversionRate: 1.15 } as any,
      "user-1"
    );

    expect(productsRepository.addPurchase).toHaveBeenCalledWith(
      "product-1",
      tenantId,
      expect.objectContaining({ purchaseCurrency: "NGN", conversionRate: 1.15 })
    );
  });

  it("rolls back quantity and cost when recording the stock movement fails", async () => {
    const { service, productsRepository, stockRepository } = setup();
    stockRepository.recordRequired.mockRejectedValue(new Error("CouchDB unavailable"));

    await expect(
      service.addPurchase(
        "product-1",
        tenantId,
        { quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF", conversionRate: 1 } as any,
        "user-1"
      )
    ).rejects.toThrow("CouchDB unavailable");

    expect(productsRepository.revertPurchaseImpact).toHaveBeenCalledWith(
      "product-1", tenantId, null, 10, "1000.00"
    );
  });

  it("still surfaces the original stock movement error even if the compensating revert itself fails", async () => {
    const { service, stockRepository, productsRepository } = setup();
    stockRepository.recordRequired.mockRejectedValue(new Error("CouchDB unavailable"));
    productsRepository.revertPurchaseImpact.mockRejectedValue(new Error("revert also failed"));

    await expect(
      service.addPurchase(
        "product-1",
        tenantId,
        { quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF", conversionRate: 1 } as any,
        "user-1"
      )
    ).rejects.toThrow("CouchDB unavailable");
  });

  it("skips the stock movement entirely on an idempotent replay", async () => {
    const { service, productsRepository, stockRepository } = setup({
      addPurchaseResult: {
        purchase: { id: "purchase-1", quantity: 100, unitCostConverted: "2000.00", variantId: null },
        variantId: null, previousQuantity: 0, previousCost: "0.00",
        newQuantity: 0, newCost: "0.00", alreadyApplied: true,
      },
    });

    await service.addPurchase(
      "product-1", tenantId,
      { id: "purchase-1", quantity: 100, unitPurchasePrice: 2000, purchaseCurrency: "XOF", conversionRate: 1 } as any,
      "user-1"
    );

    expect(stockRepository.recordRequired).not.toHaveBeenCalled();
    expect(productsRepository.revertPurchaseImpact).not.toHaveBeenCalled();
  });

  it("delegates read to the repository with the requested variantId", async () => {
    const { service, productsRepository } = setup();
    await service.getPurchases("product-1", tenantId, "variant-1");
    expect(productsRepository.getPurchases).toHaveBeenCalledWith("product-1", tenantId, "variant-1");
  });
});
```

- [x] **Step 2: Lancer les tests et vérifier l'échec**

Run: `cd backend && npx jest product-purchases.service.spec.ts`
Expected: FAIL — le module `./product-purchases.service` n'existe pas.

- [x] **Step 3: Créer le DTO**

Créer `backend/src/modules/products/dto/product-purchase.dto.ts` :

```ts
import { Transform, Type } from "class-transformer";
import { IsDate, IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

const optionalDate = ({ value }: { value: unknown }) =>
  value === "" || value === null || value === undefined
    ? undefined
    : new Date(value as string | number | Date);

export class CreatePurchaseDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsString()
  variantId?: string | null;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  unitPurchasePrice: number;

  @IsString()
  purchaseCurrency: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  conversionRate: number;

  @IsOptional()
  @IsString()
  supplierId?: string | null;

  @Transform(optionalDate)
  @IsDate()
  @IsOptional()
  purchaseDate?: Date;
}
```

- [x] **Step 4: Implémenter le service**

Créer `backend/src/modules/products/product-purchases.service.ts` :

```ts
import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import type { PurchaseEntry, StockMovement } from "@shared/schema";
import { ProductsRepository } from "./products.repository";
import { StockRepository } from "../stock/stock.repository";
import { SettingsService } from "../settings/settings.service";
import type { CreatePurchaseDto } from "./dto/product-purchase.dto";

@Injectable()
export class ProductPurchasesService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly stockRepository: StockRepository,
    private readonly settingsService: SettingsService
  ) {}

  async getPurchases(
    productId: string,
    tenantId: string,
    variantId?: string | null
  ): Promise<PurchaseEntry[]> {
    return this.productsRepository.getPurchases(productId, tenantId, variantId ?? null);
  }

  async addPurchase(
    productId: string,
    tenantId: string,
    dto: CreatePurchaseDto,
    userId: string
  ): Promise<PurchaseEntry> {
    const referenceCurrency = (await this.settingsService.getReferenceCurrency(tenantId))
      .trim()
      .toUpperCase();
    const purchaseCurrency = dto.purchaseCurrency.trim().toUpperCase();
    const conversionRate = purchaseCurrency === referenceCurrency ? 1 : dto.conversionRate;

    const result = await this.productsRepository.addPurchase(productId, tenantId, {
      id: dto.id,
      variantId: dto.variantId ?? null,
      quantity: dto.quantity,
      unitPurchasePrice: dto.unitPurchasePrice,
      purchaseCurrency,
      conversionRate,
      referenceCurrency,
      supplierId: dto.supplierId ?? null,
      purchaseDate: dto.purchaseDate,
      createdByUserId: userId,
    });

    if (result.alreadyApplied) {
      return result.purchase;
    }

    try {
      await this.stockRepository.recordRequired({
        id: randomUUID(),
        productId,
        variantId: result.variantId,
        type: "entry",
        quantity: result.purchase.quantity,
        previousQuantity: result.previousQuantity,
        newQuantity: result.newQuantity,
        reason: "purchase",
        priceType: null,
        unitPrice: result.purchase.unitCostConverted,
        purchaseId: result.purchase.id,
        userId,
        tenantId,
        createdAt: new Date(),
      } as StockMovement);
    } catch (error) {
      // Same guard as StockService.adjust()'s own compensating call: if the
      // revert itself fails too, swallow that second failure so the caller
      // still sees the original stock-movement error instead of a
      // misleading one from the rollback attempt.
      await this.productsRepository
        .revertPurchaseImpact(
          productId,
          tenantId,
          result.variantId,
          result.previousQuantity,
          result.previousCost
        )
        .catch(() => undefined);
      throw error;
    }

    return result.purchase;
  }
}
```

- [x] **Step 5: Lancer les tests et vérifier le succès**

Run: `cd backend && npx jest product-purchases.service.spec.ts`
Expected: PASS.

- [x] **Step 6: Ajouter les routes contrôleur**

Dans `backend/src/modules/products/products.controller.ts`, importer le nouveau service et le DTO, injecter le service dans le constructeur, et ajouter les deux routes juste après celles de `selling-prices` (Tâche 6) :

```ts
import { ProductPurchasesService } from "./product-purchases.service";
import { CreatePurchaseDto } from "./dto/product-purchase.dto";
```

```ts
  constructor(
    private readonly productsService: ProductsService,
    private readonly productsLockService: ProductsLockService,
    private readonly productPurchasesService: ProductPurchasesService
  ) {}
```

```ts
  // Purchases (approvisionnements) - MUST be before generic :id routes
  @Get("purchases/:productId")
  @CheckPolicy(ProductsPolicy, "view")
  @UseInterceptors(RoleDataFilterInterceptor)
  async getPurchases(
    @Param("productId") productId: string,
    @Query("variantId") variantId: string | undefined,
    @Request() req: any
  ) {
    return this.productPurchasesService.getPurchases(productId, this.tenantId(req), variantId ?? null);
  }

  @Post(":productId/purchases")
  @CheckPolicy(ProductsPolicy, "create")
  async addPurchase(
    @Param("productId") productId: string,
    @Body() dto: CreatePurchaseDto,
    @Request() req: any
  ) {
    const userId = req.user?.userId || req.user?.id;
    return this.productPurchasesService.addPurchase(productId, this.tenantId(req), dto, userId);
  }
```

- [x] **Step 7: Câbler `ProductPurchasesService` et `SettingsModule` dans `ProductsModule`**

Le contrôleur réclame maintenant `ProductPurchasesService` (Step 6 ci-dessus), qui dépend lui-même de `SettingsService` (Tâche 2) — sans cette étape, `ProductsModule` ne peut pas résoudre ses dépendances et l'application ne démarre plus à partir de ce commit. Modifier `backend/src/modules/products/products.module.ts` :

```ts
import { Module } from "@nestjs/common";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";
import { ProductsPolicy } from "./products.policy";
import { ProductsLockService } from "./products-lock.service";
import { ProductPurchasesService } from "./product-purchases.service";
import { AuthModule } from "../auth/auth.module";
import { StockModule } from "../stock/stock.module";
import { SettingsModule } from "../settings/settings.module";
import { ProductsRepositoryModule } from "./products.repository.module";
import { CouchDBModule } from "../../database/couchdb.module";

@Module({
  imports: [AuthModule, StockModule, SettingsModule, ProductsRepositoryModule, CouchDBModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductsPolicy, ProductsLockService, ProductPurchasesService],
  exports: [ProductsService],
})
export class ProductsModule {}
```

- [x] **Step 8: Vérifier que l'application résout ses dépendances**

Run: `cd backend && npx tsc --noEmit && npx jest products`
Expected: PASS. Si un test e2e ou `npm run start:dev` est disponible, le lancer aussi pour confirmer l'absence d'erreur `Nest can't resolve dependencies` — cette tâche est désormais celle qui rend l'app à nouveau bootable après l'ajout du contrôleur (voir Tâche 11, qui n'a plus qu'à faire la vérification finale).

- [x] **Step 9: Commit**

```bash
git add backend/src/modules/products/dto/product-purchase.dto.ts backend/src/modules/products/product-purchases.service.ts backend/src/modules/products/product-purchases.service.spec.ts backend/src/modules/products/products.controller.ts backend/src/modules/products/products.module.ts
git commit -m "feat: add purchase entry flow with CUMP rollback and currency normalization"
```

---

### Task 10: Rentabilité — helper pur backend + miroir frontend

**Files:**
- Create: `backend/src/modules/products/product-profitability.ts`
- Test: `backend/src/modules/products/product-profitability.spec.ts`
- Create: `frontend/src/lib/calculateProfitability.ts`
- Test: `frontend/src/lib/calculateProfitability.test.ts`

**Interfaces:**
- Produces: `calculateProfitability(currentSellingPrice: string, cost: string): { unitProfit: string; marginRate: string | null; markup: string | null }` (backend et frontend, implémentation identique).

**Note de portée :** le spec section 5 dit explicitement "pas par un nouvel endpoint séparé" et section 7 exclut toute UI de ce spec. Cette tâche livre donc uniquement le **helper de calcul pur**, testé indépendamment sur les deux côtés (comme `resolveProductPrice.ts`/Tâche 4 le fait déjà pour le prix) — son branchement dans une réponse HTTP précise ou un composant d'affichage revient à la spec "Interface produit" qui suit celle-ci. Le brancher prématurément dans un endpoint list (`findByTenant`/`search`) obligerait à transformer chaque document de ces trois chemins de lecture alors que rien ne les consomme encore, et n'atteindrait de toute façon pas le client offline qui lit le document CouchDB répliqué directement, sans passer par ces routes REST.

- [x] **Step 1: Écrire le test qui échoue (backend)**

Créer `backend/src/modules/products/product-profitability.spec.ts` :

```ts
import { calculateProfitability } from "./product-profitability";

describe("calculateProfitability", () => {
  it("computes profit, margin rate and markup for a normal case", () => {
    const result = calculateProfitability("15.00", "10.00");
    expect(result.unitProfit).toBe("5.00");
    expect(result.marginRate).toBe("0.3333");
    expect(result.markup).toBe("0.5000");
  });

  it("returns null margin rate when the selling price is zero", () => {
    const result = calculateProfitability("0.00", "10.00");
    expect(result.marginRate).toBeNull();
  });

  it("returns null markup when the cost is zero", () => {
    const result = calculateProfitability("15.00", "0.00");
    expect(result.markup).toBeNull();
    expect(result.unitProfit).toBe("15.00");
  });
});
```

- [x] **Step 2: Lancer le test et vérifier l'échec**

Run: `cd backend && npx jest product-profitability.spec.ts`
Expected: FAIL — le module n'existe pas.

- [x] **Step 3: Implémenter côté backend**

Créer `backend/src/modules/products/product-profitability.ts` :

```ts
export interface ProfitabilityResult {
  unitProfit: string;
  marginRate: string | null;
  markup: string | null;
}

export function calculateProfitability(
  currentSellingPrice: string,
  cost: string
): ProfitabilityResult {
  const price = Number(currentSellingPrice);
  const costValue = Number(cost);
  const unitProfit = price - costValue;
  return {
    unitProfit: unitProfit.toFixed(2),
    marginRate: price > 0 ? (unitProfit / price).toFixed(4) : null,
    markup: costValue > 0 ? (unitProfit / costValue).toFixed(4) : null,
  };
}
```

- [x] **Step 4: Lancer le test et vérifier le succès**

Run: `cd backend && npx jest product-profitability.spec.ts`
Expected: PASS.

- [x] **Step 5: Écrire le test qui échoue (frontend)**

Créer `frontend/src/lib/calculateProfitability.test.ts` :

```ts
import { describe, expect, it } from "vitest";
import { calculateProfitability } from "./calculateProfitability";

describe("calculateProfitability", () => {
  it("computes profit, margin rate and markup for a normal case", () => {
    const result = calculateProfitability("15.00", "10.00");
    expect(result.unitProfit).toBe("5.00");
    expect(result.marginRate).toBe("0.3333");
    expect(result.markup).toBe("0.5000");
  });

  it("returns null margin rate when the selling price is zero", () => {
    expect(calculateProfitability("0.00", "10.00").marginRate).toBeNull();
  });

  it("returns null markup when the cost is zero", () => {
    expect(calculateProfitability("15.00", "0.00").markup).toBeNull();
  });
});
```

- [x] **Step 6: Lancer le test et vérifier l'échec**

Run: `cd frontend && npx vitest run src/lib/calculateProfitability.test.ts`
Expected: FAIL — le module n'existe pas.

- [x] **Step 7: Implémenter côté frontend**

Créer `frontend/src/lib/calculateProfitability.ts` (implémentation identique au backend, dupliquée volontairement — même précédent que `resolveProductPrice.ts`) :

```ts
export interface ProfitabilityResult {
  unitProfit: string;
  marginRate: string | null;
  markup: string | null;
}

export function calculateProfitability(
  currentSellingPrice: string,
  cost: string
): ProfitabilityResult {
  const price = Number(currentSellingPrice);
  const costValue = Number(cost);
  const unitProfit = price - costValue;
  return {
    unitProfit: unitProfit.toFixed(2),
    marginRate: price > 0 ? (unitProfit / price).toFixed(4) : null,
    markup: costValue > 0 ? (unitProfit / costValue).toFixed(4) : null,
  };
}
```

- [x] **Step 8: Lancer le test et vérifier le succès**

Run: `cd frontend && npx vitest run src/lib/calculateProfitability.test.ts`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add backend/src/modules/products/product-profitability.ts backend/src/modules/products/product-profitability.spec.ts frontend/src/lib/calculateProfitability.ts frontend/src/lib/calculateProfitability.test.ts
git commit -m "feat: add pure profitability calculation helper (backend + frontend mirror)"
```

---

### Task 11: Vérification finale de bout en bout

**Files:** aucun — cette tâche ne modifie plus de code. Le câblage `ProductsModule` (`SettingsModule` + `ProductPurchasesService`) a été déplacé dans la Tâche 9 (Step 7) pour que l'application reste bootable dès ce commit-là plutôt que de rester cassée jusqu'à cette tâche finale.

**Interfaces:** aucune nouvelle — vérifie que l'ensemble des tâches précédentes s'assemble correctement.

- [x] **Step 1: Vérifier que l'application NestJS démarre (résolution de dépendances)**

Run: `cd backend && npx tsc --noEmit`
Expected: aucune erreur. S'il existe un test e2e pour `products` (`npx jest --testPathPattern=e2e`) ou en démarrant l'app localement (`npm run start:dev` dans `backend/`), confirmer l'absence d'erreur `Nest can't resolve dependencies` — ce point est déjà couvert depuis la Tâche 9, cette étape ne fait que le reconfirmer après les Tâches 9-10.

- [x] **Step 2: Lancer la suite backend complète**

Run: `cd backend && npx jest`
Expected: PASS sur l'ensemble de la suite.

- [x] **Step 3: Lancer la suite frontend complète**

Run: `cd frontend && npx vitest run`
Expected: PASS sur l'ensemble de la suite (inclut `i18nCompleteness.test.ts` — aucune nouvelle chaîne UI n'a été ajoutée par ce plan, donc pas d'impact attendu).

Aucun commit dans cette tâche — c'est une vérification, pas un changement de code.

---

## Self-Review

**Couverture du spec :**
- Section 3.1 (historique prix de vente, immuable, résolution avec repli, prix futur programmé) → Tâches 1, 3, 4, 5, 6.
- Section 3.2 (approvisionnements, immuable, normalisation devise/taux, `purchaseId`) → Tâches 1, 7, 8, 9.
- Section 3.3 (devise de référence, repli XOF) → Tâche 2.
- Section 3.4 (CUMP, cas limite quantité nulle, scoping variante) → Tâche 8.
- Section 3.5 (validation produit simple/à variantes) → Tâche 5 (`assertVariantScope`, réutilisé Tâche 8).
- Section 4 (flux complet, rollback quantité+coût, `purchaseId`, `PurchaseEntry` jamais annulée) → Tâches 8, 9.
- Section 5 (rentabilité par variante, calculée à la lecture) → Tâche 10 (helper pur ; portée volontairement limitée, justifiée dans la note de la tâche).
- Section 6 (4 routes, permissions, pas de PUT/DELETE) → Tâches 6, 9.
- Section 8 (scénarios de test listés) → couverts par les steps de test de chaque tâche correspondante.
- Point de la revue utilisateur sur l'intégration avec `calculateProductPrice`/`resolveProductPrice.ts` (spec section 2 : "ce spec étend ce point d'entrée unique") → Tâches 3, 4.

**Scan placeholders :** aucun "TBD"/"TODO" — chaque step contient du code réel ou une commande exécutable avec un résultat attendu explicite.

**Cohérence des types :** `SellingPriceEntry`/`PurchaseEntry` (Tâche 1) → consommés à l'identique dans `product-pricing-history.ts` (Tâche 3), `products.repository.ts` (Tâches 5, 8), `product-purchases.service.ts` (Tâche 9). `StockMovement.purchaseId` (Tâche 1) → `toDocument` (Tâche 7) → `ProductPurchasesService.addPurchase` (Tâche 9). Signatures de retour de `addPurchase`/`revertPurchaseImpact` (Tâche 8) reprises à l'identique dans les tests et l'implémentation de `ProductPurchasesService` (Tâche 9).
