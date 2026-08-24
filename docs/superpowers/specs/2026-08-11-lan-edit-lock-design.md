# Verrou d'édition pair-à-pair (LAN) — Design

Date : 2026-08-11
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Le design initial (`docs/superpowers/specs/2026-08-09-lan-peer-sync-design.md`, section 5)
a posé le principe : édition d'une fiche produit protégée par un verrou de type
« édition en cours » (WordPress), transporté par un message LAN direct entre
instances, avec un document de verrou répliqué comme filet de sécurité. Ce
document détaille comment ce mécanisme fonctionne réellement, techniquement.

Constat de départ (vérifié dans le code) : l'agent LAN natif actuel
(`frontend/src-tauri/src/lan_agent.rs`) sait uniquement **découvrir** des
pairs via mDNS. Le port qu'il annonce (`DEFAULT_AGENT_PORT = 45_838`) n'est
qu'une métadonnée de découverte — rien n'écoute dessus. Aucun canal de
message pair-à-pair n'existe. Ce design le construit.

## 2. Architecture

Un petit serveur HTTP local (`tiny_http`, choisi pour rester cohérent avec le
style synchrone à base de threads déjà utilisé dans `lan_agent.rs` — pas de
runtime async à ajouter) tourne dans l'agent Rust de chaque instance, sur le
port déjà annoncé en mDNS. Deux instances qui se sont découvertes via mDNS se
contactent ensuite directement, IP:port, sans jamais passer par le serveur
central.

Le document de verrou dans CouchDB (répliqué normalement, comme le reste des
données produits) sert de source de vérité durable — visible même par une
instance qui n'était pas sur le LAN au moment de la pose du verrou, dès
qu'elle se synchronise. Le message HTTP direct sert uniquement à
l'interaction humaine en temps réel (« quelqu'un veut éditer, autoriser ? »).

```
Caisse B                                    Caisse A (détient le verrou)
[Frontend] → [Tauri command: request lock]
                    ↓
[Agent Rust B] → POST http://<IP A>:45838/lock/request → [Agent Rust A]
                                                                ↓
                                          émet un événement Tauri → [Frontend A]
                                                                ↓
                                       humain clique Accepter/Refuser
                                                                ↓
[Agent Rust B] ← POST http://<IP B>:45838/lock/response ← [Agent Rust A]
        ↓
émet un événement Tauri → [Frontend B] débloque ou affiche le refus
```

## 3. Document de verrou (CouchDB)

Un document dans la base produits du tenant, à un id prévisible pour être
facilement consultable sans requête complexe :

```json
{
  "_id": "lock_<productId>",
  "type": "lock",
  "productId": "<productId>",
  "deviceId": "<device qui édite>",
  "deviceName": "Caisse A",
  "acquiredAt": "2026-08-11T10:00:00Z",
  "expiresAt": "2026-08-11T10:10:00Z"
}
```

- Créé quand une édition démarre.
- Renouvelé (`PUT`, `expiresAt` repoussé de 10 minutes) toutes les ~2 minutes
  tant que l'édition reste active — évite l'expiration d'une édition longue
  mais légitime.
- Supprimé explicitement à la fermeture normale de l'édition.
- Ignoré (traité comme absent) si `expiresAt` est dépassé — couvre le cas où
  l'instance qui détenait le verrou a planté ou perdu le réseau.

## 4. Flux, cas par cas

### 4.1 Personne ne détient le verrou
Document absent, ou présent mais expiré. L'instance qui veut éditer crée
directement le document de verrou et édite — rien à demander, il n'y a
personne à qui demander.

### 4.2 Quelqu'un détient un verrou valide, et il est joignable en LAN
1. `POST /lock/request {productId, requesterId, requesterName}` vers l'IP du
   détenteur (retrouvée via la liste de pairs mDNS déjà découverts).
2. Réponse immédiate `202` (reçu), sans attendre l'humain.
3. Le détenteur voit une notification « Caisse B demande l'accès à ce
   produit, autoriser ? » et répond.
4. `POST /lock/response {productId, granted}` renvoyé au demandeur.
5. Le demandeur, qui affichait « en attente d'autorisation... », débloque ou
   affiche le refus.

**Délai** : si aucune réponse sous 30 secondes, le demandeur voit « pas de
réponse » et peut réessayer plus tard. Pas de relance automatique.

### 4.3 Quelqu'un détient un verrou valide, mais il n'est plus joignable en LAN
Le document de verrou existe et n'est pas expiré, mais l'appareil détenteur
n'apparaît plus dans la liste des pairs mDNS découverts (Wi-Fi coupé, changé
de réseau...). Aucune demande n'est envoyée — il n'y a personne à contacter.
Message : « verrouillé par Caisse A, injoignable — réessayer plus tard ou
attendre l'expiration ». Pas de contournement, pas de forçage.

## 5. Sécurité

Le nouveau serveur HTTP local applique le même modèle de confiance que la
découverte mDNS existante : chaque requête (`/lock/request`, `/lock/response`)
doit être signée par la clé de l'appareil appelant (le même mécanisme de
certificat déjà utilisé pour l'annonce mDNS — voir `LanIdentityService` côté
backend et la vérification de certificat côté agent Rust). Une requête non
signée, ou signée par un appareil d'un autre tenant, est rejetée. Un appareil
inconnu sur le réseau ne peut donc pas spammer des demandes de verrou.

## 6. Hors périmètre de ce design

- Étendre ce mécanisme de verrou aux catégories, au stock, aux ventes (le
  stock/ventes utilisent la fusion additive, pas de verrou, cf. le design du
  2026-08-09).
- Interface de notification détaillée (maquette exacte de la boîte de
  dialogue « autoriser ? ») — laissée à l'implémentation, dans l'esprit des
  composants déjà existants (toasts/dialogs du projet).
- Historique/audit des demandes de verrou refusées ou expirées.
