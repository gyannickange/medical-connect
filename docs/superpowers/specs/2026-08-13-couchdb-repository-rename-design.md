# Renommage des classes CouchDB en repositories (Chantier A) — Design

Date : 2026-08-13
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

CouchDB devient la seule base de données du projet — Postgres est amené à
disparaître entièrement, pas à rester "primaire" avec CouchDB en second
rôle. Les noms actuels (`ProductsCouchMirrorService`,
`CategoriesCouchMirrorService`, `StockCouchMirrorService`,
`SalesCouchMirrorService`, `ProductsCouchReadService`,
`CategoriesCouchReadService`) sont faux dans cette direction : ils encodent
l'idée que CouchDB est une réplique secondaire ("Mirror") qu'il faut
distinguer par un préfixe ("Couch"). Ce design renomme ces classes comme si
Postgres n'avait jamais existé pour ces quatre entités, et fusionne
écriture+lecture en une seule classe par entité (la séparation
Mirror/Read n'existait que pour la phase de transition dual-write).

Périmètre : les quatre entités déjà en migration active (produits,
catégories, stock, ventes) — "Chantier A". Le renommage de
`StorageService`/`database-storage.ts`/`storage.interface.ts` (côté
Postgres, utilisé par 13 modules dont 9 sans aucun lien CouchDB
aujourd'hui) est explicitement hors périmètre — "Chantier B", en suivi
séparé.

## 2. Table de renommage

| Entité | Fichiers actuels | Nouveau fichier | Nouvelle classe |
|---|---|---|---|
| Products | `products-couch-mirror.service.ts` + `.spec.ts`, `products-couch-read.service.ts` + `.spec.ts`, `products-couch-mirror.module.ts` | `products.repository.ts` + `.spec.ts`, `products.repository.module.ts` | `ProductsRepository` |
| Categories | `categories-couch-mirror.service.ts` + `.spec.ts`, `categories-couch-read.service.ts` + `.spec.ts` (jamais câblé) | `categories.repository.ts` + `.spec.ts` | `CategoriesRepository` |
| Stock | `stock-couch-mirror.service.ts` + `.spec.ts` | `stock.repository.ts` + `.spec.ts` | `StockRepository` |
| Sales | `sales-couch-mirror.service.ts` + `.spec.ts` | `sales.repository.ts` + `.spec.ts` | `SalesRepository` |

`CouchDBService`/`CouchDBModule` (le client bas niveau générique, wrapper
autour de `nano`) restent inchangés — "CouchDB" y désigne la technologie,
pas une position secondaire par rapport à Postgres, contrairement à
"Mirror".

## 3. Méthodes par repository (renommage inclus)

**`ProductsRepository`** (fusion de `ProductsCouchMirrorService` +
`ProductsCouchReadService`) :
`upsert(product, category?)`, `remove(productId, tenantId)`,
`archive(productId, tenantId)`, `updateStockSnapshot(...)`,
`updateVariantsSnapshot(...)`, `renameCategoryOnProducts(...)`,
`findByTenant(tenantId, options?)`, `search(query, tenantId, options?)`,
`findByBarcode(barcode, tenantId)`. Noms de méthodes inchangés (déjà
neutres), seuls le fichier/la classe changent.

**`CategoriesRepository`** (fusion de `CategoriesCouchMirrorService` +
`CategoriesCouchReadService`) : `upsert(category)`,
`remove(categoryId, tenantId)`, `findByTenant(tenantId, options?)`. Ce
dernier vient de `CategoriesCouchReadService`, écrit par une autre session,
jamais câblé dans `CategoriesService` — ce design le termine : la nouvelle
classe le porte, et `CategoriesService.findByTenant` l'appelle (au lieu de
`storageService.getCategoriesByTenant`), complétant la bascule de lecture
pour les catégories au passage.

**`StockRepository`** (ex-`StockCouchMirrorService`) : `mirror` →
`record(movement)`. "Mirror" n'a plus de sens une fois CouchDB seule
source ; "record" reflète le rôle réel (écrire un mouvement dans un
registre append-only, cf. le commentaire déjà présent dans le fichier
actuel).

**`SalesRepository`** (ex-`SalesCouchMirrorService`) : `mirror` →
`record(sale, items)`. Même raisonnement, même nom que `StockRepository`
pour une sémantique cohérente entre les deux registres append-only du
projet.

## 4. Bug corrigé au passage

`renameCategoryOnProducts` (dans le futur `ProductsRepository`) utilise
aujourd'hui `void db.insert(...)` dans sa boucle au lieu d'`await` — un
échec d'écriture individuel devient une rejection de promesse non gérée
au lieu d'être capturé par le `try/catch` englobant. Corrigé en même temps
que le renommage (déjà identifié lors de la revue du plan précédent,
jamais corrigé dans le code exécuté).

## 5. Câblage des modules

- `products.repository.module.ts` (ex-`products-couch-mirror.module.ts`)
  exporte `ProductsRepository`, importé par `categories.module.ts`,
  `stock.module.ts`, `sales.module.ts`, `products.module.ts` — inchangé
  dans sa fonction, juste renommé.
- Chaque service consommateur (`CategoriesService`, `StockService`,
  `SalesService`, `ProductsService`) renomme son champ constructeur
  `productsCouchMirrorService` → `productsRepository`, et son propre champ
  `<entity>CouchMirrorService`/`<entity>CouchReadService` →
  `<entity>Repository`.
- Dans `ProductsService` (le consommateur qui *possède* ce repository), les
  deux paramètres constructeur actuels (`productsCouchReadService`
  obligatoire, `productsCouchMirrorService` optionnel) fusionnent en un
  seul `productsRepository`, **obligatoire** (pas de `?`) — il porte
  maintenant les lectures, qui n'ont plus de repli Postgres, donc plus
  aucune méthode de `ProductsService` ne fonctionne sans lui.
- Dans `CategoriesService`, `StockService`, `SalesService` — qui
  n'utilisent `ProductsRepository` que pour des patches best-effort
  cross-entité (`updateStockSnapshot`, `renameCategoryOnProducts`), jamais
  pour une lecture — le paramètre `productsRepository?` **reste optionnel**,
  exactement comme `productsCouchMirrorService?` aujourd'hui. Seul le nom
  change, pas l'optionnalité, pour ces trois services.

## 6. Nettoyage des tests

- `products-couch-sync.spec.ts` fait doublon avec les tests de
  `create`/`update` déjà présents dans `products.service.spec.ts`, sauf
  pour sa couverture de `delete()`/`archive()` (non testée ailleurs). Le
  plan migre cette couverture manquante vers le fichier de test principal
  puis supprime `products-couch-sync.spec.ts`.
- Les tests existants de chaque `*CouchMirrorService.spec.ts` /
  `*CouchReadService.spec.ts` sont repris tels quels dans le nouveau
  `*.repository.spec.ts` (renommage de fichier + classe + noms de
  variables, comportement testé inchangé), à l'exception des méthodes
  renommées (`mirror` → `record`) où le nom de méthode est mis à jour dans
  les assertions.

## 7. Hors périmètre de ce design

- Chantier B : `StorageService`/`database-storage.ts`/`storage.interface.ts`.
- Toute nouvelle fonctionnalité au-delà de ce qui existe déjà (pas de
  nouvelle méthode, pas de nouveau champ dénormalisé).
- Le redesign du tableau de bord/rapports.
- Retrait effectif de PostgreSQL.
