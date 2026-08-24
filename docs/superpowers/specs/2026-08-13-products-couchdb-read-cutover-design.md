# Bascule des lectures produits vers CouchDB — Design

Date : 2026-08-13
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Deuxième brique de la fin de la vague 1 (après le dual-write des ventes,
`docs/superpowers/specs/2026-08-12-sales-couchdb-dual-write-design.md`) :
faire lire `ProductsService.findByTenant`, `.search` et `.findByBarcode`
depuis CouchDB plutôt que PostgreSQL. Premier lecteur traité car c'est le
plus simple des quatre entités de la vague 1 (pas d'agrégation façon
tableau de bord).

Contexte explicite (voir mémoire de session) : l'application n'est pas
déployée, il n'y a aucun client existant à ne pas casser. Aucune ceremony
de route versionnée n'est nécessaire ici ; le contrat REST peut changer de
forme tant que le code du repo (frontend inclus) est mis à jour en
conséquence. Il est acceptable que l'application cesse de fonctionner
temporairement pendant le remplacement, tant qu'elle refonctionne à la fin
de ce plan.

## 2. Constat de départ (vérifié dans le code)

`database-storage.ts::getProductsByTenant` / `searchProducts` /
`getProductByBarcode` font une requête relationnelle Drizzle avec
`with: { category, supplier, tenant, variants, stocks }` : chaque produit
renvoyé aujourd'hui par l'API REST inclut les objets imbriqués complets
`category`, `supplier`, `tenant`, en plus de `variants` et `stocks`.

Le document produit déjà mirroré (`ProductsCouchMirrorService.toDocument()`)
ne contient que `categoryId`/`supplierId` (clés brutes), pas les objets
imbriqués. Vérification faite champ par champ dans le frontend :

- `product.category?.name` est lu dans `ProductDetails.tsx` (2 endroits) —
  **seul vrai trou**.
- `product.supplier` et `product.tenant` comme objets imbriqués : aucun
  usage trouvé nulle part (seul `product.supplierId`, la clé brute, est lu).
  Sans risque de les laisser tomber.
- `product.variants[].{id,sku,attributes,price,cost,barcode,quantity,minStockAlert}`
  et `product.stocks.{quantity,reservedQuantity}` : déjà présents dans le
  document mirroré tel quel, aucun trou.

Autre constat : la pagination actuelle
(`const offset = (options?.offset ?? options?.page) ? options.page * limit : 0`)
calcule `options.page * limit` même quand c'est `offset` qui a déclenché la
branche — `options.page` vaut alors `undefined`, ce qui donnerait `NaN`.
Bug préexistant, non corrigé côté Postgres par ce design, mais **pas
reproduit** dans la nouvelle implémentation CouchDB (section 4.1).

## 3. Dénormalisation de la catégorie sur le document produit

`ProductsCouchMirrorService.toDocument()` gagne un champ :

```ts
category: { id: string; name: string } | null
```

Résolu par `ProductsService` au moment du upsert : après un `create`/`update`
réussi côté Postgres, si `product.categoryId` est renseigné,
`ProductsService` appelle `storageService.getCategory(product.categoryId)`
(méthode déjà existante) pour récupérer `{ id, name }` avant d'appeler le
mirror. `ProductsCouchMirrorService.upsert` change de signature :

```ts
async upsert(
  product: Product,
  category: { id: string; name: string } | null
): Promise<boolean>
```

(Seuls les deux appels dans `ProductsService.create`/`.update` utilisent
`upsert` aujourd'hui — changement de signature sans impact ailleurs.)

**Cascade de renommage** : renommer une catégorie doit mettre à jour
`category.name` sur tous les produits qui la référencent. Nouvelle méthode
sur `ProductsCouchMirrorService` :

```ts
async renameCategoryOnProducts(
  tenantId: string,
  categoryId: string,
  categoryName: string
): Promise<void> {
  try {
    const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
    const result = await db.find({
      selector: { type: "product", tenantId, categoryId },
    });
    for (const doc of result.docs) {
      void db.insert({ ...doc, category: { id: categoryId, name: categoryName } } as any);
    }
  } catch (error) {
    this.logger.warn(`Failed to cascade category rename ${categoryId}: ${error}`);
  }
}
```

`CategoriesModule` importe `ProductsCouchMirrorModule` (comme `StockModule`
et `SalesModule` le font déjà) ; `CategoriesService` reçoit
`ProductsCouchMirrorService` en paramètre de constructeur optionnel et
appelle `renameCategoryOnProducts` dans `update()`, uniquement quand `name`
fait partie des champs modifiés :

```ts
async update(id: string, data: Partial<InsertCategory>): Promise<Category> {
  const category = await this.storageService.updateCategory(id, data);
  if (!category) throw new NotFoundException("Category not found");
  void this.categoriesCouchMirrorService?.upsert(category);
  if (data.name !== undefined) {
    void this.productsCouchMirrorService?.renameCategoryOnProducts(
      category.tenantId,
      category.id,
      category.name
    );
  }
  return category;
}
```

Fire-and-forget, best-effort, cohérent avec le reste du mirroring — pas
d'attente, pas de transaction entre le patch Postgres de la catégorie et la
cascade CouchDB.

## 4. Nouveau service : `ProductsCouchReadService`

Nouvelle classe dédiée à la lecture (séparée de
`ProductsCouchMirrorService`, qui reste dédié à l'écriture), injectée comme
paramètre **obligatoire** (pas optionnel comme les mirrors d'écriture — il
n'y a plus de repli Postgres pour ces trois méthodes, décision explicite :
« on accepte le risque, pas de garde-fou Postgres »).

### 4.1 `findByTenant`

```ts
async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
  const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
  const limit = options?.limit ?? 100;
  const skip = options?.offset ?? (options?.page ?? 0) * limit;
  const result = await db.find({
    selector: { type: "product", tenantId, isActive: true },
    sort: [{ name: "asc" }],
    limit,
    skip,
  });
  return result.docs;
}
```

### 4.2 `search`

```ts
async search(query: string, tenantId: string, options?: PaginationOptions): Promise<any[]> {
  const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
  const limit = options?.limit ?? 100;
  const skip = options?.offset ?? (options?.page ?? 0) * limit;
  const result = await db.find({
    selector: {
      type: "product",
      tenantId,
      name: { $regex: this.escapeRegex(query) },
    },
    sort: [{ name: "asc" }],
    limit,
    skip,
  });
  return result.docs;
}

private escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

Reproduit le comportement actuel de `like(products.name, '%query%')` :
correspondance partielle, **sensible à la casse** (Drizzle `like()` n'est
pas insensible à la casse par défaut, donc pas de changement de
comportement). `$regex` sur un index Mango standard suffit à l'échelle
d'un tenant POS (des centaines à quelques milliers de produits, pas plus) —
pas besoin d'un index de recherche plein texte séparé.

### 4.3 `findByBarcode`

```ts
async findByBarcode(barcode: string, tenantId: string): Promise<any | undefined> {
  const db = await this.couchDBService.getDatabase(this.databaseName(tenantId));
  const result = await db.find({
    selector: { type: "product", tenantId, barcode },
    limit: 1,
  });
  return result.docs[0];
}
```

`ProductsService.findByBarcode` garde son `throw new NotFoundException(...)`
existant quand le résultat est `undefined` — inchangé.

### 4.4 Index Mango

Paresseusement, au premier appel de `findByTenant`/`search`/`findByBarcode`
pour un tenant donné (cohérent avec `CouchDBService.ensureDatabaseExists`,
qui crée déjà la base à la volée au premier `getDatabase` plutôt qu'au
démarrage), deux index par tenant via `CouchDBService.ensureIndex`
(méthode déjà existante, jusqu'ici inutilisée en dehors des tests) :

```ts
await this.couchDBService.ensureIndex(
  `products_${tenantId}`,
  "products_by_tenant_name",
  ["tenantId", "type", "isActive", "name"]
);
await this.couchDBService.ensureIndex(
  `products_${tenantId}`,
  "products_by_tenant_barcode",
  ["tenantId", "type", "barcode"]
);
```

## 5. `ProductsService` : câblage

```ts
constructor(
  private readonly storageService: StorageService,
  private readonly productsCouchReadService: ProductsCouchReadService,
  private readonly productsCouchMirrorService?: ProductsCouchMirrorService,
  private readonly productsLockService?: ProductsLockService,
  private readonly stockCouchMirrorService?: StockCouchMirrorService
) {}

async findByTenant(tenantId: string, options?: PaginationOptions): Promise<any[]> {
  return this.productsCouchReadService.findByTenant(tenantId, options);
}

async search(query: string, tenantId: string, options?: PaginationOptions): Promise<any[]> {
  return this.productsCouchReadService.search(query, tenantId, options);
}

async findByBarcode(barcode: string, tenantId: string): Promise<any> {
  const product = await this.productsCouchReadService.findByBarcode(barcode, tenantId);
  if (!product) {
    throw new NotFoundException("Product not found");
  }
  return product;
}
```

`storageService.getProductsByTenant`/`searchProducts`/`getProductByBarcode`
ne sont plus appelées par `ProductsService` après ce changement (elles
restent dans `database-storage.ts` — leur suppression, si souhaitée,
sera évaluée séparément une fois confirmé qu'aucun autre appelant n'en
dépend).

**Changement de signature non additif** : `productsCouchReadService` est
inséré en 2ème position, obligatoire, avant les paramètres optionnels
existants (`productsCouchMirrorService?`, `productsLockService?`,
`stockCouchMirrorService?`). Ce n'est pas un ajout de paramètre optionnel
en fin de liste comme les précédents — ça déplace la position de tous les
paramètres optionnels existants. Tout code qui construit `ProductsService`
positionnellement (notamment `products.service.spec.ts`, qui fait déjà ça
abondamment) doit être mis à jour dans le plan d'implémentation, pas
seulement `products.module.ts`.

## 6. Cohérence

Risque accepté explicitement (voir section 1) : un produit dont le mirror a
échoué silencieusement, ou créé avant la mise en place du mirroring,
devient invisible ou obsolète dans ces trois lectures. Pas de garde-fou
Postgres, pas de job de réconciliation dans ce design.

## 7. Tests

- `products-couch-read.service.spec.ts` (nouveau) : les trois méthodes,
  mock de `CouchDBService`/`DocumentScope.find`, vérifie selector/sort/
  limit/skip envoyés à `db.find`, et le calcul correct de `skip` (offset
  direct, ou `page * limit`, sans le bug `NaN` actuel).
- Extension de `products-couch-mirror.service.spec.ts` : `upsert` avec un
  `category` non nul patch bien le champ, `renameCategoryOnProducts` patch
  tous les documents trouvés par le `find`.
- Extension de `categories.service.spec.ts` : `update()` avec un nouveau
  `name` appelle `renameCategoryOnProducts` ; `update()` sans changement de
  `name` ne l'appelle pas.
- Extension de `products.service.spec.ts` : `findByTenant`/`search`/
  `findByBarcode` délèguent bien à `ProductsCouchReadService` ;
  `findByBarcode` lève toujours `NotFoundException` si rien n'est trouvé ;
  `create`/`update` résolvent la catégorie et la passent à `upsert`.

## 8. Hors périmètre de ce design

- Les trois autres entités de la vague 1 (catégories, stock, ventes) —
  leurs propres lectures restent sur Postgres pour l'instant.
- Le redesign du tableau de bord/rapports (dépend en partie de ce travail
  mais reste un chantier séparé).
- Suppression effective de `getProductsByTenant`/`searchProducts`/
  `getProductByBarcode` de `database-storage.ts` (évalué séparément).
- Le calcul de prix (`calculateProductPrice`), les variantes et le pricing
  avancé (`getVariants`, `getVariant`, `getProductPricing`, etc.) — non
  couverts par ce design, restent sur Postgres.
- Retrait effectif de PostgreSQL.
