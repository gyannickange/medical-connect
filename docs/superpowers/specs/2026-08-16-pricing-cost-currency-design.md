# Prix / Coût / Devise — Design

Date : 2026-08-16
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Deuxième spec du projet en trois specs enrichissant la gestion produit de
StockFlow (première spec : `docs/superpowers/specs/2026-08-15-rayons-design.md`,
implémentée). Regroupe volontairement les phases 2, 3, 4, 5 et 6 de la
demande initiale — historique des prix de vente, approvisionnements avec
taux de conversion manuel, devise de référence, valorisation du stock
(CUMP) et conservation des prix dans les transactions — car elles sont
fortement couplées : le coût moyen dépend des approvisionnements, qui
dépendent de la devise, et la rentabilité dépend à la fois du coût moyen
et du prix de vente courant.

Décisions déjà actées pendant le brainstorming initial (reprises ici, non
rediscutées) :
- Une seule devise de référence par tenant ; seuls les approvisionnements
  peuvent être saisis dans une devise étrangère, avec un taux converti
  manuellement.
- L'historique de prix de vente remplace le prix de base "retail" figé ;
  les règles de prix existantes (`pricingRules` : wholesale/bulk/
  promotional) restent un système séparé, inchangé, qui continue de
  s'appliquer par-dessus.
- Enregistrer un approvisionnement crée aussi un mouvement de stock
  (une seule action utilisateur, pas de double saisie).
- CUMP (coût moyen pondéré) seul pour cette version ; pas de FIFO.
- Pas de migration de données : les produits existants sans historique de
  prix ni d'approvisionnement continuent de fonctionner avec leur `price`/
  `cost` actuels comme valeurs de repli.

## 2. Constat de départ (vérifié dans le code)

- `Product` a déjà `price`/`cost` en `Money` (chaîne décimale) simples,
  écrasés à chaque `update()` — aucune notion de devise nulle part dans le
  schéma.
- `ProductPricing` (`pricingRules`, tableau embarqué sur le document
  produit) gère déjà des règles de prix concurrentes par type
  (`retail`/`wholesale`/`bulk`/`promotional`) avec `minQuantity`/
  `maxQuantity`/`validFrom`/`validTo` — **précédent direct** pour la forme
  d'un tableau embarqué daté, que ce spec réutilise pour l'historique de
  prix de vente plutôt que d'inventer une collection CouchDB séparée.
  `ProductVariant` (`variants`) est le même genre de précédent.
- `ProductsRepository.calculateProductPrice` / le miroir frontend
  `resolveProductPrice.ts` résolvent déjà "le prix applicable" à partir de
  `pricingRules` + fallback sur `product.price` — ce spec étend ce point
  d'entrée unique plutôt que d'en créer un second.
- **Signal fort déjà présent dans le code**, antérieur à ce spec :
  `update-product.dto.ts:25` et `update-variant.dto.ts:43` portent tous
  deux le commentaire *"Editable by admin/manager even when CMP is
  active; next purchase will recalculate CMP."* — `product.cost` (et
  `variant.cost`) sont donc déjà pensés comme la valeur de CUMP courante,
  restant manuellement écrasable par un admin/manager, recalculée à
  chaque nouvel approvisionnement. Ce spec concrétise cette intention
  déjà documentée plutôt que d'introduire un nouveau champ `averageCost`.
- `SaleItem` gèle déjà `unitPrice`/`totalPrice`/`priceType` à la vente —
  la conservation des prix dans les ventes (phase 6) est déjà acquise.
- `StockMovement` a déjà un champ `unitPrice: Money | null` — actuellement
  toujours `null` pour les entrées manuelles (`StockService.stockEntry`),
  jamais renseigné. Ce spec le réutilise pour geler le coût unitaire
  converti d'un mouvement de stock issu d'un approvisionnement, sans
  ajouter de nouveau champ.
- Module `settings` déjà existant (`key`/`value`/`category`/`dataType`
  par tenant, CRUD générique par clé) — la devise de référence y vit comme
  une entrée `key: "currency.reference"`, sans nouveau module.
- Routes produit existantes suivent un pattern de sous-ressource cohérent
  à réutiliser : `POST /:productId/pricing`, `GET pricing/:productId`,
  etc. (`products.controller.ts`).
- `StockService.stockEntry`/`adjust` est le point d'entrée générique de
  mouvement de stock manuel ; les approvisionnements ont besoin d'un
  chemin dédié qui, en plus, renseigne `unitPrice` sur le mouvement et
  déclenche le recalcul du CUMP — pas une réutilisation telle quelle.

## 3. Modèle de données

Tout est embarqué sur le document produit CouchDB, au même niveau que
`variants`/`pricingRules` — aucune nouvelle collection top-level, aucun
nouveau mécanisme d'unicité/réservation nécessaire (ni l'un ni l'autre
tableau n'a de contrainte d'unicité).

### 3.1 Historique des prix de vente

```ts
export interface SellingPriceEntry {
  id: string;
  variantId: string | null;      // null = prix du produit simple/parent
  price: Money;
  effectiveAt: Date;
  createdByUserId: string;
  createdAt: Date;
}
export interface InsertSellingPriceEntry {
  id?: string;
  variantId?: string | null;
  price: MoneyInput;
  effectiveAt?: Date | string; // défaut : maintenant
  createdByUserId: string;
}
```

- Ajout sur `Product`/document CouchDB : `sellingPrices: SellingPriceEntry[]`.
- **Immuable** : pas de route de modification/suppression, seulement
  ajout. Chaque nouvelle entrée est un ajout au tableau, jamais un
  remplacement.
- `variantId` suit le même précédent que `ProductPricing.variantId`
  (`schema.ts:52`, déjà nullable et déjà consommé par
  `resolveProductPrice.ts:37-46` pour distinguer règles produit vs.
  règles variante) : une entrée avec `variantId` défini ne s'applique
  qu'à cette variante ; une entrée avec `variantId: null` s'applique au
  produit simple (ou sert de repli produit si une variante n'a pas
  encore de prix daté qui lui est propre — voir résolution ci-dessous).
- Le **prix courant** pour un `variantId` donné (ou `null` pour un
  produit simple) = l'entrée `sellingPrices` avec ce `variantId`, dont le
  `effectiveAt` est le plus récent parmi celles `<= now` ; si aucune
  entrée n'existe pour cette variante, repli sur `variant.price` puis, à
  défaut, sur `product.price` (comportement actuel inchangé, même chaîne
  de repli que `resolveProductPrice.ts:67`). Pour un produit sans
  variantes, la résolution est inchangée (celle décrite dans la version
  initiale de ce spec, `variantId: null` implicite). Résolu au moment de
  la lecture — pas de job planifié, cohérent avec l'absence de cron dans
  cette architecture.
- Permet la programmation d'un prix futur : une entrée avec
  `effectiveAt` dans le futur existe dans le tableau mais n'est pas
  encore "courante" tant que `effectiveAt > now`.
- L'historique affiché (le plus récent en premier) est le sous-ensemble
  du tableau filtré sur le `variantId` demandé (ou sur `variantId: null`
  pour le produit simple), trié par `effectiveAt` décroissant.

### 3.2 Approvisionnements

```ts
export interface PurchaseEntry {
  id: string;
  variantId: string | null;      // null = approvisionnement du produit simple/parent
  quantity: number;
  unitPurchasePrice: Money;      // prix d'achat unitaire, devise d'achat
  purchaseCurrency: string;       // ex. "NGN"
  conversionRate: Money;          // taux manuel saisi par l'utilisateur
  referenceCurrency: string;      // devise de référence du tenant au moment de l'achat
  unitCostConverted: Money;       // unitPurchasePrice * conversionRate, arrondi 2 décimales
  supplierId: string | null;
  purchaseDate: Date;
  createdByUserId: string;
  createdAt: Date;
}
export interface InsertPurchaseEntry {
  id?: string;
  variantId?: string | null;
  quantity: number;
  unitPurchasePrice: MoneyInput;
  purchaseCurrency: string;
  conversionRate: MoneyInput;
  supplierId?: string | null;
  purchaseDate?: Date | string; // défaut : maintenant
  createdByUserId: string;
}
```

- Ajout sur `Product`/document CouchDB : `purchases: PurchaseEntry[]`.
- **Immuable** comme `sellingPrices` : chaque approvisionnement, même
  identique en tous points à un précédent (même produit, même quantité,
  même prix), crée une **nouvelle** entrée — jamais de fusion/écrasement.
- `variantId` identifie la variante approvisionnée (stock et CUMP de
  variante distincts, section 3.4) ; `variantId: null` pour un produit
  simple. Un produit à variantes n'a jamais d'approvisionnement avec
  `variantId: null` — on approvisionne toujours une variante précise,
  jamais le produit parent, cohérent avec le fait que le stock lui-même
  (`variant.quantity`) est déjà tenu par variante et non au niveau
  produit.
- `referenceCurrency` est capturé sur l'entrée (pas seulement lu depuis
  `settings` au moment de l'affichage) : si le tenant change un jour sa
  devise de référence, les approvisionnements passés restent
  interprétables tels qu'ils ont réellement eu lieu.
- Aucun champ `isActive`/suppression — cohérent avec "les données
  historiques financières ne doivent pas être écrasées" (contrainte
  explicite de la demande initiale).
- Normalisation à l'entrée (avant tout calcul, dans le service) :
  `purchaseCurrency` est mise en majuscules/trim (ex. `"ngn"` →
  `"NGN"`) — pas de validation stricte contre une liste ISO 4217 dans
  cette version (StockFlow ne fait lui-même aucune conversion, la liste
  de devises n'est donc pas structurante), juste une normalisation de
  casse pour éviter que `"XOF"` et `"xof"` cohabitent dans l'historique
  d'un même produit.
- Si `purchaseCurrency === referenceCurrency` (après normalisation), le
  back-end **force `conversionRate` à `"1"`** plutôt que de faire
  confiance à la valeur saisie — un utilisateur qui achète déjà dans la
  devise de référence n'a aucune raison légitime de saisir un taux
  différent de 1, et une saisie erronée (ex. `1.15`) fausserait
  silencieusement `unitCostConverted` et donc le CUMP sans qu'aucune
  conversion réelle n'ait eu lieu.
- `StockMovement` gagne un champ `purchaseId: string | null` (défaut
  `null` pour tout mouvement non issu d'un achat — entrées/sorties/
  ajustements manuels inchangés). Même précédent que
  `SaleItem.pricingId` (`schema.ts:45`, un enregistrement référence
  l'id d'un autre enregistrement du même document). Renseigné avec
  `PurchaseEntry.id` au moment du mouvement d'entrée déclenché par un
  approvisionnement (section 4) — permet de détecter, en reconciliation,
  un achat dont le mouvement de stock correspondant n'existe pas
  (`purchases` sans `purchaseId` correspondant dans `StockMovement`),
  sans avoir besoin d'un champ de statut mutable sur `PurchaseEntry`
  (qui resterait ainsi immuable).

### 3.3 Devise de référence

Pas de nouveau type — une entrée `Setting` existante :
`key: "currency.reference"`, `category: "currency"`, `dataType: "string"`,
`value` = code devise (ex. `"XOF"`). Si absente pour un tenant, le
back-end **replie sur `"XOF"`** sans exiger de ligne de settings
pré-existante (pas de migration nécessaire) — cohérent avec le contexte
Bénin déjà documenté dans `docs/research/2026-08-13-facturation-benin.md`.
Un helper `SettingsService.getReferenceCurrency(tenantId): Promise<string>`
centralise cette résolution avec repli, pour que les futurs appelants
(purchases, éventuellement les ventes multi-devises plus tard) ne
dupliquent pas la logique de repli.

### 3.4 Coût moyen pondéré (CUMP)

Pas de nouveau champ : **`product.cost`** (et `variant.cost` pour les
produits à variantes) porte déjà cette intention (section 2). À chaque
nouvel approvisionnement :

```
newCost = (currentQuantity * currentCost + purchaseQuantity * unitCostConverted)
          / (currentQuantity + purchaseQuantity)
```

Pour un produit **simple** (`variantId: null`), `currentQuantity`/
`currentCost` sont lus depuis `product.stocks.quantity` et `product.cost`,
le résultat est écrit dans `product.cost`. Pour un produit **à
variantes**, exactement le même calcul est appliqué mais scopé à la
variante ciblée par `PurchaseEntry.variantId` : `currentQuantity`/
`currentCost` sont lus depuis `variant.quantity`/`variant.cost`, le
résultat est écrit dans `variant.cost` — les autres variantes du même
produit ne sont pas affectées. Dans les deux cas, la lecture se fait
**avant** que le mouvement de stock de cet approvisionnement ne soit
appliqué. Résultat arrondi à 2 décimales. Comme documenté dans le
commentaire déjà présent en section 2, un admin/manager peut ensuite
écraser manuellement `product.cost`/`variant.cost` via
`PUT /api/products/:id` (ou l'équivalent variante) — le prochain
approvisionnement recalculera à partir de cette nouvelle valeur comme
base, pas de verrouillage.

Cas limite : `currentQuantity` = 0 (premier approvisionnement, ou stock
entièrement écoulé, produit simple ou variante) → `newCost =
unitCostConverted` directement (pas de division par zéro).

**Précision arithmétique** : `unitCostConverted` et `newCost` sont
calculés avec `Number(...)` puis arrondis via `.toFixed(2)`, exactement
la convention déjà utilisée partout ailleurs pour `price`/`cost` dans
`products.repository.ts` (ex. lignes 54-55, 175-177, 955-968) — ce spec
n'introduit pas de nouvelle exigence de précision ni de bibliothèque
décimale pour ce module en particulier ; le risque de dérive flottante y
est le même que sur le reste des calculs monétaires du projet
aujourd'hui, pas spécifique à cette fonctionnalité.

### 3.5 Validation produit simple vs produit à variantes

Règle imposée en **validation backend**, pas seulement documentaire,
appliquée identiquement aux deux routes `POST` (`selling-prices` et
`purchases`) :

| Produit | `variantId` fourni | Résultat |
| --- | --- | --- |
| simple (sans variantes) | absent/`null` | OK |
| simple (sans variantes) | fourni | rejet (`BadRequestException`) |
| à variantes | absent/`null` | rejet (`BadRequestException`) |
| à variantes | fourni, inconnu du produit | `VariantNotFoundException` |
| à variantes | fourni, connu du produit | OK |

Un produit à variantes n'a donc jamais d'entrée `sellingPrices`/
`purchases` avec `variantId: null` — pas de prix/coût "parent" ambigu
qui coexisterait avec les prix par variante alors que les ventes
(`SaleItem.variantId`) passent déjà exclusivement par la variante dans
ce cas.

## 4. Enregistrement d'un approvisionnement : flux complet

`POST /api/products/:productId/purchases` (voir section 6) exécute, dans
l'ordre, au sein d'un seul appel de service (`ProductsService` ou un
nouveau `ProductPurchasesService` — décision d'implémentation, pas
structurante pour ce spec) :

1. Résout `referenceCurrency` via `SettingsService.getReferenceCurrency`.
2. Normalise `purchaseCurrency` (majuscules/trim) ; si elle est égale à
   `referenceCurrency`, force `conversionRate = "1"` (section 3.2).
   Calcule `unitCostConverted = round2(unitPurchasePrice *
   conversionRate)`.
3. Valide `variantId` selon la règle de la section 3.5 (rejet si produit
   simple + `variantId` fourni, ou produit à variantes + `variantId`
   absent ; `VariantNotFoundException` si fourni mais inconnu du
   produit). Capture `currentQuantity`/`currentCost` (`product.stocks`/
   `product.cost` ou `variant.quantity`/`variant.cost` selon le cas) et
   calcule le nouveau CUMP (section 3.4) à partir de ces valeurs
   **avant** toute écriture.
4. Ajoute la nouvelle `PurchaseEntry` (avec son `variantId`) au tableau
   `purchases` du produit. **Ce point ne fait jamais l'objet d'un
   rollback** (section suivante) : il décrit un achat financier
   réellement survenu, indépendant de la réussite du mouvement de stock
   qui en est une conséquence dérivée.
5. Met à jour `product.cost` (ou `variant.cost` si `variantId` fourni)
   avec le CUMP recalculé, et applique le delta de quantité (réutilise
   `ProductsRepository.adjustStock`) — les deux appliqués ensemble,
   optimistement, avant la persistance du mouvement de stock lui-même
   (même séquencement que `StockService.adjust`).
6. Déclenche l'écriture du mouvement de stock d'entrée
   (`StockRepository.recordRequired`), avec `unitPrice:
   unitCostConverted`, `reason: "purchase"`, `purchaseId:
   <PurchaseEntry.id>` (section 3.2) et `variantId` transmis tel quel —
   **conservation du coût dans le mouvement de stock**, gelé et
   immuable comme les autres mouvements (aucune route de modification de
   mouvement n'existe déjà).

**Rollback si l'écriture du mouvement de stock échoue** (étape 6) : même
filet que `StockService.adjust`, mais étendu au coût, pas seulement à la
quantité. `product.cost`/`variant.cost` a été avancé au CUMP recalculé à
l'étape 5 en tenant pour acquis que la quantité achetée entre
effectivement en stock ; si ce n'est finalement pas le cas, ce CUMP ne
représente plus le coût du stock réellement détenu (ex. 10 unités à
1000 restent en stock après échec, mais `cost` aurait été laissé au
CUMP mélangé avec les 100 unités à 2000 jamais entrées). Le rollback
restaure donc **les deux** :

- le delta de quantité appliqué à l'étape 5 (`adjustStock` avec le delta
  inversé, comme aujourd'hui) ;
- `product.cost`/`variant.cost`, remis à la valeur `currentCost` capturée
  à l'étape 3, **avant** le recalcul.

L'erreur remonte ensuite à l'appelant. **L'entrée `PurchaseEntry` reste
en place** dans tous les cas (étape 4, jamais annulée) : l'achat reste
visible dans l'historique pour régularisation manuelle ultérieure (ex.
nouvelle tentative d'entrée en stock), et la reconciliation le repère
via l'absence de `StockMovement` avec un `purchaseId` correspondant
(section 3.2) — sans quoi le stock physique et sa valorisation resteraient
tous deux exacts, ce qui est le seul état cohérent tant que l'achat n'a
pas réellement été absorbé par le stock.

## 5. Rentabilité (calculée à la lecture, non stockée)

Pour un produit **simple**, à partir du prix de vente courant (section
3.1) et de `product.cost` (section 3.4) :

- `unitProfit = currentSellingPrice - product.cost`
- `marginRate = unitProfit / currentSellingPrice` (marge sur prix de
  vente)
- `markup = unitProfit / product.cost` (marge sur coût), uniquement si
  `product.cost > 0`

Pour un produit **à variantes**, exactement le même calcul mais scopé à
chaque variante — `currentSellingPrice(variantId)` (résolution section
3.1) et `variant.cost` (section 3.4) remplacent `product.price`/
`product.cost` ; `unitProfit`/`marginRate`/`markup` sont donc calculés
et exposés **par variante**, pas au niveau produit (un produit à
variantes n'a pas de "coût"/"prix courant" unique — cohérent avec la
validation de la section 3.5 qui interdit déjà un `variantId: null`
ambigu sur ce type de produit).

Exposé par une extension légère de la réponse produit existante (ajout
de ces trois champs calculés sur le produit pour un produit simple, et
sur chaque entrée de `variants` pour un produit à variantes), pas par un
nouvel endpoint séparé — cohérent avec le principe "rien de stocké, tout
dérivé à la lecture" qui évite toute désynchronisation entre prix/coût
et rentabilité affichée.

## 6. API & permissions

Toutes les routes vivent sous `api/products` (`ProductsController`
existant), suivant le pattern de sous-ressource déjà utilisé par
`pricing` :

- `POST /api/products/:productId/selling-prices` — corps
  `{price, effectiveAt?, variantId?}`. Permission : `isAdminOrManager()`.
- `GET /api/products/selling-prices/:productId?variantId=` — liste triée
  `effectiveAt` décroissant, filtrée sur `variantId` si fourni en query
  (sinon les entrées `variantId: null` du produit simple/parent).
  Permission : tous rôles (vue).
- `POST /api/products/:productId/purchases` — corps
  `{quantity, unitPurchasePrice, purchaseCurrency, conversionRate,
  supplierId?, purchaseDate?, variantId?}`. Exécute le flux de la
  section 4. Permission : `isAdminOrManager()`.
- `GET /api/products/purchases/:productId?variantId=` — liste triée
  `purchaseDate` décroissant, même filtrage par `variantId` que
  ci-dessus. Permission : tous rôles (vue).

`variantId?` sur les deux corps `POST` suit le même pattern DTO que les
routes `pricing` existantes (`variantId?: string | null` en
`@IsOptional()`) — pas de nouveau style de validation.

Aucune route `PUT`/`DELETE` sur ces deux sous-ressources — immuabilité
imposée au niveau de l'API, pas seulement de la convention interne.

`referenceCurrency` (lecture/écriture via le module `settings` existant,
aucune nouvelle route) : `GET/PUT /api/settings/currency.reference` déjà
couvert par les routes génériques `SettingsController` existantes — pas
de nouvelle route à créer, seulement le helper de repli côté service
(section 3.3).

## 7. Frontend

Hors périmètre détaillé de ce spec (traité par la troisième spec,
"Interface produit" — fiche produit enrichie regroupant rayon, prix
courant, coût moyen, marge, historiques). Ce spec livre uniquement les
fondations backend + les données nécessaires ; aucune UI de saisie de
prix/achat n'est construite ici, pour éviter de construire une interface
qui devra être refondue dès que la spec suivante précisera la disposition
de la fiche produit enrichie.

## 8. Tests

- Tests de repository (`products.repository.spec.ts` ou nouveau fichier
  dédié si le volume le justifie à l'implémentation) : ajout d'une entrée
  de prix de vente, résolution du prix courant (dont un cas avec prix
  futur programmé non encore actif), ajout d'un approvisionnement,
  calcul du CUMP (dont le cas quantité initiale nulle), gel du coût sur
  le mouvement de stock généré, rollback du mouvement de stock en cas
  d'échec sans perte de la `PurchaseEntry`.
- Mêmes cas que ci-dessus déclinés pour un produit à variantes :
  résolution du prix courant scopée à un `variantId` donné (avec repli
  `variant.price` puis `product.price`), CUMP recalculé sur
  `variant.cost` sans affecter les autres variantes du même produit,
  rejet (`VariantNotFoundException`) si `variantId` ne correspond à
  aucune variante du produit.
- Validation `variantId` (section 3.5) : rejet si produit simple +
  `variantId` fourni, rejet si produit à variantes + `variantId` absent,
  sur les deux routes `POST` (`selling-prices` et `purchases`).
- Rollback d'un échec de `StockRepository.recordRequired` sur un
  approvisionnement : la `PurchaseEntry` reste dans `purchases`, mais
  **la quantité et `cost`/`variant.cost` sont tous deux restaurés** à
  leur valeur d'avant l'approvisionnement (pas seulement la quantité) —
  cas explicite reproduisant le scénario "10 unités à 1000, achat de 100
  à 2000, échec du mouvement" pour vérifier que `cost` retombe bien à
  1000 et non à ~1909.
- Normalisation du taux de conversion : `purchaseCurrency ===
  referenceCurrency` (après normalisation de casse) force
  `conversionRate` à `"1"` même si une autre valeur a été soumise dans
  la requête.
- Reconciliation : un `PurchaseEntry` dont aucun `StockMovement` associé
  n'a `purchaseId` correspondant est détectable (support du futur
  parcours de régularisation manuelle, section 4).
- Rentabilité par variante (section 5) : `unitProfit`/`marginRate`/
  `markup` calculés et exposés par variante pour un produit à variantes,
  au niveau produit pour un produit simple.
- Test du helper `SettingsService.getReferenceCurrency` : valeur
  explicite si réglée, repli `"XOF"` sinon.
- Tests de contrôleur : permissions (`isAdminOrManager` sur les deux
  routes `POST`), tenant scoping identique au pattern déjà utilisé par
  `pricing`.

## 9. Hors périmètre de cette spec

- FIFO (seul CUMP est implémenté).
- Toute UI de saisie/affichage (renvoyée à la spec "Interface produit").
- Multi-devises pour la vente elle-même (seule la devise de référence est
  utilisée en vente ; seuls les achats supportent une devise étrangère).
- Migration des produits existants vers un historique de prix ou un
  premier approvisionnement — ils continuent de fonctionner avec
  `price`/`cost` actuels comme repli.
- Modification/suppression d'une entrée de prix ou d'approvisionnement
  déjà enregistrée (immuabilité stricte, par design).
