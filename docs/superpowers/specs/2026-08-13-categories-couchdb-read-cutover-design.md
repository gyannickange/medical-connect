# Bascule des lectures catégories vers CouchDB — Design

Date : 2026-08-13
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Troisième brique de la fin de la vague 1, après le dual-write des ventes et
la bascule des lectures produits
(`docs/superpowers/specs/2026-08-13-products-couchdb-read-cutover-design.md`) :
faire lire `CategoriesService.findByTenant` depuis CouchDB plutôt que
PostgreSQL. Traité en deuxième car c'est le plus simple des trois entités
restantes de la vague 1 (catégories, stock, ventes) — pas d'agrégation, et
contrairement aux produits, aucune dénormalisation n'est nécessaire (section
3).

Contexte explicite (mémoire de session) : l'application n'est pas déployée,
aucun client existant à ne pas casser, pas de ceremony de route versionnée.

**Prérequis** : la lecture des produits depuis CouchDB doit être totalement
opérationnelle. Ce design part d'un état où les renommages de catégorie sont
propagés vers les documents produits via le repository produits injecté dans
`CategoriesService`.

## 2. Constat de départ (vérifié dans le code)

`database-storage.ts::getCategoriesByTenant` fait une requête relationnelle
Drizzle avec `with: { tenant: true, products: true }` : chaque catégorie
renvoyée aujourd'hui par l'API REST inclut l'objet imbriqué complet `tenant`
et la liste complète des `products` qui la référencent.

Vérification faite champ par champ dans le frontend (`Categories.tsx`,
`Products.tsx`, `ProductModal.tsx`, `ProductDetails.tsx`,
`taxCalculations.ts`) :

- Champs plats lus : `category.id`, `.name`, `.description`,
  `.parentCategoryId`, `.taxRate`, `.tenantId` — tous déjà présents sur le
  document mirroré par `CategoriesCouchMirrorService.toDocument()` (`type`,
  `name`, `description`, `parentCategoryId`, `taxRate`, `isDefault`,
  `tenantId`, `createdAt`).
- `category.products` (liste imbriquée) et `category.tenant` (objet
  imbriqué) : **aucun usage trouvé nulle part** dans le frontend. Sans
  risque de les laisser tomber.

Trou identifié et corrigé par ce design (présent, mais non corrigé, dans le
design produits) : les documents CouchDB mirrorés ne portent qu'un champ
`_id`, jamais de champ `id` — ni `CategoriesCouchMirrorService.toDocument()`
ni `ProductsCouchMirrorService.toDocument()` ne l'incluent.
`CategoriesCouchReadService` doit donc mapper `_id` → `id` sur chaque
document retourné : sans ce mapping, `category.id` serait `undefined` côté
frontend (utilisé par exemple pour la résolution de catégorie parente et les
clés de ligne dans `Categories.tsx`, ou pour construire l'URL
`/api/categories/${category.id}` lors d'une mise à jour). Voir section 4.2.

Note pour le mainteneur : le même trou existe dans le design produits
(`ProductsCouchReadService` ne fait pas ce mapping) — `product.id` serait
donc `undefined` partout dans le frontend (`/api/products/${product.id}`,
clés de ligne, `ProductModal`, `ProductDetails`, etc.) une fois ce plan
exécuté. Hors périmètre de ce document ; à corriger séparément dans le plan
produits, idéalement avant son exécution.

Autre constat, repris à l'identique du design produits (section 2) : la
pagination actuelle de `getCategoriesByTenant`
(`(options?.offset ?? options?.page) ? options.page * limit : 0`) calcule
`options.page * limit` même quand c'est `offset` qui a déclenché la branche,
ce qui donnerait `NaN`. Bug préexistant, non reproduit dans la nouvelle
implémentation CouchDB (section 4.1).

## 3. Pas de dénormalisation nécessaire

Contrairement aux produits (où `category.name` devait être dénormalisé sur
le document produit pour combler `product.category?.name`), aucune donnée
supplémentaire n'a besoin d'être ajoutée au document catégorie mirroré.
`CategoriesCouchMirrorService` n'est **pas modifié** par ce plan.

## 4. Nouveau service : `CategoriesCouchReadService`

Nouvelle classe dédiée à la lecture (séparée de
`CategoriesCouchMirrorService`, qui reste dédié à l'écriture), injectée
comme paramètre **obligatoire** de `CategoriesService` — même choix que
`ProductsCouchReadService` dans le design produits (section 4) : plus de
repli Postgres pour cette méthode, risque accepté explicitement.

### 4.1 `findByTenant`

```ts
async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
  const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
  await this.couchDBService.ensureIndex(
    this.databaseName(tenantId),
    "categories_by_tenant_name",
    ["tenantId", "type", "name"]
  );
  const limit = options?.limit ?? 100;
  const skip = options?.offset ?? (options?.page ?? 0) * limit;
  const result = await db.find({
    selector: { type: "category", tenantId },
    sort: [{ name: "asc" }],
    limit,
    skip,
  });
  return result.docs.map((doc: any) => ({ ...doc, id: doc._id }));
}
```

Pas de filtre `isActive` : les catégories n'ont pas cette colonne (schéma
`categories` — `id`, `name`, `description`, `tenantId`, `parentCategoryId`,
`taxRate`, `isDefault`, `createdAt`, aucun `isActive`). `getCategoriesByTenant`
actuel ne filtre que par `tenantId` ; ce comportement est repris à
l'identique.

### 4.2 Mapping `_id` → `id`

```ts
return result.docs.map((doc: any) => ({ ...doc, id: doc._id }));
```

Nécessaire pour que `category.id` soit défini côté frontend (section 2).
Décision : corriger ce mapping au niveau du service de lecture plutôt que
d'ajouter un champ `id` redondant sur le document mirroré lui-même — évite
un backfill des documents déjà mirrorés et reste correct pour tout document
existant, quelle que soit la version de `CategoriesCouchMirrorService` qui
l'a écrit.

### 4.3 Index Mango

Paresseusement, au premier appel de `findByTenant` pour un tenant donné
(même approche que le design produits, section 4.4), un index par tenant via
`CouchDBService.ensureIndex` :

```ts
await this.couchDBService.ensureIndex(
  `categories_${tenantId}`,
  "categories_by_tenant_name",
  ["tenantId", "type", "name"]
);
```

## 5. `CategoriesService` : câblage

```ts
constructor(
  private readonly storageService: StorageService,
  private readonly categoriesCouchReadService: CategoriesCouchReadService,
  private readonly categoriesCouchMirrorService?: CategoriesCouchMirrorService,
  private readonly productsCouchMirrorService?: ProductsCouchMirrorService
) {}

async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
  return this.categoriesCouchReadService.findByTenant(tenantId, options);
}
```

**Changement de signature non additif**, même remarque que pour
`ProductsService` dans le design produits (section 5) :
`categoriesCouchReadService` est inséré en 2ème position, obligatoire, avant
les paramètres optionnels existants (`categoriesCouchMirrorService?`,
`productsCouchMirrorService?` — ce dernier déjà ajouté par la Task 3 du plan
produits). Tout code qui construit `CategoriesService` positionnellement
(`categories.service.spec.ts`) doit être mis à jour dans le plan
d'implémentation.

`storageService.getCategoriesByTenant` n'est plus appelée par
`CategoriesService` après ce changement (reste dans `database-storage.ts` —
sa suppression, si souhaitée, sera évaluée séparément).

## 6. Cohérence

Même risque accepté que pour les produits (design produits, section 6) :
une catégorie dont le mirror a échoué silencieusement, ou créée avant la
mise en place du mirroring, devient invisible dans cette lecture. Pas de
garde-fou Postgres, pas de job de réconciliation dans ce design.

## 7. Tests

- `categories-couch-read.service.spec.ts` (nouveau) : `findByTenant`, mock
  de `CouchDBService`/`DocumentScope.find`, vérifie selector/sort/limit/skip
  envoyés à `db.find`, le calcul correct de `skip` (offset direct, ou
  `page * limit`, sans le bug `NaN`), et le mapping `_id` → `id` sur chaque
  document retourné.
- Extension de `categories.service.spec.ts` : `findByTenant` délègue bien à
  `CategoriesCouchReadService` ; tous les scénarios existants (`create`,
  `update` — y compris la cascade de renommage vers les produits — et
  `delete`) continuent de passer avec le nouveau paramètre obligatoire
  inséré en 2ème position.

## 8. Hors périmètre de ce design

- Stock et ventes — leurs propres lectures restent sur Postgres pour
  l'instant.
- Correction du mapping `_id` → `id` manquant dans `ProductsCouchReadService`
  (signalé section 2, à traiter séparément dans le plan produits).
- Suppression effective de `getCategoriesByTenant` de `database-storage.ts`.
- Retrait effectif de PostgreSQL.
