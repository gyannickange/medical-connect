# Kima — subagent de test exploratoire réutilisable

**Date:** 2026-08-10
**Statut:** Approuvé (brainstorming), en attente du plan d'implémentation

## Contexte

StockFlow dispose déjà d'une suite Playwright écrite à l'avance (`frontend/tests/app.spec.ts`) qui vérifie des cas connus. Le besoin exprimé est différent : un agent qui **explore** l'application comme le ferait un vrai utilisateur — en réagissant à ce qu'il observe à l'écran, en essayant des parcours et des cas limites non scriptés d'avance — afin de trouver des bugs avant les utilisateurs finaux. Le design initial envisageait un subagent local à StockFlow (`.claude/agents/qa-explorer.md`), mais le besoin a été élargi : cet agent doit être réutilisable tel quel dans tous les projets de l'utilisateur, pas seulement StockFlow.

Une recherche préalable (marketplace `claude-plugins-official` + web) confirme :

- Le plugin officiel **`playwright`** (Microsoft, packagé par Anthropic) fournit les tools MCP de pilotage navigateur (navigate/click/type/screenshot/console/network) via un simple `.mcp.json` (`npx @playwright/mcp@latest`) — un format que Kima peut reprendre tel quel en l'embarquant directement (voir section Architecture), pour rester installable en une seule commande.
- Aucun plugin existant ne fournit la "persona" testeur exploratoire elle-même : c'est un pattern documenté dans la communauté (subagent + Playwright MCP) mais toujours construit sur mesure. Il n'y a donc pas de doublon à éviter — Kima comble un vrai vide.

## Objectif

Un plugin Claude Code nommé **Kima**, installable une fois globalement et utilisable depuis n'importe quel projet, contenant un subagent (`qa-explorer`) capable de :

1. Découvrir/lancer l'app à tester.
2. L'explorer en pilotant un vrai navigateur, en réagissant à l'état réel de l'UI comme un humain qui découvre l'app.
3. Couvrir des cas d'usage variés (CRUD, formulaires, cas limites, erreurs) sans script préécrit, mais dans les limites de sécurité qui lui sont fixées.
4. Documenter les bugs trouvés avec preuves à l'appui, dans un rapport, sans les corriger.

## Architecture

### 1. Capacité navigateur : `.mcp.json` embarqué dans Kima

Kima embarque sa propre config MCP plutôt que de dépendre de l'installation séparée du plugin officiel `playwright` dans chaque projet. Un fichier `.mcp.json` à la racine du repo Kima déclare le même serveur que ce plugin (`npx @playwright/mcp@latest`) — format vérifié directement sur le plugin officiel installé chez l'utilisateur. Résultat : `claude plugin install kima@kima` suffit à lui seul, les tools `browser_*` sont disponibles dans tout projet où Kima est activé, sans étape d'installation supplémentaire à documenter ou à répéter. Si les tools ne répondent pas au lancement (ex: pas d'accès réseau pour `npx`), l'agent le signale clairement plutôt que d'échouer silencieusement.

### 2. Structure du repo

Nouveau repo git indépendant, `~/Sites/React/kima/`, calqué sur la structure des plugins déjà utilisés (`i-have-adhd`, `mattpocock-skills`) :

```text
kima/
├── .claude-plugin/
│   ├── plugin.json         # manifest: name "kima", version, description, author
│   └── marketplace.json    # permet `claude plugin marketplace add` en local
├── .mcp.json                 # config MCP embarquée (npx @playwright/mcp@latest)
├── agents/
│   └── qa-explorer.md      # le subagent testeur (cœur du plugin)
├── README.md                # présentation, positionnement vs suite Playwright écrite
└── INSTALL.md                # étapes d'installation locale
```

Installation (une fois) :

```bash
claude plugin marketplace add ~/Sites/React/kima
claude plugin install kima@kima
```

Ensuite disponible dans tous les projets ouverts avec Claude Code, comme les autres plugins déjà installés par l'utilisateur.

Distribution : privé pour l'instant (pas de publication GitHub publique prévue à ce stade).

### 3. Garde-fous — jusqu'où `qa-explorer` a le droit d'aller

Un agent exploratoire qui applique CRUD + valeurs limites + suppressions sans limites peut détruire des données ou perturber un environnement partagé. Le prompt système de `qa-explorer` inclut donc un contrat de sécurité explicite, non négociable :

- **Jamais de production**, sauf autorisation explicite donnée dans l'invocation.
- **Actions destructrices autorisées par défaut uniquement sur un environnement local/de test.** Avant d'exécuter un test destructif (suppression, modification irréversible), l'agent évalue si l'environnement semble jetable/réinitialisable (ex: script `db:reset`/`db:fresh` disponible, base de données locale) ; en cas de doute, il s'abstient et le signale dans le rapport plutôt que d'agir.
- **Jamais d'identifiants inventés.** Il peut les découvrir dans la documentation ou des fixtures de test (README, seed scripts, tests e2e existants), mais ne fouille pas des `.env` ou secrets au-delà de ce qui est nécessaire et documenté comme donnée de test.
- **Jamais de modification du code source** pour faciliter ses propres tests.
- **Jamais de correction du bug découvert** — trouver et documenter, rien d'autre. Cette frontière évite que l'agent modifie l'app, masque l'anomalie, puis se reteste lui-même en mélangeant les rôles QA et développement.
- **Budget d'exploration borné** (détaillé en 3.4) pour éviter une exploration infinie.

### 4. Le subagent `qa-explorer` — comportement générique

Le prompt système du subagent ne code en dur aucun détail propre à un projet (pas de port, pas d'identifiants). Il fonctionne comme suit :

#### 4.1 Paramètres d'invocation

L'appelant fournit un contexte structuré, tout étant optionnel (fallback en 4.2 si absent) :

```text
Use qa-explorer.
Target: http://localhost:3000
Scope: inventory and sales
Depth: medium
Credentials:
  username: admin
  password: admin123
```

- **Target** : URL de l'app.
- **Scope** : périmètre à couvrir (libre, ex: "module produits", ou "large" par défaut).
- **Depth** : `quick | medium | deep` — sémantique, pas un nombre de tests fixe :
  - `quick` : happy paths + erreurs évidentes.
  - `medium` (défaut) : CRUD + validation + navigation + vérification console/réseau.
  - `deep` : exploration plus agressive, croisements de fonctionnalités, cas limites étendus.
- **Credentials** : identifiants de test à utiliser.

#### 4.2 Résolution du contexte à défaut

Si le contexte n'est pas fourni dans l'invocation, auto-détection par convention dans le projet courant : lecture du `README.md`, des scripts `package.json`, et des tests e2e existants (ex: `tests/*.spec.ts`) pour en déduire comment démarrer l'app et quels identifiants de test utiliser — jamais en fouillant des secrets, conformément au garde-fou correspondant.

#### 4.3 Déroulé d'une session : Discover → Prepare → Explore → Investigate → Report

1. **Discover** — déterminer ce qu'est l'application : comment la démarrer, l'URL, le mode d'authentification, les routes et entités principales.
2. **Prepare** — vérifier que les tools navigateur (`browser_*`, fournis par le `.mcp.json` embarqué dans Kima) répondent, démarrer uniquement ce qui est nécessaire côté app (serveurs non déjà lancés), attendre que l'app réponde.
3. **Explore** — parcourir d'abord les chemins normaux (happy paths) comme le ferait un utilisateur légitime, avant de chercher les cas limites. Principe directeur : **observer avant d'agir** — à chaque nouvel écran, l'agent regarde ce qui existe réellement (champs, actions disponibles, données affichées) et choisit son prochain test en conséquence, plutôt que de dérouler une checklist rigide ("maintenant CRUD, maintenant pagination"). Les heuristiques ci-dessous sont un répertoire de techniques à mobiliser selon ce qui est observé, pas un scénario fixe : CRUD sur les entités principales, formulaires avec données limites/invalides, navigation directe sur routes protégées, rechargement en plein flux, recherche/filtres/pagination.
4. **Investigate** — avant de qualifier quelque chose de bug ("evidence first"), confirmer l'anomalie : reproduire une seconde fois quand c'est raisonnable, croiser avec la console navigateur, les requêtes réseau, et une capture d'écran. Ne jamais déclarer un bug uniquement parce que quelque chose "semble bizarre".
5. **Report** — produire la synthèse (format détaillé en section 5).

#### 4.4 Budget d'exploration

Règle de poursuite/arrêt donnée à l'agent : continuer tant que de nouveaux états applicatifs significatifs sont découverts ; s'arrêter quand le périmètre demandé a été suffisamment exercé, que l'exploration devient répétitive, ou que le budget d'exécution (temps/nombre d'actions) est atteint. Le `Depth` demandé module ce budget.

### 5. Format du rapport

**Emplacement** (horodaté pour éviter les collisions entre plusieurs exécutions le même jour) :

```text
docs/qa/
├── 2026-08-10-1018-exploratory-qa-report.md
└── evidence/
    ├── 2026-08-10-1018-BUG-001.png
    └── ...
```

Écrit dans le projet testé (pas dans le repo Kima).

**En-tête du rapport :**

```markdown
# Exploratory QA Report
Date: 2026-08-10 10:18
Target: http://localhost:3000
Scope: broad exploration
Environment: local

## Summary
Scenarios explored: 27
Bugs found: 6
- Blocker: 0
- Major: 2
- Minor: 3
- Cosmetic: 1
```

**Sections suivantes :** Scenarios Covered, Bugs, Areas Not Covered, Testing Limitations. La section "Areas Not Covered" est obligatoire même vide de contenu problématique : si l'agent n'a pas pu tester une zone (ex: upload de fichiers), le rapport le dit explicitement plutôt que de laisser croire à une couverture complète.

**Format d'un bug (evidence first) :**

```text
BUG-004 — MAJEUR
Titre : Une vente peut être enregistrée avec une quantité négative
Reproduction:
1. Ouvrir /sales/new
2. Sélectionner Produit A
3. Entrer -5
4. Cliquer sur Enregistrer
Attendu:
La quantité doit être refusée.
Observé:
La vente est créée avec une quantité de -5.
Evidence:
- Screenshot: docs/qa/evidence/2026-08-10-1018-BUG-004.png
- POST /api/sales → 201
- Console: aucune erreur
Reproductibilité: 2/2
```

Un rapport est produit même en l'absence de bug, pour traçabilité.

### 6. Relation avec la suite Playwright existante

Kima ne remplace pas `frontend/tests/app.spec.ts` — les deux sont complémentaires et répondent à des questions différentes :

```text
frontend/tests/app.spec.ts          Kima
        ↓                             ↓
Régression connue                 Exploration
"Est-ce que les comportements    "Qu'est-ce qui peut casser
connus fonctionnent toujours ?"   auquel nous n'avons pas pensé ?"
```

Workflow cible une fois un bug trouvé par Kima :

```text
Kima découvre BUG-007 → un humain valide le bug → correction
        → ajout d'un test Playwright de régression → BUG-007 devient un cas connu
```

Kima transforme ainsi progressivement des inconnues en tests de régression connus, sans jamais lui-même écrire ces tests ni corriger le code.

### 7. Usage sur StockFlow (premier cas d'usage réel)

Une fois Kima installé globalement, on invoque `qa-explorer` avec le contexte StockFlow en paramètre du prompt (`Target: http://localhost:3000`, `Credentials: admin/admin123` issus du seed, `Scope`/`Depth` selon le besoin), et éventuellement `npm run db:fresh` au préalable côté backend pour repartir d'un état de données connu et jetable. Le rapport atterrit dans `StockFlow/docs/qa/`.

## Hors périmètre (pour cette itération)

- Scénarios multi-instance / sync LAN (nécessitent plusieurs postes simultanés) — explicitement exclus, périmètre web-only retenu.
- Publication publique du plugin.
- Correction automatique des bugs trouvés.
- Application dédiée indépendante de Claude Code (évoquée puis écartée au profit du plugin).
