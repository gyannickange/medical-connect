# Chiffrement au repos de la base locale — Design

Date : 2026-08-16
Statut : validé pour passage en plan d'implémentation

## 1. Objectif

Audit critique mené sur les stratégies de stockage local de StockFlow (voir
section 3) : à ce jour, aucune donnée locale n'est protégée contre un accès
qui contourne l'application — fichiers PouchDB, clé d'identité LAN, session
locale, tout est lisible ou falsifiable directement sur disque, sans jamais
passer par l'écran de connexion.

Exigence du porteur du projet, formulée explicitement : les données ne
doivent être lisibles **que depuis l'application elle-même**, jamais en
allant chercher directement sur le disque ou ailleurs hors de l'application
— avec une exigence renforcée pour les instances qui fonctionnent en mode
local (sans serveur central). L'authentification ne doit pas non plus être
« à vie » : une session doit expirer, et une inactivité prolongée (1 heure)
doit provoquer une déconnexion automatique.

## 2. Modèle de menace

**Dans le périmètre** : un attaquant qui récupère la machine ou son disque
physiquement (vol, disque démonté, copie hors ligne des fichiers) **sans**
disposer de la session OS ouverte (pas le mot de passe Windows/macOS de la
caisse).

**Hors périmètre, décision explicite** : un attaquant qui dispose déjà de la
session OS ouverte de la caisse. Protéger contre ce cas nécessiterait une
passphrase applicative distincte saisie à chaque lancement, écarté pour ne
pas ajouter de friction quotidienne au personnel de caisse.

**Hors périmètre** également : la sécurité du serveur central (PostgreSQL /
CouchDB) en tant que telle. Le serveur central reste toutefois le
dépositaire de la Tenant Data Key (section 5) — sa compromission sort du
périmètre de ce design, mais ce n'est pas une architecture de bout-en-bout :
c'est écrit noir sur blanc pour que ce ne soit pas une découverte tardive.

## 3. Constat de l'audit

Vérification effectuée sur le code actuel (pas une supposition) :

1. **Aucun chiffrement au repos nulle part.** `frontend/src/lib/pouchdb.ts`
   utilise `pouchdb-adapter-idb` : les données vivent en clair dans des
   fichiers SQLite (WebKit/macOS) ou LevelDB (WebView2/Windows).
2. **`createPouchDB()` est le point de passage unique** de tout le stockage
   local : `stockflow_local_accounts`, `stockflow_cache` (utilisé en mode
   local ET connecté), et à terme `stockflow_<tenantId>` (vague 1 de
   `2026-08-09-lan-peer-sync-design.md`).
3. **Identifiant admin par défaut auto-provisionné.**
   `frontend/src/lib/localAccountsStore.ts:104-107` —
   `DEFAULT_LOCAL_ADMIN = { username: "admin", password: "admin123" }`,
   créé par `seedDefaultLocalAdmin()`, appelé sans condition dès le premier
   lancement local par `frontend/src/components/InstallModeGate.tsx:39-45`.
4. **Une page de création d'admin avec mot de passe choisi existe déjà**
   (`frontend/src/pages/CreateLocalAdmin.tsx`, route `/setup/create-admin`,
   `App.tsx:52`) mais est inatteignable — `InstallModeGate` sème l'admin par
   défaut avant que l'utilisateur puisse jamais y arriver. Décision du
   porteur du projet (section 7) : ne pas rendre cette page atteignable,
   la supprimer et fournir l'identifiant initial par un autre mécanisme.
5. **La session locale est falsifiable sans mot de passe.**
   `frontend/src/contexts/AuthContext.tsx:80-108` (`checkAuthLocal`) relit
   `{userId, expiresAt}` depuis `localStorage["stockflow_local_session"]` —
   un JSON non signé — sans revérifier aucun secret.
6. **La clé privée d'identité LAN est encore moins protégée que le reste.**
   `frontend/src-tauri/src/lan_agent.rs:392-415` écrit la clé Ed25519 en
   clair (base64) dans un fichier JSON. `0600` sur Unix ; **aucune
   restriction sur Windows**.
7. **`/api/lan-identity/certificate` n'a aucune notion d'autorisation
   d'appareil.** `backend/src/modules/lan-identity/lan-identity.controller.ts`
   émet un certificat LAN de confiance pour n'importe quel `deviceId` fourni
   par n'importe quel utilisateur authentifié — aucune étape d'approbation.
   Signalé ici car ce design introduit exactement ce concept d'autorisation
   d'appareil (section 5) pour un besoin différent (la Tenant Data Key) ;
   corriger cet endpoint existant relève de la conception LAN, pas de ce
   design, mais laisser l'incohérence non documentée serait malhonnête.
8. **Le flag `isEncrypted` des réglages est décoratif.** Rien n'est
   implémenté derrière.
9. **Aucune primitive de trousseau OS n'existe dans le projet.**

## 4. Deux clés, deux portées

**Erreur initiale de ce design, corrigée ici** : une première version
proposait une clé de chiffrement unique dérivée du `device_id`. Ça ne
fonctionne pas dès qu'un document doit être lu par un autre appareil que
celui qui l'a écrit — exactement le cas de la réplication PouchDB/CouchDB
pair-à-pair. Il faut deux clés distinctes, à deux portées différentes :

### 4.1 Device Master Key

Générée une fois par appareil, au premier lancement, via CSPRNG côté Rust,
stockée dans le trousseau OS (crate `keyring` : Keychain macOS / Credential
Manager Windows / Secret Service Linux — se déverrouille avec la session OS,
aucune saisie supplémentaire pour le personnel), indexée par `device_id`
(`caisse1`/`caisse2` sur une même machine ont des clés indépendantes).

Par HKDF-SHA256, avec des chaînes de contexte distinctes, elle dérive :

- `local-data-key` : chiffre `stockflow_local_accounts` et `stockflow_cache`
  — ces deux bases ne sont **jamais répliquées**, donc aucune raison de
  partager leur clé entre appareils. C'est aussi ce qui préserve la vraie
  promesse du mode local : zéro dépendance réseau, y compris pour sa clé de
  chiffrement.
- `session-signing-key` : signe le jeton de session (section 8).

Ne jamais réutiliser directement la Device Master Key comme clé AES ou HMAC
— c'est le couplage à éviter, d'où la dérivation HKDF avec séparation de
domaine explicite.

La même commande `keyring` remplace le fichier JSON en clair de
`lan_agent.rs` pour la clé de signature Ed25519 (le certificat et la clé
publique de la CA, publics par nature, restent dans le fichier JSON).

### 4.2 Tenant Data Key

Une seule clé AES-256 par tenant, générée côté serveur, partagée par tous
les appareils **autorisés** de ce tenant. Chiffre `stockflow_<tenantId>`
(produits/stock/ventes, vague 1) — la base qui se réplique réellement entre
caisses et vers CouchDB central. Utilisée directement (pas de dérivation
supplémentaire : un seul usage aujourd'hui, en dériver d'autres maintenant
serait de la sur-ingénierie sans besoin identifié).

Génération : au premier appareil qui la demande pour un tenant donné,
**via une contrainte d'unicité en base** (insert-or-select transactionnel),
pour éviter que deux caisses démarrant en même temps sur un tenant tout
neuf ne génèrent chacune leur propre clé. Stockée dans une nouvelle table
Postgres (`tenant_data_keys`), **chiffrée au repos** sous un secret serveur
dédié (nouveau `TENANT_DATA_KEY_ENCRYPTION_SECRET`, même schéma que
`LAN_CERTIFICATE_PRIVATE_KEY`) — même si la sécurité du serveur central est
hors périmètre, laisser un secret en clair dans une table alors que le
mécanisme de protection existe déjà ailleurs dans le projet n'a pas de
raison d'être.

Distribution : voir section 5 — deux chemins, un via le serveur central, un
en pair-à-pair sur LAN.

## 5. Autorisation des appareils

Point central du modèle : **l'authentification utilisateur ne donne pas
accès aux données du tenant.** Un utilisateur peut réussir son login ; son
appareil doit être autorisé séparément avant de recevoir la Tenant Data Key.
Être sur le même réseau local ne donne aucun accès.

Nouvelle table `device_authorizations` (`tenantId`, `deviceId`,
`devicePublicKey` X25519, `status`: `pending` / `approved` / `revoked`,
`requestedAt`, `decidedAt`, `decidedByDeviceId` — voir 5.1, peut référencer
un utilisateur backend ou un appareil pair selon le chemin emprunté).

### 5.1 Bootstrap du tout premier appareil

**« Premier appareil qui demande = auto-approuvé » est rejeté** : ça permet
à un attaquant qui gagne la course contre le véritable propriétaire de
devenir l'autorité fondatrice du tenant. L'auto-approbation est liée à
deux conditions cumulatives, pas à l'ordre d'arrivée :

- **État explicite du tenant** : nouvelle colonne `tenants.initialized`
  (défaut `false`). Aucune auto-approbation n'est possible si
  `initialized = true` — donc même en cas de perte totale de tous les
  appareils approuvés après coup, ce chemin ne se rouvre pas tout seul.
- **Secret de provisioning à usage unique** : généré à la création du
  tenant (`POST /api/auth/register`, `backend/src/modules/auth/
  auth.controller.ts:26`), affiché une seule fois à la personne qui
  finalise l'inscription — même schéma que `generateRecoveryCode()` dans
  `localAuth.ts` (haché en base, jamais stocké en clair, invalidé après la
  première utilisation réussie, expiration à 48h). Le premier appareil doit
  présenter ce secret, en plus d'un JWT valide pour ce tenant, pour être
  auto-approuvé. Ce découplage entre « qui s'est inscrit en ligne » et
  « qui configure physiquement la première caisse » est nécessaire : ce
  n'est pas forcément la même personne ni le même appareil.

Une fois le premier appareil approuvé, `tenants.initialized` passe à
`true` et **tout** appareil suivant, y compris un second appareil du même
utilisateur fondateur, doit passer par une approbation explicite (5.2 ou
5.3) — plus jamais par l'auto-approbation.

### 5.2 Chemin A — via le serveur central

1. Un appareil non autorisé appelle `POST /api/device-authorization/request`
   (JWT), avec son `deviceId` et sa clé publique **X25519** dédiée à cet
   usage (distincte de la clé de signature Ed25519 de l'identité LAN —
   Ed25519 signe, ne chiffre pas ; il faut une paire dédiée à l'échange de
   clé).
2. Hors bootstrap (5.1) : le backend enregistre la demande en `pending` et
   notifie les appareils déjà `approved` du tenant via
   `signalingService.broadcastToTenant()` (mécanisme déjà utilisé par
   `backend/src/websocket/signaling.gateway.ts` — pas de nouveau canal).
3. Un admin déjà autorisé approuve ou refuse. Routes derrière
   `@UseGuards(JwtAuthGuard, PolicyGuard)` +
   `@CheckPolicy(DeviceAuthorizationPolicy, "approve")`, même schéma que le
   reste du projet (`*.policy.ts` existants).
4. À l'approbation, le backend chiffre la Tenant Data Key pour cet appareil
   précis : ECDH X25519 entre une clé éphémère serveur et la clé publique
   X25519 de l'appareil, HKDF sur le secret partagé, AES-256-GCM de la
   Tenant Data Key sous cette clé dérivée à usage unique (schéma « sealed
   box » standard). Jamais en clair, y compris dans les journaux serveur —
   au-delà de la protection TLS du transport.
5. Le tenant est dérivé de `request.user.tenantId` (JWT), jamais d'un champ
   fourni par le client — même garde-fou que le contrôleur `lan-identity`
   existant.

### 5.3 Chemin B — pair-à-pair sur LAN, sans serveur

Nécessaire pour le cas explicitement demandé : un admin déjà autorisé, sans
connexion Internet, doit pouvoir approuver un nouvel appareil et lui
transmettre la clé directement sur le réseau local.

1. Le nouvel appareil diffuse une demande d'accès sur le canal LAN direct
   déjà utilisé pour les verrous d'édition produit (`useProductLock.ts`,
   même transport que celui décrit dans `2026-08-09-lan-peer-sync-design.md`
   §6.1) : `deviceId`, clé publique X25519, et son identité LAN Ed25519
   auto-générée localement (le nouvel appareil n'a pas besoin d'avoir
   jamais contacté le serveur central pour émettre cette demande).
2. L'admin voit la demande sur son propre appareil (déjà `approved`, donc
   déjà en possession de la Tenant Data Key en mémoire/trousseau) et
   l'approuve après confirmation visuelle d'une empreinte courte dérivée de
   la clé publique du nouvel appareil (comparaison affichée des deux côtés,
   même logique qu'un appairage Bluetooth — évite qu'un appareil qui se
   contente d'écouter le LAN puisse se faire approuver sans que l'admin
   sache réellement à qui il parle). **Préalable à cette étape** : l'appareil
   approbateur doit présenter une **Approval Capability** — un claim signé
   distinct du certificat LAN (même clé de signature CA que
   `LanIdentityService`, mais durée de vie propre et volontairement courte,
   12h, pas 30 jours comme le certificat). Sans ce préalable, un admin
   révoqué mais pas encore resynchronisé pourrait continuer à approuver de
   nouveaux appareils hors ligne indéfiniment, tant que son certificat LAN
   général reste valide — coupler cette autorité à la durée de vie du
   certificat LAN (30 jours) serait beaucoup trop permissif pour ce cas
   précis. Émise par le même endpoint que 5.2 (policy
   `DeviceAuthorizationPolicy`, JWT), rafraîchie opportunistement dès que
   l'appareil a de la connectivité ; expirée, elle bloque le chemin B côté
   appareil approbateur avant même de contacter le nouvel appareil.
3. L'appareil approbateur effectue lui-même le scellement X25519 (même
   primitive qu'en 5.2.4) avec la Tenant Data Key qu'il détient déjà, et
   l'envoie directement sur le canal LAN — aucun aller-retour serveur.
4. L'appareil approbateur signe un enregistrement d'octroi
   (`{grantedDeviceId, grantedByDeviceId, tenantFingerprint, decidedAt}`)
   avec sa propre clé de signature Ed25519 (identité LAN existante), et le
   met en file pour remontée asynchrone vers `device_authorizations` côté
   serveur dès que la connectivité revient — même philosophie que
   `frontend/src/lib/offlineOperationQueue.ts` pour le reste du projet.
   Jusqu'à la remontée, l'écran « appareils autorisés » (section 9) d'un
   appareil qui n'a pas encore vu la synchronisation peut être temporairement
   en retard sur la réalité du LAN — cohérence à terme, pas immédiate,
   assumé comme le reste de l'architecture de réplication.

Un tenant « connecté » a toujours eu, par construction, au moins un moment
en ligne (sa création via `/api/auth/register`), donc le chemin B ne pose
jamais la question d'une racine de confiance totalement hors ligne : il
prolonge un premier appareil déjà légitimé via 5.1+5.2, il ne la remplace
pas.

## 6. Chiffrement des documents PouchDB

Module `frontend/src/lib/pouchdbEncryption.ts`, WebCrypto AES-256-GCM (IV
aléatoire 12 octets par écriture), enveloppant l'objet retourné par
`createPouchDB()` — `put`/`bulkDocs` chiffrent, `get`/`allDocs`/`find`/
`changes` déchiffrent après lecture. La réplication (`sync`,
`replicate.to/from`) opère sur la base brute : seul le texte chiffré
traverse le réseau.

Quelle clé pour quelle base : `stockflow_local_accounts` et
`stockflow_cache` → `local-data-key` (section 4.1) ; `stockflow_<tenantId>`
→ Tenant Data Key (section 4.2). Le wrapper choisit selon le nom de la base.

**Champs en clair et AAD** : `_id`/`_rev` restent en clair (obligatoire
PouchDB/CouchDB), de même que `type`, `schemaVersion`, `state`, `tenantId`,
`deviceId` — nécessaires à l'index Mango existant de
`createIndexes()` (`frontend/src/lib/pouchdb.ts`) pour la file de
synchronisation offline. Tout le reste (noms, prix, quantités, montants,
hash de mot de passe, informations personnelles) est chiffré. Ces champs
en clair sont passés en **AAD (Additional Authenticated Data)** à
AES-GCM — supporté nativement par `crypto.subtle` côté frontend et par la
crate `aes-gcm` côté Rust. Un attaquant avec accès aux fichiers bruts peut
donc toujours voir ces métadonnées, mais ne peut pas les modifier (par
exemple réécrire un `tenantId`) sans faire échouer l'authentification GCM
au déchiffrement.

**Garde-fou obligatoire pour les recherches** : un selector Mango ou un
`createIndex` portant sur un champ chiffré (`price`, `name`, etc.) ne lève
pas d'erreur naturellement — PouchDB matche silencieusement contre du texte
chiffré et renvoie un résultat vide ou faux. Le wrapper `find()`/
`createIndex()` doit donc valider explicitement que tout champ référencé
appartient à la liste blanche ci-dessus, et lever une erreur claire sinon.
Toute recherche sur un champ métier doit être faite après déchiffrement,
côté application, jamais déléguée à Mango.

## 7. Provisioning du premier admin local

`seedDefaultLocalAdmin()` et `DEFAULT_LOCAL_ADMIN` sont supprimés — un
identifiant par défaut, même documenté comme « à changer », est une fenêtre
de risque permanente tant que personne ne le change, et rien ne le force.

**Décision du porteur du projet, tranchée** : un seul mécanisme, pas deux
qui coexistent. `frontend/src/pages/CreateLocalAdmin.tsx`, sa route
`/setup/create-admin` (`App.tsx:52`) et son entrée dans `SETUP_PATHS`
(`InstallModeGate.tsx`) sont **supprimés**, pas simplement rendus
atteignables. Le seul mécanisme retenu est un identifiant défini par
installation, via variable d'environnement lue côté processus Tauri (Rust),
**pas** via `import.meta.env.VITE_*` de Vite : ce dernier est compilé dans
le bundle JS livré, identique et inspectable pour toutes les
installations, alors que l'app est distribuée comme un seul build pour
plusieurs boutiques — aucun point d'injection par boutique à cet endroit.
Une variable d'environnement lue par le binaire Rust au démarrage
(`std::env::var`), elle, est bien propre à chaque machine installée.

Mécanisme : nouvelle commande Tauri lisant
`STOCKFLOW_INITIAL_ADMIN_USERNAME` / `STOCKFLOW_INITIAL_ADMIN_PASSWORD` au
démarrage. `InstallModeGate.tsx`, quand `countLocalAccounts() === 0`,
appelle cette commande au lieu de `seedDefaultLocalAdmin()`, et crée le
compte via `createLocalAccount()` existant (même hachage argon2id, aucun
changement côté `localAuth.ts`) avec les valeurs reçues.

Comportement en l'absence de variable, même schéma que
`LanIdentityService` (`backend/src/modules/lan-identity/
lan-identity.service.ts:37-54`) pour `LAN_CERTIFICATE_PRIVATE_KEY` : en
build de production, blocage dur — `InstallModeGate` bascule dans son état
`failed` déjà existant (ligne 77-90), aucun compte n'est créé, l'application
ne devient pas utilisable sans configuration explicite. En build de
développement (`cfg!(debug_assertions)`), génération d'un mot de passe
aléatoire à usage unique, affiché en clair dans la console de
développement — jamais dans l'UI livrée — pour ne pas bloquer le
développement local sans réintroduire un identifiant deviné.

## 8. Session locale

### 8.1 Session falsifiable

Le jeton `{userId, expiresAt}` devient `{userId, expiresAt, sig}`, `sig`
étant un HMAC-SHA256 calculé avec `session-signing-key` (section 4.1, dérivée
séparément de la clé de chiffrement des données — pas de réutilisation de
clé entre AES-GCM et HMAC). `checkAuthLocal()` vérifie `sig` avant de faire
confiance à `userId`.

### 8.2 Cycle de vie

- Plafond absolu de 7 jours depuis la connexion, intégré au jeton signé,
  infranchissable.
- Minuteur d'inactivité de **60 minutes**, appliqué aux deux modes (local et
  connecté) — mécanisme purement frontend, ne touche pas au contrat
  JWT/cookie du backend. Implémenté par comparaison périodique (~30s) entre
  `Date.now()` et un `lastActivityAt` persisté (timestamp mural), mis à jour
  par les événements souris/clavier/tactile avec anti-rebond — **pas** un
  simple `setTimeout(60min)`, qui ne survit pas fiablement à une mise en
  veille de l'OS (une caisse réveillée après 3h de veille ne doit pas
  hériter d'un timer JS qui pense que 0 seconde s'est écoulée).

## 9. Révocation et récupération

**Révocation** : nouvelle section dans `Settings.tsx` listant les appareils
`device_authorizations` du tenant (statut, dernière activité, chemin
d'approbation A ou B), avec action de révocation (passe `status` à
`revoked`, policy `DeviceAuthorizationPolicy` comme section 5). Un appareil
révoqué garde toutefois la Tenant Data Key déjà mise en cache dans son
trousseau OS jusqu'à la prochaine rotation — explicitement documenté comme
limite acceptée (section 11), pas de rotation en v1.

**Récupération — traiter une base locale cassée comme une réplique à
reconstruire, jamais comme un ordre de suppression** : si la Tenant Data Key
d'un appareil est perdue ou son cache local corrompu, la procédure est de
vider la réplique locale `stockflow_<tenantId>` de cet appareil et de la
reconstruire par une resynchronisation complète depuis les pairs/CouchDB
après ré-autorisation (section 5) — jamais d'émettre des suppressions
compensatoires pour des documents « manquants » localement, ce qui
supprimerait les données des autres caisses.

**Cas sans recours** : si la Device Master Key d'un appareil en mode local
pur (`stockflow_local_accounts`/`stockflow_cache`, jamais répliquées) est
perdue — trousseau OS corrompu ou système réinstallé — ces données locales
sont définitivement irrécupérables, il n'existe aucune autre copie nulle
part. C'est une limite inhérente au mode local (section 11), pas un oubli :
Stock Flow doit échouer de façon visible et bloquante dans ce cas, jamais
régénérer silencieusement une nouvelle clé qui laisserait les anciennes
données chiffrées illisibles à jamais sans le signaler.

**Trousseau OS indisponible** : `get-or-create` doit distinguer une
installation neuve (aucune donnée chiffrée locale existante → générer) d'une
base chiffrée existante dont la clé a disparu (→ erreur fatale bloquante,
jamais de régénération silencieuse). Ce même bug existe déjà aujourd'hui
dans `lan_agent.rs` (`load_identity` régénère silencieusement une identité
si le fichier est absent ou invalide) — à corriger dans le même effort
puisque le mécanisme de stockage change de toute façon.

## 10. Tests

Unitaires purs, cohérent avec la convention du projet (pas de RTL/jsdom) :

- Aller-retour chiffrement/déchiffrement, y compris avec AAD.
- Rejets négatifs explicites : octet de texte chiffré modifié, IV modifié,
  champ AAD modifié, mauvaise clé, texte chiffré d'un tenant injecté dans un
  autre — chacun doit lever une erreur d'authentification, jamais renvoyer
  un résultat silencieusement faux.
- `find()`/`createIndex()` sur un champ non whitelisté lève une erreur.
- Signature/vérification HMAC de session ; `expiresAt` modifié → signature
  invalide → session rejetée.
- Minuteur d'inactivité comme fonction pure (comparaison de timestamps),
  séparée du listener DOM ; scénario de reprise après veille simulée > 60
  min → session expirée.
- Logique `get-or-create` du trousseau : installation neuve → création ;
  données chiffrées existantes + clé absente → erreur fatale, jamais de
  nouvelle clé silencieuse.
- Bootstrap : `tenants.initialized = true` bloque toute auto-approbation ;
  secret de provisioning invalide, expiré ou déjà utilisé → refusé ; requête
  concurrente de génération de Tenant Data Key ne produit qu'une seule clé
  (contrainte d'unicité).
- Chemin A : `request.user.tenantId` fait foi, tout `tenantId` fourni par le
  client est ignoré.
- Chemin B : signature Ed25519 de l'enregistrement d'octroi vérifiable ;
  scellement/descellement X25519 réussit avec la bonne clé privée, échoue
  avec une autre ; enregistrement d'octroi mis en file pour remontée
  asynchrone ; Approval Capability expirée (> 12h) bloque l'approbation
  côté appareil approbateur avant tout envoi sur le LAN.
- Provisioning du premier admin local : variable d'environnement absente en
  build production → état `failed`, aucun compte créé ; présente → compte
  créé avec les valeurs fournies, jamais `admin`/`admin123`.

Côté Rust : tests pour la commande `keyring` et le chargement/sauvegarde de
l'identité LAN modifié, style déjà présent dans `lan_agent.rs`.

Playwright : premier lancement local sans variable d'environnement affiche
l'état bloquant, jamais un compte utilisable ; un appareil `pending` ne peut
pas déchiffrer `stockflow_<tenantId>`.

## 11. Risques et limites acceptées

- **Pas de protection contre un attaquant disposant déjà de la session OS**
  — décision explicite (section 2).
- **Pas de rotation de clé en v1** — un appareil révoqué (section 9) garde
  la Tenant Data Key qu'il a déjà en cache ; un vol de clé de trousseau OS
  (scénario hors périmètre, suppose déjà la session OS) reste valable
  indéfiniment.
- **Perte définitive des données purement locales si la Device Master Key
  est perdue** — inhérent au mode local, pas de copie ailleurs (section 9).
- **`/api/lan-identity/certificate` reste sans autorisation d'appareil** —
  incohérence signalée (section 3, point 7), correction laissée à la
  conception LAN.
- **Le serveur central est dépositaire de la Tenant Data Key** — sa
  compromission expose les données de tous les tenants qu'il sert ; sécurité
  du serveur central hors périmètre (section 2), mais la clé y est au moins
  chiffrée au repos (section 4.2), pas laissée en clair par facilité.
- **Le mode local sans variable d'environnement configurée est
  définitivement bloqué en production** — comportement intentionnel
  (section 7), pas un bug : mieux vaut une installation qui refuse de
  démarrer qu'une installation avec un identifiant deviné.
- **La réconciliation du chemin B (5.3) vers le serveur central n'est pas
  immédiate** — un appareil qui n'a pas encore resynchronisé peut afficher
  une liste d'appareils autorisés temporairement en retard sur la réalité
  du LAN.
- **Un admin révoqué hors ligne garde la capacité d'approuver de nouveaux
  appareils via le chemin B pendant au plus 12h** — durée de vie de
  l'Approval Capability (5.3). Fenêtre volontairement bornée et courte,
  pas nulle : réduire encore ce délai nécessiterait de forcer une
  connectivité plus fréquente, ce qui contredit l'objectif même du chemin
  B (fonctionner sans serveur joignable).
- **Pas de migration de données existantes** — projet non déployé,
  remplacement direct.
- **Agrégations CouchDB limitées aux champs en clair** — déjà un compromis
  assumé par `2026-08-09-lan-peer-sync-design.md`.

## 12. Hors périmètre de ce design

- Rotation de la Tenant Data Key et de la Device Master Key.
- Protection contre un attaquant disposant de la session OS de la caisse.
- Sécurité du serveur central en tant que telle (au-delà du chiffrement au
  repos de la Tenant Data Key elle-même, section 4.2).
- Gate d'autorisation d'appareil sur `/api/lan-identity/certificate`
  (signalé, non corrigé ici).
- Détail d'implémentation des vues CouchDB / index Mango pour le tableau de
  bord (vague 1 du design LAN).
