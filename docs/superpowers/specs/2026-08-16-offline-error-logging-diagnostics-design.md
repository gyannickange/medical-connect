# Logs d'erreurs offline + Diagnostics (Settings) — Design

Date : 2026-08-16
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Donner à l'application desktop (offline-first) une capacité minimale de
diagnostic sans dépendre du réseau : chaque erreur importante côté
frontend est enregistrée localement avec assez de contexte pour être
utile en support, et l'utilisateur peut consulter/exporter/effacer ces
logs depuis une nouvelle section de Settings.

Périmètre explicitement limité au **frontend JS/TS** de l'app desktop
(Tauri + React). Le code Rust/Tauri n'est pas instrumenté séparément —
un échec côté Rust remonte déjà comme une erreur JS quand `invoke()`
échoue, donc il est couvert indirectement par ce système. Le backend
utilise Sentry (existant, hors périmètre de ce spec) et n'est pas
concerné par ce document.

## 2. Constat de départ (vérifié dans le code)

- Aucun mécanisme de log d'erreurs local n'existe aujourd'hui — juste des
  `console.error`/`console.warn` ad hoc dans une vingtaine de fichiers.
- Aucun React error boundary, aucun handler global (`window.onerror`,
  `unhandledrejection`).
- `frontend/src/lib/errorHandler.ts` est déjà le point de passage
  standard pour transformer une erreur (HTTP, réseau, inconnue) en toast
  utilisateur : `normalizeApiError()` → `createErrorToast()` /
  `showApiErrorToast()`, utilisé dans la quasi-totalité des `catch {}`
  qui affichent une erreur. `normalizeApiError` filtre déjà les messages
  qui ressemblent à des détails internes (`INTERNAL_MESSAGE_PATTERN` :
  stack traces, "query failed", etc.) — précédent direct pour éviter de
  stocker des données sensibles/internes dans les logs.
- `frontend/src/lib/deviceIdentity.ts` expose `getDeviceId()`/
  `getDeviceName()`, un id stable généré une fois via `crypto.randomUUID()`
  et persisté en `localStorage` (`stockflow_device_id`) — c'est l'id
  device déjà utilisé partout ailleurs (sync LAN, verrouillage produit,
  auth PouchDB) ; ce spec le réutilise tel quel, n'introduit pas de
  nouvel identifiant.
- Pas de plugin `tauri-plugin-fs` ni d'autre accès fichier natif installé
  — l'app n'a pas de mécanisme d'écriture de fichier JSON via Tauri
  aujourd'hui, et le frontend n'utilise pas le package npm
  `@tauri-apps/api` : les commandes Tauri sont invoquées directement via
  `window.__TAURI__.core.invoke` (voir `lanAgent.ts`), avec un fallback
  gracieux hors contexte Tauri (mode navigateur). Ce spec n'ajoute
  aucune commande Rust — il reste entièrement côté navigateur/JS
  (`localStorage` + téléchargement de fichier via `Blob`/lien temporaire,
  mécanisme standard déjà à la portée du frontend).
- `frontend/package.json` (`"version": "1.0.0"`) et
  `frontend/src-tauri/tauri.conf.json` (`"version": "0.1.0"`) sont
  désynchronisés aujourd'hui. Hors périmètre de correction ici ; ce spec
  utilise la version de `package.json`, injectée au build via Vite, comme
  simple étiquette de diagnostic (pas une donnée dont l'exactitude est
  critique).
- Pattern UI de précédent direct dans `Settings.tsx` : la carte
  "Offline Data Management" (`cacheSize`, `clearAllCache()`) utilise déjà
  le couple `Alert`/`Button variant="destructive"` en confirmation à deux
  étapes (`showClearConfirm`) pour une action destructive locale — repris
  tel quel pour "effacer les logs". `NativeLANDiagnosticsCard` est le
  précédent direct pour une carte de diagnostic technique dans Settings
  (icône + infos techniques + statut).
- Composants UI disponibles et déjà utilisés dans le projet, pertinents
  ici : `ScrollArea`, `Table`, `Alert`/`AlertDialog`, `Card`, `Badge`,
  `Button` (`frontend/src/components/ui/`).
- `useAuth()` (`AuthContext`) expose `userId`, `useTenant()`
  (`TenantContext`) expose `tenantId` — accessibles en React, pas
  directement depuis un module `lib/` classique appelé hors composant.

## 3. Modèle de données

```ts
export interface ErrorLogContext {
  [key: string]: string | number | boolean;
}

export interface ErrorLogEntry {
  id: string;            // uuid
  timestamp: string;     // ISO 8601
  appVersion: string;
  deviceId: string;
  module: string;        // ex. "settings", "sales", "uncaught", "app"
  message: string;
  stack?: string;         // tronqué à ~4000 caractères
  context?: ErrorLogContext;
  online: boolean;        // navigator.onLine au moment de la capture
  tenantId?: string;
  userId?: string;
}
```

Aucune donnée sensible n'est jamais stockée : pas de corps de
requête/réponse brut, pas de token, pas de mot de passe — uniquement
`message`/`stack` et un `context` limité à des valeurs primitives passées
explicitement par l'appelant (ex. `{ route: "/settings" }`), jamais un
objet arbitraire sérialisé.

Nuance entre les deux points de capture (section 5) : les erreurs
« gérées » qui passent par `errorHandler.ts` ont leur `message` déjà
filtré via `normalizeApiError`/`INTERNAL_MESSAGE_PATTERN` (aucun détail
interne type stack trace ou "query failed" ne remonte). Les erreurs non
gérées (handlers globaux + `ErrorBoundary`) stockent en revanche
`error.message`/`error.stack` **tels quels**, sans filtrage — c'est
attendu pour un champ `stack`, dont c'est justement le rôle. Cette
asymétrie est acceptable ici uniquement parce que la carte Diagnostics
vit dans Settings, déjà restreint à `isAdminOrManager()` via
`SettingsPolicy` : personne en dehors de ce rôle ne peut consulter ou
exporter ces logs.

## 4. Stockage — `frontend/src/lib/errorLogStore.ts`

Nouveau module, suit le pattern `localStorage` déjà utilisé par
`deviceIdentity.ts` (pas de PouchDB : ces logs ne sont pas des données
métier à synchroniser, et le chiffrement de `localAccountsStore.ts`
n'apporte rien ici puisqu'aucune donnée sensible n'est stockée).

- Clé `stockflow_error_logs`, tableau JSON, plafonné à **200 entrées**
  (rotation FIFO : la plus ancienne est supprimée à l'ajout de la 201e).
- `logError(input: { module: string; message: string; stack?: string; context?: ErrorLogContext }): void`
  — complète automatiquement `id`, `timestamp`, `appVersion`, `deviceId`,
  `online`, `tenantId`, `userId` (section 5). N'écrit jamais si
  `localStorage` est indisponible (échoue silencieusement, comme un log
  ne doit jamais faire planter l'app qu'il est censé diagnostiquer).
- `getErrorLogs(): ErrorLogEntry[]` — le plus récent en premier.
- `clearErrorLogs(): void`.
- `buildDiagnosticExport(): DiagnosticExport` où
  ```ts
  interface DiagnosticExport {
    generatedAt: string;
    appVersion: string;
    deviceId: string;
    deviceName: string;
    tenantId?: string;
    online: boolean;
    logs: ErrorLogEntry[];
  }
  ```
  Un seul export "diagnostic complet" (pas deux mécanismes distincts) :
  couvre à la fois "télécharger les erreurs récentes" et "générer un
  fichier de diagnostic" du besoin initial en une seule action/un seul
  fichier.

## 5. Points de capture

### 5.1 Handlers globaux (erreurs non gérées)

Nouveau `frontend/src/lib/globalErrorLogging.ts`, exposant
`installGlobalErrorLogging()` appelée une fois au démarrage
(`main.tsx`) :
- `window.addEventListener("error", ...)` — erreurs JS non interceptées.
- `window.addEventListener("unhandledrejection", ...)` — promesses
  rejetées non gérées.
- Un composant `ErrorBoundary` (React `componentDidCatch`), placé près
  de la racine de l'arbre (`App.tsx`), qui logge puis affiche un état de
  repli minimal au lieu d'un écran blanc.

Toutes ces captures utilisent `module: "uncaught"`.

### 5.2 Erreurs déjà gérées — intégration dans `errorHandler.ts`

`createErrorToast()` et `showApiErrorToast()` gagnent un paramètre
optionnel en fin de signature, `module: string = "app"`, et appellent
`logError({ module, message: formatted, stack: undefined, context: { status, isNetworkError } })`
avant de retourner le toast. Parce que le paramètre est optionnel et en
dernière position, **tous les appels existants continuent de
fonctionner sans modification** — les sites d'appel pourront être
enrichis avec un nom de module précis au fil du temps, sans réécriture
en masse requise par ce spec.

Ce point d'intégration unique couvre la quasi-totalité des erreurs
"importantes" déjà affichées à l'utilisateur (échec de sauvegarde, échec
réseau, erreur API) sans avoir à instrumenter chaque `catch {}` du
codebase individuellement.

## 6. Résolution tenant/user/version

`logError()` ne peut pas appeler `useAuth()`/`useTenant()` (hooks React)
depuis un module `lib/` classique. Solution : `AuthContext` et
`TenantContext` poussent `userId`/`tenantId` vers une petite référence
mutable au niveau module dans `errorLogStore.ts` via un `useEffect`
déclenché à chaque changement de valeur — `logError()` lit cette
référence de façon synchrone, sans prop drilling ni nouveau contexte.

`appVersion` est injecté au build par Vite depuis `frontend/package.json`
(`define`/`import.meta.env`), pas de nouvel appel Tauri.

## 7. UI — nouvelle carte Diagnostics dans Settings

Nouveau composant `frontend/src/components/DiagnosticsCard.tsx`, ajouté
dans `Settings.tsx` à côté de `NativeLANDiagnosticsCard`/
`DeviceAuthorizationCard`. Suit le même habillage (`Card`/`CardHeader`/
`CardTitle` avec icône `lucide-react`, ex. `Bug`) :

- **Liste des erreurs récentes** : `ScrollArea` + `Table` (colonnes
  Date, Module, Message tronqué), les ~20 plus récentes de
  `getErrorLogs()`.
- **Bouton "Télécharger le diagnostic"** : appelle
  `buildDiagnosticExport()`, sérialise en JSON, déclenche un
  téléchargement navigateur standard (`Blob` + `URL.createObjectURL` +
  clic sur un `<a>` temporaire) — aucun accès fichier natif requis.
- **Bouton "Effacer les logs"** : confirmation en deux étapes identique
  au pattern "Clear offline data" existant (`Alert variant="destructive"`
  puis boutons Annuler/Confirmer), appelle `clearErrorLogs()`.

Composant volontairement fin (glue uniquement) — logique testée dans
`errorLogStore.ts`/`globalErrorLogging.ts`, conformément à la convention
du projet (pas de RTL/jsdom).

## 8. i18n

Toutes les nouvelles chaînes (titre de carte, libellés colonnes, boutons,
messages de confirmation, état vide "aucune erreur récente") ajoutées
dans `frontend/src/lib/i18n.ts`, dans les dictionnaires `en` **et** `fr`,
suivant la convention `t("key")` existante — vérifié par
`i18nCompleteness.test.ts`.

## 9. Tests

- `errorLogStore.spec.ts` : ajout d'une entrée (champs auto-remplis),
  rotation FIFO au-delà de 200 entrées, `clearErrorLogs`,
  `buildDiagnosticExport` (forme du JSON produit), comportement quand
  `localStorage` lève une exception (ne doit jamais throw côté appelant).
- `globalErrorLogging.spec.ts` : les handlers `error`/`unhandledrejection`
  appellent bien `logError` avec `module: "uncaught"` et le
  message/stack attendus.
- `errorHandler.spec.ts` (existant, étendu) : `createErrorToast`/
  `showApiErrorToast` appellent `logError` avec le module fourni (ou le
  défaut `"app"`), sans changer le comportement/la forme du toast déjà
  testée.

## 10. Hors périmètre

- Capture dédiée côté Rust/Tauri (un échec Rust remonte déjà comme
  erreur JS via `invoke()`).
- Toute intégration avec le backend/Sentry — ce système est
  intégralement local, aucun envoi réseau des logs.
- Synchronisation des logs entre devices (chaque device a ses propres
  logs locaux, par design — un diagnostic reflète l'état réel de la
  machine qui a l'incident).
- Correction de la désynchronisation de version entre `package.json` et
  `tauri.conf.json` (juste utilisée telle quelle comme étiquette).
- Renommage/instrumentation systématique de tous les `catch {}`
  existants avec un `module` précis — fait incrémentalement plus tard,
  au fil des modifications de chaque fichier.
