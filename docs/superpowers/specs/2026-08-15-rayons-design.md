# Rayons (départements produits) — Design

Date : 2026-08-15
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Première brique d'un projet en trois specs visant à enrichir la gestion
produit de StockFlow :

1. **Rayons** (ce document) — classification indépendante des produits par
   rayon physique/logique du magasin.
2. **Prix / Coût / Devise** (spec suivante) — historique des prix de vente,
   approvisionnements avec taux de conversion manuel, valorisation du stock
   (CUMP), marge/rentabilité.
3. **Interface produit** (spec suivante) — fiche produit enrichie regroupant
   rayon, prix courant, coût moyen, marge, historiques.

Chaque spec est conçue, écrite et validée indépendamment ; l'implémentation
ne démarre qu'après validation explicite de chacune.

Contexte explicite (mémoire de session) : l'application n'est pas déployée,
aucun client existant à ne pas casser, pas de ceremony de route versionnée
— les changements de schéma peuvent être faits directement.

## 2. Constat de départ (vérifié dans le code)

- La base est désormais **CouchDB uniquement** (migration Postgres
  terminée) : une base par tenant, documents typés (`type: "product"`,
  `"category"`, etc.), pas de transactions multi-documents.
- Un module `categories` existe déjà (`backend/src/modules/categories/`) et
  a été envisagé comme base de fusion pour les rayons, mais **décision
  explicite de l'utilisateur : les rayons sont un concept séparé**, sans
  lien avec `categories`. Un produit portera donc `categoryId` ET
  `rayonId`, deux classifications indépendantes.
- `categories` sert néanmoins de gabarit structurel : repository/service/
  controller/policy/module + DTOs, document CouchDB dédié, dénormalisation
  d'un résumé (`category: {id, name}`) sur le document produit, cascade de
  renommage (`renameCategoryOnProducts`), garde de suppression
  (`hasProductsReferencing`).
- **Différences notables à ne pas reproduire telles quelles** :
  - `categories` n'a **aucune contrainte d'unicité de nom** (`create()`
    insère directement, sans vérification). Les rayons doivent, eux,
    garantir un nom unique par tenant (exigence explicite).
  - **Décision explicite de l'utilisateur (revirement après première
    version de cette spec) : ni suppression ni désactivation d'un rayon
    dans cette phase.** Un rayon créé reste create/update uniquement — pas
    de champ `isActive`, pas de route `DELETE`. Motif énoncé : éviter les
    effets de bord ailleurs dans le code pour l'instant ; à reconsidérer
    dans une spec ultérieure si le besoin se confirme.
- Le codebase a déjà un idiome pour l'unicité forte en CouchDB (pas de
  contrainte native autre que l'unicité d'`_id`) :
  `ProductsRepository.barcodeReservationId` — un document de réservation
  dont l'`_id` est un hash déterministe de la valeur à protéger, dont
  l'insertion échoue nativement avec 409 en cas de doublon. On réutilise ce
  pattern pour l'unicité du nom de rayon.
- Page frontend `frontend/src/pages/Categories.tsx` sert de gabarit UI :
  `react-hook-form` + `zodResolver(insertXSchema)`, `offlineApiRequest`,
  `usePolicy`/`PolicyGuard`, `useOfflineDeleteMutation`, tous les libellés
  passés par `t()`.

## 3. Modèle de données

Ajouts à `backend/src/shared/schema.ts` (et son miroir
`frontend/shared/schema.ts`) :

```ts
export interface Rayon {
  id: string;
  name: string;
  description: string | null;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertRayon {
  id?: string;
  name: string;
  description?: string | null;
  tenantId: string;
}

export const insertRayonSchema = z.object({
  id,
  name: z.string().min(1),
  description: nullableString,
  tenantId: z.string(),
});
```

Sur `Product`/`InsertProduct`/`insertProductSchema` : ajout de
`rayonId?: string | null` (nullable, comme `categoryId` aujourd'hui — les
produits existants restent sans rayon jusqu'à affectation manuelle, pas de
migration de données requise).

Document CouchDB `type: "rayon"` (même forme que `type: "category"`) :
`{_id: couchDocumentId("rayon", id), id, type: "rayon", name, description,
tenantId, createdAt, updatedAt}`.

Document produit : ajout de `rayonId` et d'un résumé dénormalisé
`rayon: {id, name} | null`, au même niveau que `category` actuellement.

## 4. Unicité du nom par tenant

Document de réservation, calqué sur `barcodeReservationId` :

```ts
private rayonNameReservationId(tenantId: string, name: string): string {
  const normalized = name.trim().toLowerCase();
  return `rayon-name:${createHash("sha256").update(`${tenantId}:${normalized}`).digest("hex")}`;
}
```

À la création : insertion de la réservation puis du document rayon, dans
cet ordre (comme pour le code-barres) ; en cas d'échec après réservation,
rollback de la réservation. Un conflit d'insertion de la réservation (409)
devient un `ConflictException("Rayon name already exists")`.

Au renommage (`update` avec un `name` différent) : même mécanisme —
nouvelle réservation pour le nouveau nom, libération de l'ancienne
réservation une fois le renommage confirmé.

## 5. Cycle de vie : pas de suppression ni de désactivation

Un rayon, une fois créé, ne peut être ni supprimé ni désactivé dans cette
phase — seuls la création et le renommage/modification de description sont
possibles. Pas de champ `isActive`, pas de route `DELETE`, pas de garde de
suppression à écrire.

- **Renommage** : cascade vers tous les produits référençant le rayon,
  via une méthode `renameRayonOnProducts(tenantId, rayonId, rayonName)`
  sur `ProductsRepository`, calquée sur `renameCategoryOnProducts`.

Suppression/désactivation restent un besoin réel (mentionné dans la
demande initiale) mais explicitement reporté — voir section 9.

## 6. API & permissions

Nouveau module `backend/src/modules/rayons/` :
`rayons.repository.ts`, `rayons.service.ts`, `rayons.controller.ts`,
`rayons.policy.ts`, `rayons.module.ts`, `dto/create-rayon.dto.ts`,
`dto/update-rayon.dto.ts`.

`RayonsController` : `@UseGuards(JwtAuthGuard, PolicyGuard)` +
`@CheckPolicy(RayonsPolicy, "action")` par route — `GET /api/rayons/:tenantId`
(liste), `POST /api/rayons` (création), `PUT /api/rayons/:id` (modification,
nom/description uniquement). Pas de route `GET /:id` isolée, pas de route
`DELETE`.

**Écart assumé par rapport à la première version de cette section** (qui
mentionnait `GET /rayons`, `GET /rayons/:id`, `PATCH /rayons/:id`) :
en écrivant le plan d'implémentation, il s'est avéré que `categories` — le
gabarit structurel de ce module (section 2) — expose `GET /api/categories/
:tenantId` (liste scopée par tenant dans l'URL, pas de `GET /:id` isolé) et
`PUT /:id` (pas `PATCH`). Aligné ici sur cette convention réellement en
usage dans le reste du code plutôt que sur le choix initial, plus proche
d'un CRUD REST générique mais sans précédent dans ce projet.

`RayonsPolicy extends BasePolicy` :
- `view()` → tous rôles
- `create()` / `update()` → `isAdminOrManager()`

## 7. Frontend

Nouvelle page `frontend/src/pages/Rayons.tsx`, structure copiée de
`Categories.tsx` mais réduite : formulaire (`react-hook-form` +
`zodResolver(insertRayonSchema)`), liste avec recherche, actions
création/édition uniquement (pas de bouton suppression/désactivation),
gérées par `usePolicy(RayonsPolicy)` + `PolicyGuard`, mutations via
`offlineApiRequest`, toasts d'erreur via `showApiErrorToast`. Pas de
`useOfflineDeleteMutation` (aucune suppression). Tous les libellés
ajoutés à `en` et `fr` dans `frontend/src/lib/i18n.ts` (vérifié par
`i18nCompleteness.test.ts`).

Sur le formulaire produit (`ProductModal` ou équivalent) : ajout d'un
sélecteur de rayon (liste de tous les rayons du tenant), optionnel,
indépendant du sélecteur de catégorie existant. Composants `ui/` existants
réutilisés (`Select`), pas de nouveau composant.

Une entrée de navigation vers `/rayons` est ajoutée là où `/categories`
est déjà exposée (menu paramètres/catalogue), avec le même gate de
policy.

## 8. Tests

- `rayons.repository.spec.ts` : construction directe avec `CouchDBService`
  mocké (pas de `TestingModule`), même style que
  `categories.repository.spec.ts` — couvre création, unicité (conflit de
  réservation), renommage en cascade sur les produits.
- `rayons.service.spec.ts`, `rayons.controller.spec.ts` : même pattern que
  leurs équivalents `categories.*.spec.ts`.
- Pas de nouveau test frontend (page React fine reposant sur des hooks
  déjà testés ailleurs, conforme à la convention du projet — pas de
  jsdom/RTL).

## 9. Hors périmètre de cette spec

- Aucun changement au module `categories` existant.
- Aucune logique de prix/coût/devise (spec suivante).
- Aucune migration automatique de produits existants vers un rayon.
- **Suppression et désactivation d'un rayon** : reportées volontairement.
  La demande initiale les mentionnait, mais l'utilisateur a explicitement
  demandé de les retirer de cette phase pour éviter des effets de bord
  ailleurs dans le code. Si le besoin revient, il faudra alors introduire
  `isActive`, une garde de suppression (`hasProductsReferencing` élargi à
  `"rayonId"`), et les actions correspondantes en API/UI — non traité ici.
