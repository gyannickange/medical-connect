# Synchronisation CRUD pair-à-pair sur LAN — Design

Date : 2026-08-09
Statut : validé pour passage en plan d'implémentation (vague 1)

## 1. Objectif

Aujourd'hui, chaque instance de StockFlow (une caisse, un poste) dépend d'un
serveur central unique (NestJS + PostgreSQL) comme source de vérité. La
détection de pairs sur le réseau local existe (agent LAN natif, mDNS,
certificats signés) mais ne fait que déclencher un rafraîchissement depuis le
serveur central — elle ne transporte aucune donnée directement entre
instances. Si le serveur central est injoignable, deux instances côte à côte
sur le même Wi-Fi ne peuvent pas se synchroniser entre elles.

Cible : chaque instance devient autonome. Elle fonctionne seule sans rien de
joignable, se synchronise automatiquement avec les autres instances de la même
boutique dès qu'elles se voient sur le réseau local (nombre illimité
d'instances), et se synchronise avec un serveur central dès qu'Internet est
disponible, pour permettre la surveillance à distance.

## 2. Ce qui ne change pas

- L'authentification actuelle (JWT en cookie) reste le mécanisme d'identité
  vis-à-vis du serveur central.
- Le système d'identité LAN existant (certificats Ed25519 signés par le
  backend via `LanIdentityService`, découverte mDNS via l'agent Rust/Tauri)
  est réutilisé tel quel comme couche de confiance entre instances — aucune
  réécriture de ce mécanisme n'est nécessaire pour ce projet.
- Le serveur NestJS central reste le point de passage obligatoire pour toute
  écriture qui atteint le stockage central : aucune instance n'écrit
  directement dans la base centrale sans validation.
- Les modules non couverts par la vague 1 (clients, staff, fournisseurs,
  paramètres, audit) continuent de fonctionner exactement comme aujourd'hui,
  sur PostgreSQL via Drizzle, sans aucun changement. Ils seront migrés dans
  une vague ultérieure, hors périmètre de ce design.

## 3. Décision d'architecture : PouchDB/CouchDB

Deux options ont été évaluées : garder PostgreSQL central et ajouter une base
SQLite locale par instance avec un protocole de synchronisation construit sur
mesure, ou basculer vers PouchDB (local, par instance) et CouchDB (central),
qui utilisent le même protocole de réplication pour la synchronisation
pair-à-pair et vers le central.

Décision : **PouchDB/CouchDB**, sans contrainte d'effort de migration
(réécriture acceptée). Raison retenue : le vrai problème difficile ici est la
mécanique de synchronisation distribuée (détection des changements, échange
des deltas, détection des conflits) — un problème déjà résolu par le
protocole de réplication CouchDB. Un protocole maison sur SQLite aurait
demandé de reconstruire cette mécanique en plus de la logique métier de
conflits (verrous, fusion additive), qui doit de toute façon être construite
par-dessus, quelle que soit la base choisie.

Conséquence assumée : les agrégations qui étaient de simples requêtes SQL
(tableau de bord, rapports) devront être recalculées différemment (vues
Mango/map-reduce côté CouchDB, ou calcul applicatif) plutôt que via des
jointures relationnelles.

## 4. Périmètre de la vague 1

Entités couvertes : **produits, catégories, stock, ventes** — le cœur d'une
caisse.

Explicitement hors périmètre de ce design (restent sur l'architecture
actuelle) : clients, staff, fournisseurs, paramètres, journal d'audit,
tenants/utilisateurs (authentification).

## 5. Architecture par instance

Chaque instance desktop (application Tauri) embarque un **mini-gardien
local** : une version allégée des vérifications NestJS (authentification via
session mise en cache localement, validation des règles métier propres aux
entités de la vague 1), placée devant une base PouchDB locale. Aucune
écriture ne va directement dans PouchDB sans passer par ce mini-gardien, que
l'instance soit connectée à un pair, au serveur central, ou totalement seule.

```
Instance A                          Instance B (même boutique, LAN)
[Frontend] → [Mini-gardien A] → [PouchDB A]  ⇄ réplication ⇄  [PouchDB B] ← [Mini-gardien B] ← [Frontend]
                    ↓ (si Internet disponible)
              [NestJS central] → [CouchDB central]
```

- **Réplication pair-à-pair** : direct entre les bases PouchDB des instances
  détectées sur le LAN (via l'agent mDNS existant), authentifiée par le
  certificat de l'appareil (même mécanisme que l'agent LAN actuel).
- **Réplication vers le central** : PouchDB de chaque instance se réplique
  vers CouchDB via le serveur NestJS, qui reste le gardien (auth + règles
  métier) avant toute écriture centrale.
- Une seule base tenant PouchDB par instance (conserve la convention actuelle
  `stockflow_<tenantId>`), pas une base par entité.

## 6. Modèle de conflits — deux règles selon le type de donnée

### 6.1 Verrou d'édition (produits, catégories)

Comportement type "édition en cours" (WordPress) :

1. Une instance qui ouvre un produit en édition envoie un message direct sur
   le canal LAN déjà utilisé par la détection de pairs : *"je prends le
   produit X"*.
2. Une autre instance qui tente d'éditer le même produit reçoit l'information
   *"en cours d'édition par Caisse 2"* et peut *demander la main* ; Caisse 2
   accepte ou refuse.
3. Le verrou est aussi écrit comme document dans PouchDB (avec horodatage
   d'expiration, proposition : 10 minutes d'inactivité, renouvelé par un
   signal périodique tant que l'édition reste active) — pour ne pas bloquer
   indéfiniment les autres si l'instance qui détient le verrou plante ou perd
   le réseau en pleine édition.
4. Le message LAN direct sert à la réactivité immédiate (la réplication seule
   serait trop lente, de l'ordre de quelques secondes) ; le document de
   verrou sert de filet de sécurité durable et de trace lisible par toute
   instance qui rejoint plus tard.

**Cas non couvert par le verrou** : deux instances totalement isolées (ni LAN
ni central joignable au moment de l'édition) modifient le même produit
chacune de leur côté. Aucun verrou n'a pu être posé, faute de canal pour
prévenir l'autre. Dans ce cas précis : **dernier écrit gagne** (comparaison
d'horodatage), et l'instance dont la modification a été remplacée reçoit une
alerte explicite (*"ta modification du produit X a été remplacée par une
modification plus récente faite ailleurs"*). Aucune donnée n'est perdue en
silence, mais aucune n'est bloquée non plus a posteriori.

### 6.2 Fusion additive (stock, ventes) — pas de verrou

Le stock n'est jamais traité comme une valeur unique synchronisée par
écrasement. C'est déjà le principe de l'API actuelle
(`POST /api/stock/:productId/entry` et `/exit`, deltas et non
remplacements) ; ce design le généralise à toutes les entrées et sorties de
stock, y compris celles déclenchées par une vente :

- Chaque mouvement de stock (entrée, sortie, vente) est écrit comme un
  document indépendant décrivant un delta (« -2 unités du produit X, cause :
  vente #123 »).
- La quantité en stock affichée est **calculée** en additionnant tous les
  mouvements connus localement, jamais lue depuis un champ unique à
  synchroniser.
- Chaque vente est elle-même un document indépendant (montant, lignes,
  produits, appareil d'origine, horodatage) ; il n'y a rien à fusionner, les
  ventes de deux instances différentes s'additionnent naturellement lors de
  la réplication.

Conséquence assumée (validée explicitement) : si deux instances vendent le
même article en même temps sans se voir, les deux ventes s'appliquent, le
stock calculé peut devenir négatif. C'est un compromis métier assumé, pas un
bug à corriger dans ce design.

## 7. Étape 0 — combler les tests manquants avant de casser quoi que ce soit

Constat vérifié dans le code : `stock.service.ts`, `sales.service.ts` et
`dashboard.service.ts` n'ont aujourd'hui **aucun test** sur leurs calculs.
Seuls les formats d'entrée (DTO : `stock-entry.dto.spec.ts`,
`stock-exit.dto.spec.ts`, `create-sale.dto.spec.ts`) sont testés, pas la
logique de déduction de stock, de totaux de vente, ni les agrégats du tableau
de bord.

Avant toute réécriture vers PouchDB/CouchDB, écrire les tests qui décrivent
le comportement actuel correct de ces trois services (sur l'implémentation
PostgreSQL existante). Ces tests servent de spécification exécutable du
comportement attendu et de filet de sécurité pendant la migration : si un
calcul devient faux après le passage à CouchDB, un test rouge le signale
immédiatement plutôt que de découvrir l'erreur en production.

Cette étape est un préalable bloquant à la vague 1, mais fait l'objet d'un
plan d'implémentation séparé (voir section 9).

## 8. Risques et limites acceptées

- **Effort de réécriture important** : nouvelle base (CouchDB/PouchDB),
  nouveau protocole de réplication à intégrer, mini-gardien à dupliquer
  localement sur chaque instance, verrous, fusion additive, recalcul des
  agrégations sans SQL. Accepté explicitement par le porteur du projet, mais
  documenté ici pour qu'il soit écrit noir sur blanc.
- **Survente possible** en cas de déconnexion totale simultanée de deux
  instances vendant le même article (section 6.2). Accepté.
- **Modification perdue silencieusement rattrapée par une alerte a
  posteriori seulement**, jamais bloquée en amont, dans le cas de deux
  instances isolées éditant la même fiche (section 6.1). Accepté.
- Les agrégations de type tableau de bord perdent la simplicité des requêtes
  SQL relationnelles ; à concevoir en détail au moment du plan
  d'implémentation (vues CouchDB ou calcul applicatif).

## 9. Hors périmètre de ce design

- Migration de clients, staff, fournisseurs, paramètres, audit, tenants et
  authentification vers CouchDB/PouchDB (vague 2, spec séparée).
- Le détail d'implémentation des tests de la section 7 (sera couvert par son
  propre plan d'implémentation avant celui de la vague 1).
- Le détail des vues CouchDB / index Mango pour le tableau de bord (à
  approfondir pendant la phase de plan d'implémentation de la vague 1).
