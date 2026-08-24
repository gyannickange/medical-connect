# Mirroring des ventes vers CouchDB (dual-write) — Design

Date : 2026-08-12
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Le design initial (`docs/superpowers/specs/2026-08-09-lan-peer-sync-design.md`,
section 4) définit la vague 1 de la migration vers CouchDB/PouchDB : produits,
catégories, stock, ventes. Les trois premières entités ont déjà leur
dual-write PostgreSQL → CouchDB en place (`ProductsCouchMirrorService`,
`CategoriesCouchMirrorService`, `StockCouchMirrorService`). Les ventes sont la
dernière pièce manquante de la vague 1 avant de pouvoir envisager de basculer
les lectures de Postgres vers CouchDB, puis, à terme, de retirer Postgres.

Ce design couvre uniquement l'écriture en miroir du document de vente
lui-même vers CouchDB — pas la bascule des lectures, pas le recalcul du
tableau de bord/rapports (ces deux points restent hors périmètre, voir
section 8), et ne touche à aucune autre entité de la vague 2 (clients,
fournisseurs, staff, paramètres, audit, auth).

## 2. Constat de départ (vérifié dans le code)

`SalesService` (`backend/src/modules/sales/sales.service.ts`) injecte déjà
`StockCouchMirrorService` et `ProductsCouchMirrorService` en paramètres de
constructeur optionnels, et `create()` les utilise pour répliquer :

- chaque mouvement de stock généré par la vente (`stockCouchMirrorService.mirror(movement)`) ;
- le nouveau snapshot de stock du produit affecté (`productsCouchMirrorService.updateStockSnapshot(...)`).

Mais **le document de vente lui-même (en-tête + lignes) n'est jamais écrit
dans CouchDB.** Aucune base `sales_<tenantId>` n'existe aujourd'hui.

Autre constat : `SalesService` n'expose aucune méthode de mutation d'une
vente après sa création (pas d'`update`, `cancel`, ni `refund`). Le champ
`status` du schéma Postgres (`pending | completed | cancelled | refunded`)
existe mais rien dans le code actuel ne le fait transiter d'un état à un
autre après l'insertion initiale. Une vente est donc, en pratique, un fait
immuable une fois créée — ce qui correspond exactement au modèle décrit dans
le design initial (section 6.2) : « chaque vente est un document
indépendant ; il n'y a rien à fusionner ».

## 3. Architecture

Un nouveau service `SalesCouchMirrorService`
(`backend/src/modules/sales/sales-couch-mirror.service.ts`), structurellement
identique à `StockCouchMirrorService` : pas de logique
update/remove/patch-par-champ (contrairement à
`ProductsCouchMirrorService`, qui doit gérer des mises à jour), une seule
méthode `mirror(sale, items)` qui fait un `insert` unique dans CouchDB,
erreurs avalées et loggées en `warn`, retour `boolean` pour signaler le
succès à l'appelant sans jamais lui faire remonter d'exception.

`SalesService` reçoit ce service comme quatrième paramètre de constructeur,
optionnel (même convention que les trois autres) :

```ts
constructor(
  private readonly storageService: StorageService,
  private readonly stockCouchMirrorService?: StockCouchMirrorService,
  private readonly productsCouchMirrorService?: ProductsCouchMirrorService,
  private readonly salesCouchMirrorService?: SalesCouchMirrorService
) {}
```

## 4. Document de vente (CouchDB)

Une nouvelle base par tenant, `sales_<tenantId>`, suivant la convention
« une base par type d'entité » déjà utilisée (`products_<tenantId>`,
`categories_<tenantId>`, `stock_<tenantId>`).

Un document par vente, id CouchDB = `sale.id` (id Postgres généré par
`createSale`), avec les lignes de vente imbriquées directement dedans (pas de
documents séparés par ligne) :

```json
{
  "_id": "<sale.id>",
  "type": "sale",
  "saleNumber": "<string>",
  "customerId": "<string | null>",
  "userId": "<string>",
  "subtotal": "<string decimal>",
  "tax": "<string decimal>",
  "total": "<string decimal>",
  "profit": "<string decimal>",
  "paymentMethod": "cash | card | mobile",
  "status": "pending | completed | cancelled | refunded",
  "tenantId": "<string>",
  "createdAt": "<ISOString>",
  "items": [
    {
      "productId": "<string>",
      "variantId": "<string | null>",
      "quantity": "<number>",
      "unitPrice": "<string decimal>",
      "totalPrice": "<string decimal>",
      "priceType": "<string | null>",
      "pricingId": "<string | null>"
    }
  ]
}
```

Écriture en `insert` unique, jamais de update/remove — comme
`StockCouchMirrorService`, et pour la même raison (constat section 2 : une
vente ne change pas d'état après création dans le code actuel). Si un futur
chantier ajoute un flux d'annulation/remboursement, ce document devra alors
gagner une logique de patch ; non traité ici (hors périmètre, section 8).

## 5. Point d'intégration

Dans `SalesService.create()`, juste après l'appel existant à
`storageService.createSale(...)` et à côté des deux boucles de mirroring déjà
présentes (mouvements de stock, snapshot produit) :

```ts
void this.salesCouchMirrorService?.mirror(sale, transformedItems);
```

Fire-and-forget, comme les trois autres appels de la même méthode — un échec
de mirroring ne doit jamais faire échouer ou ralentir la création de la
vente côté Postgres.

## 6. Gestion des erreurs

Best-effort, strictement identique au pattern déjà en place pour
produits/catégories/stock (voir aussi `CLAUDE.md`, section Backend) :
`try/catch` interne au service de mirroring, `logger.warn` sur échec, jamais
de `throw` qui remonterait à l'appelant.

## 7. Tests

- Nouveau `backend/src/modules/sales/sales-couch-mirror.service.spec.ts`,
  même structure que `stock-couch-mirror.service.spec.ts` (construction
  directe avec un mock Jest de `CouchDBService`, pas de `TestingModule`).
- Extension de `backend/src/modules/sales/sales.service.spec.ts` pour
  vérifier que `create()` appelle `salesCouchMirrorService.mirror(...)` avec
  le document attendu (en-tête + lignes transformées), et que l'absence de
  ce service optionnel (comme dans les tests existants qui construisent
  `SalesService` avec moins d'arguments) ne casse rien.

## 8. Hors périmètre de ce design

- Basculer les méthodes de lecture de `SalesService` (`findByTenant`,
  `getTodaysSales`, `getSalesReport`, `getSalesByProduct`,
  `getSalesAnalytics`) de Postgres vers CouchDB.
- Redesign des agrégations de tableau de bord/rapports sans jointures SQL
  (dépend du point précédent).
- Tout flux de mutation d'une vente après création (annulation,
  remboursement, changement de statut) — n'existe pas dans le code actuel,
  non ajouté par ce design.
- Toute entité de la vague 2 (clients, fournisseurs, staff, paramètres,
  audit, tenants/auth).
- Retrait effectif de PostgreSQL — dépend de la fin complète de la vague 1
  (ce design est une des dernières briques) et de la vague 2, non encore
  designée.
