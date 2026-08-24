# Authentification 100% locale (installations hors-ligne) — Design

Date : 2026-08-15
Statut : validé pour passage en plan d'implémentation

## 1. Objectif

Certaines installations de StockFlow choisiront de rester **durablement hors-ligne**,
sans jamais dépendre du serveur central (NestJS + Postgres) — y compris pour la
toute première connexion. Aujourd'hui, l'authentification (`AuthContext.tsx`,
`POST /api/auth/login`, `GET /api/auth/me`) exige systématiquement un aller-retour
serveur ; il n'existe aucune infrastructure de compte locale (voir investigation :
aucune base PouchDB "users"/"staff", `LanIdentityService` authentifie un appareil
déjà connu du serveur, pas un humain, et ne fonctionne pas sans backend joignable
au moins une fois).

Cible : une installation en mode local peut créer des comptes, s'authentifier et
gérer des rôles (admin/manager/caissier) sans jamais contacter de serveur, dès le
premier lancement.

## 2. Ce qui ne change pas

- Le mode connecté existant (`AuthContext` → `fetch /api/auth/*` → cookie JWT
  httpOnly → Postgres) reste inchangé pour les installations qui choisissent de se
  connecter à un serveur central.
- La forme exposée par `AuthContext` (`user`, `tenant`, `isAuthenticated`,
  `login()`, `logout()`) ne change pas — le reste de l'app (Sidebar, pages, hooks
  `usePolicy` et les classes `*.policy.ts`) ne lit que cette forme et n'a donc pas
  besoin d'être modifié.
- Les avantages futurs promis aux installations connectées (sync multi-poste,
  supervision à distance, etc.) ne sont pas définis dans ce design — ce document
  couvre uniquement le socle d'authentification locale nécessaire pour tester et
  utiliser l'app sans serveur dès maintenant.

## 3. Décision d'architecture : choix explicite au premier lancement

Deux options évaluées : bascule automatique dès que le backend est injoignable,
ou choix explicite. Décision : **choix explicite**. Un écran de configuration
initiale (avant même le login) demande *"Cette installation restera hors-ligne"*
vs *"Cette installation se connectera à un serveur central"*. Le choix est
persisté (`installMode: "local" | "connected"`) et n'est pas censé changer après
coup — une bascule ultérieure impliquerait de migrer des comptes d'un système à
l'autre, ce qui est explicitement **hors périmètre** de ce design.

Raison : une détection automatique confondrait deux besoins différents — un poste
normalement connecté qui perd le réseau temporairement (déjà couvert par
`offlineApiRequest.ts` pour les données) n'est pas dans la même situation qu'une
installation qui ne sera *jamais* connectée et doit gérer ses propres comptes de
bout en bout.

`AuthContext.tsx` délègue à l'une des deux implémentations selon `installMode`,
sans changer son interface publique.

## 4. Portée

Cette v1 couvre : un poste unique avec plusieurs comptes locaux (admin/manager/
caissier), création du premier compte admin, connexion, gestion des comptes
(page `Staff.tsx`), récupération de mot de passe par code local.

Explicitement **hors périmètre** (à trancher dans un design séparé si besoin) :

- Partage des mêmes comptes entre plusieurs caisses d'une même boutique en mode
  local (chaque installation a sa propre base de comptes, indépendante).
- Migration d'un poste du mode local vers le mode connecté.
- Toute forme de licence/paiement liée aux comptes locaux.

## 5. Modèle de données

Nouvelle base PouchDB locale, dédiée, jamais répliquée : `stockflow_local_accounts`.
Elle existe indépendamment des bases de sync par tenant (`stockflow_<tenantId>`)
déjà utilisées pour produits/catégories/stock/ventes.

```ts
{
  _id: "user:<username normalisé en minuscules>",
  type: "local_user",
  username: string,
  passwordHash: string,        // argon2id (hash-wasm), sel + paramètres inclus
  role: "admin" | "manager" | "cashier",
  active: boolean,
  recoveryCodeHash: string,    // argon2id du code de récupération courant
  recoveryCodeCreatedAt: string,
  createdAt: string,
  updatedAt: string,
}
```

Utiliser le nom d'utilisateur normalisé comme `_id` donne l'unicité gratuitement :
PouchDB rejette l'écriture d'un `_id` déjà existant (conflit natif), donc pas de
vérification "chercher puis créer" sujette aux races.

## 6. Flux

### 6.1 Premier lancement (bootstrap)

En mode local, si `stockflow_local_accounts` est vide, l'app force un écran
"Créer le compte administrateur" avant tout accès au login — variante simplifiée
de l'inscription actuelle (pas de sélection de tenant, rôle `admin` imposé). À la
création, un code de récupération est généré, affiché **une seule fois** dans un
écran dédié ("notez-le, il ne sera plus jamais affiché"), puis seul son hash est
conservé.

### 6.2 Connexion

Recherche du document par `_id`, vérification `argon2Verify(password, passwordHash)`.
En cas de succès, une session locale légère est posée (`{ userId, expiresAt }`
dans `localStorage`) — il n'y a pas de serveur pour émettre un vrai token, ce
marqueur a le même niveau de confiance que `lan-identity.json`, déjà stocké en
clair sur le poste aujourd'hui. Au démarrage de l'app, ce marqueur est relu pour
restaurer la session sans re-demander le mot de passe (équivalent local du
`GET /api/auth/me` actuel).

### 6.3 Récupération de mot de passe

Le lien "Mot de passe oublié ?" (déjà présent sur l'écran de login) bascule en
mode local vers : saisir le nom d'utilisateur + le code de récupération courant →
si `argon2Verify` du code réussit, l'utilisateur définit un nouveau mot de passe
→ un **nouveau** code de récupération est immédiatement généré, affiché une seule
fois, et remplace `recoveryCodeHash`. Le code est à usage unique : consommé
uniquement lors d'une réinitialisation réussie, et immédiatement régénéré pour
que le compte garde toujours un chemin de secours valide — une saisie erronée ne
consomme pas le code, pour éviter qu'une simple faute de frappe ne verrouille
définitivement la récupération. Format du code : lisible/tapable (ex.
`XXXX-XXXX-XXXX`, alphabet sans caractères ambigus), généré par un CSPRNG. Aucune
protection anti brute-force (limitation de tentatives) n'est prévue dans cette
v1 — cohérent avec le niveau de confiance du poste décrit en section 7 ; à
revisiter si le besoin se confirme.

### 6.4 Gestion des comptes

La page `Staff.tsx` existante gère créer/désactiver/changer le rôle d'un compte.
En mode local, ces actions écrivent directement dans `stockflow_local_accounts`
au lieu d'appeler `/api/staff` — seule la couche de données change, l'UI reste la
même.

## 7. Sécurité

- Hachage des mots de passe et codes de récupération : argon2id via `hash-wasm`
  (nouvelle dépendance, WASM, sans coût de build natif).
- Aucun secret en clair n'est jamais persisté : le code de récupération n'est
  affiché qu'une fois, à l'écran, jamais écrit sur disque ni loggué.
- Niveau de confiance du poste : identique à celui déjà accepté pour
  `lan-identity.json` (accès physique au poste = accès aux données locales). Pas
  de chiffrement au repos supplémentaire dans cette v1 ; à revisiter si le besoin
  se confirme.
- Messages d'erreur de connexion génériques (pas d'indice sur l'existence d'un
  compte), cohérents avec le pattern de toasts déjà utilisé dans l'app.

## 8. Gestion d'erreurs

- Identifiants invalides → toast générique, pas de distinction "compte inconnu"
  vs "mot de passe faux".
- Nom d'utilisateur déjà pris → conflit `_id` PouchDB intercepté et traduit en
  message clair sur le formulaire de création de compte.
- Code de récupération invalide/expiré (déjà consommé) → toast générique, pas de
  distinction avec un mauvais code.

## 9. Tests

Toute la logique métier (hachage/vérification argon2id, génération et
vérification du code de récupération, construction et validation des documents,
détection de conflit d'unicité) est extraite dans un module pur `lib/localAuth.ts`,
testé unitairement de façon exhaustive — conforme à la convention du projet
(logique métier testée en `lib/`, composants React fins glue-only non testés,
cf. `useNativeLANAgent.ts`). Le branchement dans `AuthContext.tsx` et l'écran de
bootstrap restent des composants fins non testés.
