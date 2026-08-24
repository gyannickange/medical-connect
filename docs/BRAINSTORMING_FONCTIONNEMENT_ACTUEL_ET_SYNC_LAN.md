# Brainstorming — fonctionnement actuel de StockFlow et synchronisation LAN

Date de l'audit : 8 août 2026

> Mise à jour : après confirmation que StockFlow utilise un backend distant
> unique et plusieurs frontends locaux, le prototype multicast exécuté dans le
> backend a été retiré. La cible validée est désormais un agent natif local
> intégré à l'application desktop.

## Conclusion rapide

La fonctionnalité LAN n'est pas partie de zéro. Avant le dernier ajout, le
projet contenait déjà :

- une découverte de pairs par WebSocket ;
- une négociation WebRTC ;
- un canal WebRTC `sync` ;
- une réplication PouchDB vers l'URL HTTP d'un pair ;
- deux cartes d'interface pour activer la découverte et la synchronisation ;
- un système de file d'opérations hors ligne dans PouchDB.

Le nouvel ajout apporte une vraie découverte multicast sur le réseau local et
renforce plusieurs contrôles de tenant. Il ne résout cependant pas le problème
le plus important : les données métier affichées par StockFlow vivent
principalement dans PostgreSQL, alors que la réplication entre pairs transporte
des documents PouchDB.

En l'état, on peut donc détecter un autre backend et ouvrir une réplication
PouchDB sans garantir que les produits, ventes, stocks, clients et autres données
PostgreSQL convergent entre les caisses.

**Verdict actuel : infrastructure de découverte partiellement fonctionnelle,
mais synchronisation métier LAN de bout en bout non démontrée et probablement
incorrecte.**

## 1. Comment l'application fonctionne actuellement

### 1.1 Architecture générale

StockFlow est composé de deux parties :

1. un frontend React exécuté dans le navigateur ;
2. un backend NestJS/Fastify qui expose les API métier, l'authentification, le
   serveur WebSocket et un endpoint compatible CouchDB/PouchDB.

Le backend écoute sur toutes les interfaces réseau (`0.0.0.0`) et peut donc être
joint depuis le LAN si le pare-feu autorise son port HTTP.

### 1.2 Source de vérité métier

Les services métier utilisent `DatabaseStorage`, Drizzle ORM et PostgreSQL.
Cela concerne notamment :

- les tenants et utilisateurs ;
- les produits, variantes et prix ;
- les catégories et fournisseurs ;
- les clients et employés ;
- les stocks et mouvements de stock ;
- les ventes et lignes de vente ;
- les paramètres, audits et statuts de synchronisation.

Les lectures habituelles de l'interface passent par `/api/...` et lisent donc
PostgreSQL. Les écritures habituelles passent elles aussi par ces API et
modifient PostgreSQL.

### 1.3 Authentification et tenant (probleme)

Après connexion, le backend place un JWT dans un cookie. Le JWT contient le
tenant de l'utilisateur. `JwtStrategy` recharge ensuite l'utilisateur depuis la
base avant d'accepter une requête protégée.

Conséquence importante : si PostgreSQL est distant et réellement indisponible,
une session JWT existante peut ne pas suffire, car sa validation recharge encore
l'utilisateur dans PostgreSQL. Le mode hors ligne complet dépend donc de la
topologie réelle du PostgreSQL utilisé sur chaque caisse.

### 1.4 Lecture hors ligne

Les réponses GET réussies sont copiées dans une base PouchDB distincte appelée
`stockflow_cache`.

En cas d'échec réseau :

- l'application tente de retrouver la réponse par URL dans ce cache ;
- elle affiche donc un instantané précédemment lu ;
- ce cache n'est pas la base PouchDB actuellement utilisée pour la réplication
  entre pairs (`stockflow_<tenantId>`).

Le cache de lecture et la base répliquée sont donc deux bases différentes.

### 1.5 Écriture hors ligne

Quand une requête POST, PUT, PATCH ou DELETE échoue à cause du réseau,
`offlineApiRequest` crée un document d'opération dans
`stockflow_<tenantId>`.

Le document conserve notamment :

- la méthode HTTP ;
- l'URL ;
- la collection ;
- le payload ;
- l'identifiant de l'opération ;
- le tenant et l'appareil d'origine ;
- un état `pending`, `replaying`, `synced`, `failed` ou `conflict`.

Quand Internet revient, `useOfflineSync` rejoue ces requêtes vers l'API HTTP
locale/courante.

Limite : une écriture qui réussit immédiatement dans PostgreSQL n'est pas
ajoutée à cette file. Elle ne devient donc pas automatiquement un document à
répliquer sur le LAN.

## 2. Fonctionnalité LAN qui existait déjà

La fonctionnalité historique est visible dans les commits `c4a95b8` et
`e883de3`, ainsi que dans les fichiers `useLANDiscovery.ts`, `usePeerSync.ts` et
`signaling.gateway.ts`.

### 2.1 Découverte WebSocket historique

Quand l'utilisateur activait le bouton de découverte :

1. le navigateur ouvrait `/api/ws/signaling` sur `window.location.host` ;
2. il envoyait son `peerId` et son `tenantId` ;
3. le serveur conservait les pairs dans une `Map` en mémoire ;
4. le serveur ne retournait que les pairs déclarés dans le même tenant ;
5. les offres, réponses et candidats WebRTC étaient relayés par ce serveur.

### 2.2 Pourquoi cette découverte n'était pas réellement autonome sur le LAN

Deux topologies sont possibles, et chacune pose un problème différent.

#### Un backend séparé sur chaque caisse

Chaque navigateur se connecte à son propre serveur de signalisation. Les
registres de pairs étant seulement en mémoire dans chaque backend, Caisse 1 ne
voit jamais les connexions conservées par le backend de Caisse 2.

Il n'existait ni multicast, ni mDNS, ni balayage réseau, ni serveur commun
accessible hors ligne. Deux instances autonomes ne pouvaient donc pas se
découvrir.

#### Un backend central partagé par toutes les caisses

Le serveur commun peut voir tous les WebSocket, mais l'adresse annoncée comme
`host` est dérivée du serveur HTTP et peut désigner le serveur central plutôt que
la caisse cliente. L'endpoint PouchDB annoncé n'est alors pas forcément une base
locale appartenant au navigateur pair.

Cette topologie dépend aussi de la disponibilité du serveur central et ne répond
pas au scénario de plusieurs installations autonomes sans Internet.

### 2.3 WebRTC historique

Une connexion WebRTC et un data channel `sync` étaient créés. Cependant, le
gestionnaire de message contient encore le commentaire :

> Handle sync data here - integrate with PouchDB sync

Aucune donnée PouchDB ou métier n'est envoyée sur ce canal. WebRTC servait donc
principalement d'indicateur de connexion.

La configuration référence également le STUN public de Google. Les candidats
LAN locaux peuvent parfois suffire, mais cette dépendance n'est pas cohérente
avec une promesse de fonctionnement entièrement hors Internet.

### 2.4 Réplication PouchDB historique

`usePeerSync` ne synchronise pas via le data channel WebRTC. Il construit
directement une URL :

`http(s)://<ip-du-pair>:<port>/api/pouchdb/<tenantId>`

Puis `startPeerSync` lance une réplication PouchDB bidirectionnelle avec les
options `live` et `retry`.

L'intention est bonne, mais la topologie est incomplète :

- le navigateur A réplique sa base avec le backend B ;
- le navigateur B réplique sa base avec le backend A ;
- rien ne garantit que le navigateur B réplique aussi avec le PouchDB de son
  propre backend B ;
- une opération envoyée par A dans le backend B peut donc rester dans le backend
  B sans être consommée par le navigateur B.

Autrement dit, les liens sont croisés, mais il manque une règle claire disant
quelle base est canonique sur chaque caisse et qui applique ses changements à
PostgreSQL.

### 2.5 Isolation tenant historique

Le filtrage dans `SignalingService` comparait bien les `tenantId`. Mais, avant le
renforcement récent, le serveur WebSocket générait lui-même un jeton à partir du
`tenantId` fourni par la connexion non authentifiée. Vérifier qu'un tenant existe
n'est pas une preuve que l'appareil appartient à ce tenant.

Le filtrage logique était donc présent, mais la preuve d'appartenance n'était pas
suffisante.

## 3. Ce que le dernier ajout a changé

### 3.1 Nouvelle découverte multicast backend

Chaque backend rejoint le groupe UDP multicast `239.255.83.70:45837` et annonce
les tenants actuellement utilisés par une session locale authentifiée.

Une annonce contient :

- un identifiant aléatoire d'instance backend ;
- le port HTTP ;
- une empreinte HMAC du tenant ;
- un horodatage et un nonce ;
- une signature HMAC.

L'adresse IP utilisée est celle du datagramme reçu, pas une adresse déclarée par
l'émetteur.

### 3.2 Filtrage et sécurité ajoutés

- `/api/lan/activate` et `/api/lan/peers` utilisent le tenant du JWT.
- Une annonce expirée ou mal signée est ignorée.
- Une annonce valide mais appartenant à un autre tenant actif n'est pas exposée.
- L'émission de jeton PouchDB exige maintenant une session JWT du même tenant.
- L'accès brut à express-pouchdb est vérifié avant de transmettre la requête.
- Le WebSocket historique doit maintenant recevoir un jeton fourni par un
  utilisateur authentifié au lieu d'en fabriquer un à partir d'une déclaration.

### 3.3 Réplication automatique ajoutée

`GlobalLANSync` démarre après l'authentification, interroge les pairs toutes les
trois secondes et appelle le même `startPeerSync` historique.

Cela supprime le besoin d'activer manuellement la réplication pour ce nouveau
chemin. Le bouton historique reste cependant présent et instancie son propre
système WebSocket/WebRTC en parallèle.

## 4. Ce qui peut réellement fonctionner maintenant

Sous les conditions suivantes :

- chaque caisse exécute son propre backend ;
- les caisses utilisent le même secret de flotte ;
- UDP multicast n'est pas bloqué par le Wi-Fi ou le pare-feu ;
- les ports HTTP des backends sont accessibles ;
- le protocole HTTP/HTTPS est compatible avec les règles du navigateur ;
- le tenant existe sur chaque backend ;

alors les backends d'un même tenant peuvent probablement se découvrir sans
Internet et les navigateurs peuvent tenter une réplication PouchDB vers les
backends pairs.

Les tests actuels démontrent seulement :

- que le code compile ;
- que l'empreinte tenant filtre les annonces ;
- qu'une signature falsifiée est rejetée ;
- qu'une annonce expirée est rejetée ;
- que les tests unitaires frontend existants restent verts.

Ils ne démontrent pas encore qu'une vente créée sur Caisse 1 apparaît dans les
écrans et le PostgreSQL des Caisses 2, 3 et 4.

## 5. Problèmes et risques encore présents

### Critique — deux sources de vérité non raccordées

PostgreSQL porte les données métier visibles. PouchDB porte surtout le cache et
la file hors ligne. La réplication PouchDB ne réplique pas PostgreSQL.

### Critique — écritures en ligne absentes du journal répliqué

Une opération HTTP réussie n'est pas journalisée dans
`stockflow_<tenantId>`. Elle ne part donc pas vers les pairs.

### Critique — cache de lecture non répliqué

Les lectures hors ligne utilisent `stockflow_cache`, tandis que le LAN réplique
`stockflow_<tenantId>`. Recevoir une opération LAN ne met pas automatiquement à
jour les écrans hors ligne ni leurs réponses mises en cache.

### Critique — consommation des opérations d'un autre appareil

`useOfflineSync` sélectionne actuellement les opérations avec le `deviceId` de
l'appareil courant. Une opération provenant d'une autre caisse peut être copiée
par PouchDB sans être rejouée localement.

### Critique — état `synced` global inadapté au multi-appareil

Un document possède un seul état. Si une caisse le marque `synced`, cela ne veut
pas dire qu'il a été appliqué par toutes les autres caisses. Il faudrait des
acquittements distincts par appareil ou une journalisation backend durable.

### Élevé — topologie PouchDB croisée

Chaque navigateur se connecte au backend du pair, mais pas nécessairement au
PouchDB de son propre backend. Il n'existe pas de propriétaire clairement défini
pour l'application des documents reçus.

### Élevé — génération d'identifiants

De nombreuses créations génèrent leur UUID dans PostgreSQL. Rejouer la même
création sur plusieurs caisses peut produire des identifiants différents. Une
modification ultérieure utilisant l'identifiant de Caisse 1 peut alors être
introuvable sur Caisse 2.

Les identifiants des entités et des opérations doivent être créés une seule fois
à l'origine et conservés partout.

### Élevé — conflits métier

PouchDB sait conserver des révisions concurrentes de documents, mais cela ne
définit pas les règles métier :

- deux ventes simultanées du dernier article ;
- deux changements de prix concurrents ;
- suppression contre modification ;
- numéros de reçu et séquences ;
- unicité du code-barres, email ou nom ;
- ordre des entrées et sorties de stock.

Ces conflits doivent avoir une stratégie explicite par agrégat métier.

### Élevé — dépendance PostgreSQL pendant l'authentification

Le JWT recharge l'utilisateur depuis PostgreSQL et les jetons de réplication
vérifient que le tenant existe. Si PostgreSQL est un service Internet distant,
le mode LAN hors ligne peut échouer avant même la réplication.

### Moyen — deux systèmes LAN concurrents

Le projet exécute maintenant :

- le chemin historique WebSocket + WebRTC activable dans les cartes ;
- le chemin multicast + réplication automatique globale.

Les deux utilisent des instances de hooks et des états séparés. L'interface peut
donc afficher « désactivé » alors que la réplication globale fonctionne, ou
afficher des pairs WebSocket différents des pairs multicast.

### Moyen — HTTP/HTTPS et certificats

Une application servie en HTTPS ne peut généralement pas appeler librement un
endpoint HTTP LAN. Utiliser HTTPS sur chaque adresse IP nécessite des certificats
acceptés par le navigateur, ce qui est rarement zéro-configuration.

### Moyen — réseaux qui bloquent le multicast

Les Wi-Fi invités, VLAN, isolation client et certains points d'accès bloquent le
multicast ou les communications directes entre clients. Une stratégie de secours
est nécessaire si ces réseaux font partie du périmètre.

## 6. Architecture cible recommandée

### Décision principale

Choisir une seule source de vérité locale par caisse et un seul moteur de
synchronisation.

La solution la plus cohérente avec le backend actuel est une réplication par
journal d'événements backend, pas une réplication pilotée par plusieurs hooks
React.

### 6.1 Écriture locale transactionnelle

Chaque mutation métier devrait, dans la même transaction PostgreSQL :

1. appliquer la modification métier ;
2. ajouter une entrée immuable dans une table `sync_operations` ou `outbox`.

Exemple conceptuel :

```text
operationId
tenantId
originDeviceId
entityType
entityId
operationType
payload/version
logicalTimestamp
createdAt
```

L'`operationId` et l'`entityId` sont générés sur la caisse d'origine et ne
changent jamais.

### 6.2 Découverte

Conserver le multicast signé ajouté récemment, à condition de valider la
topologie réelle de déploiement. Il doit seulement fournir :

- l'identité d'instance ;
- l'adresse du backend pair ;
- une preuve de tenant ;
- les capacités et versions de protocole.

WebRTC peut être supprimé si toutes les caisses exposent déjà un backend HTTP sur
le LAN. Il ajoute actuellement de la complexité sans transporter les données.

### 6.3 Échange backend à backend

Les backends pairs devraient échanger leurs curseurs et opérations :

1. « voici mon dernier curseur connu pour ton instance » ;
2. « voici les opérations suivantes signées » ;
3. validation du tenant et de la signature ;
4. insertion idempotente par `operationId` ;
5. application locale dans une transaction ;
6. acquittement durable par pair.

Le frontend n'aurait plus à orchestrer le réseau. Il continuerait simplement à
lire son backend local.

### 6.4 Conflits

Quelques règles possibles :

- ventes : événements immuables, jamais de « dernier écrit gagnant » ;
- mouvements de stock : journal additif avec recalcul du solde ;
- produits/clients : version par entité et résolution déterministe ;
- suppressions : tombstones conservés jusqu'à acquittement de tous les pairs ;
- paramètres : dernière version logique gagnante, avec journal d'audit ;
- contraintes uniques : conflit explicite visible à un administrateur.

### 6.5 Synchronisation Internet

Le serveur distant devient simplement un pair supplémentaire :

- même format d'opérations ;
- mêmes identifiants idempotents ;
- curseur et acquittements séparés ;
- reprise automatique quand Internet revient.

Cela évite d'avoir une logique LAN et une logique cloud incompatibles.

## 7. Plan de correction proposé

### Étape 1 — figer et tester le comportement actuel

Créer un test avec deux processus backend, deux PostgreSQL locaux et deux
profils navigateur. Vérifier séparément découverte, authentification, réplication
PouchDB et données affichées.

### Étape 2 — supprimer le doublon de découverte

Choisir multicast comme mécanisme LAN principal. Brancher les cartes existantes
sur un store partagé qui reflète le service automatique. Retirer WebRTC et le
serveur de signalisation du chemin LAN si aucun autre usage ne les justifie.

### Étape 3 — créer l'outbox métier

Ajouter la table d'opérations, les identifiants déterministes et l'écriture
transactionnelle dans chaque service métier.

### Étape 4 — réplication backend

Implémenter l'échange de lots, les curseurs, les acquittements et l'idempotence.
Le protocole doit refuser tout tenant différent avant de lire ou écrire une
opération.

### Étape 5 — règles de conflits

Définir et tester les règles pour ventes, stocks, produits, suppressions et
contraintes uniques.

### Étape 6 — test quatre caisses

Automatiser le scénario demandé :

1. Internet coupé ;
2. quatre caisses sur le même LAN ;
3. une opération différente créée sur chaque caisse ;
4. attente de convergence ;
5. comparaison des tables et écrans sur les quatre caisses ;
6. modification concurrente et partition temporaire ;
7. reconnexion LAN ;
8. retour Internet et convergence avec le serveur distant ;
9. ajout d'une cinquième caisse d'un autre tenant et preuve de son isolation.

## 8. Critères d'acceptation à utiliser

La fonctionnalité ne devrait être déclarée terminée que si :

- aucune IP ni association manuelle n'est demandée ;
- deux caisses du même tenant se découvrent sans Internet ;
- un tenant différent ne voit ni métadonnée sensible ni donnée métier ;
- chaque écriture réussie, en ligne locale ou hors ligne, possède un
  `operationId` stable ;
- toutes les caisses appliquent chaque opération une seule fois ;
- les identifiants d'entités sont identiques partout ;
- les écrans lisent l'état local convergé, pas seulement un cache ancien ;
- une coupure et une reconnexion ne créent pas de doublons ;
- le retour Internet utilise le même journal idempotent ;
- un test automatisé à quatre caisses compare effectivement les données métier.

## 9. Décision recommandée avant de continuer

Ne pas empiler une troisième logique de synchronisation dans le frontend.

Conserver temporairement le multicast signé comme prototype de découverte, mais
considérer la réplication PouchDB automatique actuelle comme expérimentale tant
que le lien PostgreSQL ↔ journal répliqué ↔ PostgreSQL n'est pas implémenté et
testé.

La prochaine tâche utile est de confirmer la topologie de production exacte :

- chaque caisse possède-t-elle réellement son propre backend et PostgreSQL ?
- PostgreSQL est-il local, central sur le LAN ou hébergé sur Internet ?
- l'application est-elle ouverte en HTTP, HTTPS, PWA ou wrapper desktop ?

Ces trois réponses déterminent le protocole final, mais ne changent pas le
constat actuel : la découverte de pairs et la convergence des données métier
sont deux problèmes distincts, et seul le premier est aujourd'hui partiellement
résolu.
