# Medical Connect — Phase 1 : Patients, Consultations, File d'attente — Design

Date : 2026-08-27
Statut : validé, prêt pour plan d'implémentation

## 1. Objectif

Première brique du nouveau domaine **Medical Connect**, ajouté à côté du
domaine existant de gestion de boutique (produits/ventes/stock/clients),
dans la même application, même base de code, même architecture
CouchDB/PouchDB local-first (Tauri desktop, sync LAN + serveur central).

Le domaine complet (maquettes Figma : 46 écrans) est découpé en 5 phases
livrées indépendamment :

1. **Patients + Consultations + File d'attente** (ce document) — le socle
   du parcours patient.
2. Pré-consultation infirmière + consultation médicale + consultation-hub.
3. Examens & prescription (labo, pharmacie).
4. Plan de prise en charge (6 variantes), clôture, suivi post-consultation,
   historique.
5. Salles, Admin (utilisateurs/rôles/audit).

Chaque phase a son propre design → plan → implémentation. Ce document
couvre uniquement la Phase 1, correspondant aux écrans Figma
`patients-index`, `patients-new`, `patients-show`, `consultations-index`,
`consultations-new`, `consultations-show`, `file-attente-index`,
`file-attente-new`, `file-attente-show` (fichier Figma
`kIIFSS8asFoY904nmaYEj0`).

Le domaine boutique existant n'est ni modifié ni renommé dans cette phase.

## 2. Constat de départ (vérifié dans le code)

- **`CLAUDE.md` est obsolète sur un point important** : il décrit un
  backend "Drizzle ORM + PostgreSQL". Ce n'est plus le cas — la migration
  vers CouchDB est terminée. Il n'y a plus de `pgTable`, plus de
  `backend/src/lib/db.ts`. Chaque module a son propre `*.repository.ts`
  qui lit/écrit des documents CouchDB (une base par tenant,
  `businessconnect_${tenantId}`, documents discriminés par `type`,
  requêtes Mango). Cette spec construit donc les entités Medical Connect
  comme documents CouchDB, sur le modèle de `ProductsRepository` /
  `SalesRepository`, **pas** comme tables Drizzle. `CLAUDE.md` devra être
  corrigé sur ce point (hors périmètre de cette spec).
- **"Business Connect"** (nom actuel de l'app, visible dans `Sidebar.tsx`,
  configs Tauri, etc.) n'est pas un système pharmacie externe — c'est
  cette même application, avant un second renommage vers "Medical Connect"
  déjà planifié mais pas exécuté (`docs/superpowers/plans/2026-08-24-rename-to-medical-connect.md`).
  Aucune intégration externe à prévoir pour la pharmacie.
- **Modèle de rôles actuel fermé** : `UserRole` est un union type de 3
  valeurs (`"admin" | "manager" | "cashier"`), codé en dur à 4 endroits
  minimum par côté (`backend/src/modules/auth/policies/policy.types.ts`,
  chaque `*.policy.ts` via `BasePolicy`, `CreateStaffDto.role`
  (`@IsIn`), `insertUserSchema` dans `schema.ts`) — et son miroir exact
  côté frontend (`frontend/src/lib/policies/policy.types.ts` +
  équivalents). Pas de système de rôles extensible/data-driven.
- **Pas de state-machine générique** dans le repo : les statuts
  (`SaleStatus`, etc.) sont de simples union types validés par
  `@IsIn([...])`/`z.enum([...])`, sans garde de transition. Le repo n'a
  pas non plus de vue map-reduce CouchDB pour dériver un état depuis des
  événements — pattern à introduire pour la file d'attente (section 5).
- **Convention d'unicité forte en CouchDB** : `ProductsRepository`
  utilise un document de réservation dont l'`_id` est déterministe
  (hash), dont l'insertion échoue nativement en 409 sur doublon
  (`barcodeReservationId`). Réutilisé ici pour les compteurs de
  numérotation séquentielle (section 4).
- **Attachments CouchDB** : non utilisés actuellement ailleurs dans le
  repo, mais nativement supportés par CouchDB/PouchDB et répliqués par le
  mécanisme de sync continu déjà en place (`db.sync(..., {live: true})`)
  sans configuration supplémentaire — utilisé ici pour les photos patient
  (section 6).
- Aucun SDK AWS, aucun pattern d'upload de fichier existant dans le repo
  (`grep` négatif sur `aws-sdk`, `S3Client`, `multer`) — intégration S3
  entièrement nouvelle.

## 3. Rôles

Extension de `UserRole` (`backend/src/modules/auth/policies/policy.types.ts`
et son miroir `frontend/src/lib/policies/policy.types.ts`) :

```ts
export type UserRole =
  | "admin"
  | "manager"
  | "cashier"
  | "accueil"
  | "infirmier"
  | "medecin"
  | "laboratoire"
  | "pharmacien";
```

Les 5 rôles métier Medical Connect sont ajoutés en une seule passe (même
si `laboratoire`/`pharmacien` n'ont pas d'écran avant la Phase 3) car
l'enum est touché aux mêmes ~4 endroits par côté à chaque ajout — autant
le faire une fois. Seuls `accueil`, `infirmier`, `medecin` ont des
policies actives dans cette phase.

Ajouts symétriques sur les deux `BasePolicy` (`backend/.../base.policy.ts`
et `frontend/.../base.policy.ts`) : `isAccueil()`, `isInfirmier()`,
`isMedecin()`, `isLaboratoire()`, `isPharmacien()`, calqués sur
`isCashier()`. Mise à jour de `CreateStaffDto`/`UpdateStaffDto`
(`@IsIn([...])`) et de `insertUserSchema` (`z.enum([...])`) dans
`schema.ts` avec la liste complète.

Un `grep -rn '"admin".*"manager".*"cashier"'` sur les deux arbres est fait
en fin d'implémentation pour détecter d'autres switches à 3 valeurs
oubliés (ex. sélecteur de rôle dans l'UI admin staff, scripts de seed).

## 4. Entité `Patient`

Ajouts à `backend/src/shared/schema.ts` (et son miroir
`frontend/shared/schema.ts`), sur le modèle de `Rayon`/`Product` :

```ts
export type PatientStatus = "actif" | "inactif" | "hospitalise";
export type PatientType = "externe" | "hospitalise" | "urgence";
export type PaymentMode = "assurance" | "mutuelle" | "tiers_payant" | "comptant";
export type IdDocumentType = "cni" | "passeport" | "permis" | "autre";
export type AllergyKnowledge = "aucune_connue" | "allergies_connues" | "non_renseigne";

export interface EmergencyContact {
  name: string;
  relation: string;
  phone: string;
  address?: string | null;
  isPriority: boolean;
}

export interface PediatricInfo {
  fatherName?: string | null;
  motherName?: string | null;
  legalGuardian?: string | null;
  guardianPhone?: string | null;
  guardianRelation?: string | null;
  weightKg?: string | null;
  heightCm?: string | null;
  birthInfo?: string | null;
  vaccinations?: string | null;
}

export interface Patient {
  id: string;
  tenantId: string;
  dossierNumber: string | null; // null tant que non synchronisé (voir §7)
  lastName: string;
  firstName: string;
  dateOfBirth: string; // ISO date
  sex: "M" | "F";
  primaryPhone: string;
  residenceAddress: string;
  usualName?: string | null;
  birthPlace?: string | null;
  nationality?: string | null;
  profession?: string | null;
  maritalStatus?: string | null;
  idDocumentType?: IdDocumentType | null;
  idDocumentNumber?: string | null;
  idDocumentExpiry?: string | null;
  email?: string | null;
  secondaryPhone?: string | null;
  residenceZone?: string | null;
  fullAddress?: string | null;
  emergencyContact?: EmergencyContact | null;
  bloodGroup?: string | null;
  allergyKnowledge: AllergyKnowledge;
  allergyDetails?: string | null;
  medicalHistory?: string | null;
  surgicalHistory?: string | null;
  chronicDiseases?: string | null;
  currentTreatments?: string | null;
  disabilities?: string | null;
  facilityService?: string | null;
  referringDoctorId?: string | null;
  patientType: PatientType;
  paymentMode?: PaymentMode | null;
  insuranceName?: string | null;
  insuranceNumber?: string | null;
  financiallyResponsible?: string | null;
  pediatricInfo?: PediatricInfo | null; // rempli seulement si mineur
  photoS3Key?: string | null; // voir §6
  status: PatientStatus;
  isActive: boolean; // convention soft-delete existante
  createdAt: Date;
  updatedAt: Date;
}

export type InsertPatient = Omit<
  Patient,
  "id" | "dossierNumber" | "photoS3Key" | "status" | "isActive" | "createdAt" | "updatedAt"
> & { id?: string };
```

`insertPatientSchema` (Zod) : mêmes règles, champs marqués `*` sur la
maquette (`lastName`, `firstName`, `dateOfBirth`, `sex`, `primaryPhone`,
`residenceAddress`, et dans le bloc contact d'urgence `name`/`relation`/
`phone`) en `.min(1)`/requis, le reste `.optional()`.

Document CouchDB `type: "patient"`, même forme que `type: "product"` :
`{_id: couchDocumentId("patient", id), id, type: "patient", ...}`.

**Recherche** (`patients-index`, sélecteur patient sur
`consultations-new`/`file-attente-new`) : `PatientsRepository.search(query,
tenantId)` — Mango `$or` sur `lastName`, `firstName`, `dossierNumber`,
`primaryPhone` (recherche insensible à la casse via un champ normalisé
dénormalisé `searchName: lowercase(firstName + " " + lastName)`, pattern
à ajouter — le repo `products` n'a pas ce besoin exact car il indexe sur
un champ nom unique).

## 5. Entité `Consultation`

```ts
export type ConsultationStatus =
  | "planifiee"
  | "en_attente"
  | "en_cours"
  | "terminee"
  | "annulee";
export type ConsultationPriority = "normal" | "urgent" | "tres_urgent";

export interface Consultation {
  id: string;
  tenantId: string;
  number: string | null; // null tant que non synchronisé (voir §7)
  patientId: string;
  scheduledAt: Date;
  specialty: string;
  assignedDoctorId: string;
  roomId?: string | null;
  priority: ConsultationPriority;
  reason: string;
  nurseNotes?: string | null;
  status: ConsultationStatus;
  createdAt: Date;
  updatedAt: Date;
}
```

**Écart assumé par rapport au parcours texte envoyé initialement** :
celui-ci décrivait un champ "Type de consultation" (Première consultation
/ Suivi / Contrôle / Post-opératoire / Urgence / Consultation
spécialisée). La maquette réelle `consultations-new` n'a **pas** ce champ
— seulement spécialité, médecin, salle, priorité, motif, notes
préliminaires. La maquette fait foi : ce champ n'est pas repris en
Phase 1. Si le besoin revient, il s'ajoute sans migration (champ
optionnel).

`consultations-show` correspond en réalité déjà à un écran de
consultation clinique complet (observations, diagnostic, ordonnance,
examens demandés) — recouvrement avec les écrans `consultation-medicale`/
`consultation-hub` prévus en Phase 2, plus détaillés et structurés par
spécialité. Décision : la Phase 1 livre `consultations-show` tel quel
(capture clinique basique en texte libre : `clinicalObservations?`,
`diagnosis?`, dans `Consultation`), et la Phase 2 enrichira la **même**
entité avec les champs structurés (examen clinique par spécialité,
histoire de la maladie) sans la remplacer.

Champs cliniques ajoutés à `Consultation` pour couvrir `consultations-show` :

```ts
  clinicalObservations?: string | null;
  diagnosis?: string | null;
```

(La prescription et les demandes d'examen visibles sur `consultations-show`
sont des entités à part — `Prescription`, `LabRequest` — introduites en
Phase 3 ; hors périmètre ici, seuls les boutons "Prescrire"/"Demander
examen" existent visuellement sans action branchée en Phase 1.)

Document CouchDB `type: "consultation"`.

## 6. Photos patient — S3 + offline-first

**Stockage local** : la photo est ajoutée comme **attachment CouchDB** du
document `patient` (`PUT /patient/{id}/photo` côté CouchDB, exposé via
`PatientsRepository.attachPhoto(id, tenantId, buffer, contentType)`).
Elle est donc immédiatement disponible hors-ligne sur l'appareil qui l'a
prise, et répliquée aux autres appareils/au serveur central par le
mécanisme de sync continu existant (`db.sync(..., {live: true})`) sans
changement à l'infrastructure de sync.

**Upload S3** : seul le backend détient les credentials AWS — jamais le
client desktop (frontière de sécurité pour des credentials IAM). Un
nouveau service `PatientPhotoSyncService` (backend), branché sur le
mécanisme équivalent à `PouchDBService`/`SyncModule` déjà en place pour
observer les changements du tenant DB (`_changes` feed CouchDB), détecte
les documents `patient` avec un attachment photo présent et sans
`photoS3Key`, télécharge l'attachment, l'upload vers S3
(`@aws-sdk/client-s3`), puis patch le document avec `photoS3Key`. Best-
effort avec `logger.warn` en cas d'échec (comme
`renameCategoryOnProducts`) — un échec d'upload S3 ne bloque jamais la
création/l'usage du patient. Clé S3 :
`tenants/{tenantId}/patients/{patientId}/photo-{timestamp}.jpg`.

**Lecture** : le frontend tente d'abord l'attachment local PouchDB (0
aller-retour réseau, fonctionne hors-ligne). Si absent (photo prise sur
un autre appareil, binaire pas encore répliqué), fallback sur
`GET /api/patients/:id/photo-url` (nouveau endpoint,
`@CheckPolicy(PatientsPolicy, "view")`), qui renvoie une URL S3
pré-signée à durée limitée (`@aws-sdk/s3-request-presigner`) si
`photoS3Key` existe, 404 sinon.

**Bucket** : privé, à créer par l'utilisateur côté console AWS (hors
périmètre de cette implémentation — pas d'accès au compte AWS). Nouvelles
variables d'environnement dans `backend/env.template` :

```
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=
AWS_S3_BUCKET_PATIENT_PHOTOS=
```

IAM : un user/role scopé uniquement à ce bucket, actions `s3:PutObject`,
`s3:GetObject` (le service ne fait jamais de `DeleteObject` dans cette
phase — pas de suppression de photo prévue).

## 7. Numérotation séquentielle (`dossierNumber`, `Consultation.number`)

Format `MC-{année}-{séquence:04d}` (patient) et `C-{année}-{séquence}`
(consultation), par tenant et par année.

**Contrainte** : la création doit fonctionner hors-ligne (arrivée patient
sans réseau), mais un compteur séquentiel lisible ne peut pas être
attribué de façon sûre par un appareil déconnecté sans risquer des
collisions entre appareils.

**Décision** : le patient/la consultation est utilisable immédiatement
(id interne UUID généré côté client, comme le reste du repo) ;
`dossierNumber`/`number` reste `null` tant que le document n'a pas
atteint le serveur central. Le backend, en recevant le document via
réplication, assigne le numéro via un document compteur CouchDB
(`type: "counter"`, `_id` déterministe `counter:patient:{tenantId}:{year}`),
avec retry-on-conflict incrémental — même pattern que
`ProductsRepository.doAdjustStock` (boucle de retry sur 409). Le patch
qui fixe `dossierNumber` déclenche une nouvelle réplication vers les
appareils.

**UI** : tant que `dossierNumber === null`, `patients-index`/
`patients-show` affichent "En attente de synchronisation" à la place du
numéro. Le patient reste pleinement fonctionnel (recherche par nom/
téléphone, consultation, file d'attente) via son id interne en
attendant.

## 8. File d'attente — modèle événementiel append-only

Pas de document mutable unique par entrée de file (risque de conflit
d'écriture si deux postes changent le statut hors-ligne quasi
simultanément). Chaque transition est un document indépendant :

```ts
export type QueueEventType =
  | "arrived"
  | "registered"
  | "waiting"
  | "called"
  | "in_care"
  | "in_consultation"
  | "completed"
  | "cancelled"
  | "transferred"
  | "priority_changed";

export interface QueueEvent {
  id: string;
  tenantId: string;
  consultationId: string;
  patientId: string; // dénormalisé pour affichage direct
  eventType: QueueEventType;
  payload?: { priority?: ConsultationPriority; targetService?: string } | null;
  actorUserId: string;
  actorDeviceId?: string | null;
  occurredAt: Date;
}
```

Document CouchDB `type: "queue_event"`.

**État courant** : `QueueRepository.getActiveQueue(tenantId)` charge tous
les `queue_event` du jour (Mango `selector: {type: "queue_event",
tenantId, occurredAt: {$gte: startOfDay}}` — volume attendu : dizaines à
quelques centaines d'événements/jour, pliage en mémoire suffisant, pas
besoin de vue map-reduce CouchDB pour cette phase), les groupe par
`consultationId`, et réduit chaque groupe à : dernier `eventType` (=
statut courant), dernier `priority_changed.payload.priority` sinon la
priorité initiale de la `Consultation`, et l'horodatage de chaque
transition (alimente directement la timeline "Suivi de l'admission" de
`file-attente-show`).

**Actions UI → événements** :
- "Enregistrer un patient" (`file-attente-new`) → crée `Consultation`
  (si nouveau motif de visite sans consultation planifiée existante) +
  événement `arrived` puis `registered`.
- "Prendre en charge" / "Marquer comme vu / Commencer" → `in_care` ou
  `in_consultation` selon le contexte (accueil/infirmier vs médecin).
- "Terminer" → `completed`.
- "Changer priorité" → `priority_changed`.
- "Transférer vers service" → `transferred`.
- "Annuler / Sortir de la file" → `cancelled`.

Aucune garde de transition stricte en Phase 1 (comme le reste du repo,
section 2) — l'UI limite les actions proposées selon l'état courant
calculé, mais le backend accepte tout événement valide pour l'instant.

## 9. API & permissions

Trois nouveaux modules, calqués sur `backend/src/modules/products/` :

- `backend/src/modules/patients/` : `patients.controller.ts`,
  `patients.service.ts`, `patients.repository.ts`, `patients.policy.ts`,
  `patients.module.ts`, `dto/create-patient.dto.ts`,
  `dto/update-patient.dto.ts`.
- `backend/src/modules/consultations/` : structure identique.
- `backend/src/modules/queue/` : structure identique (repository +
  service exposant `getActiveQueue`, `appendEvent`).

Chaque contrôleur : `@UseGuards(JwtAuthGuard, PolicyGuard)`, tenant dérivé
de `req.user.tenantId` via le helper `tenantId(req, ...)` (repris tel
quel du pattern `ProductsController`), jamais du `tenantId` client.

`PatientsPolicy extends BasePolicy` :
- `view()` → `isAdmin() || isManager() || isAccueil() || isInfirmier() || isMedecin()`
- `create()` / `update()` → `isAdmin() || isManager() || isAccueil()`

`ConsultationsPolicy` :
- `view()` → mêmes rôles que `PatientsPolicy.view()`
- `create()` → `isAdmin() || isManager() || isAccueil() || isMedecin()`
- `update()` → `isAdmin() || isManager() || isMedecin() || isInfirmier()`
  (le médecin écrit diagnostic/observations, l'infirmier les notes
  préliminaires/constantes)
- `cancel()` → `isAdmin() || isManager() || isAccueil()`

`QueuePolicy` :
- `view()` → `isAdmin() || isManager() || isAccueil() || isInfirmier() || isMedecin()`
- `appendEvent()` → mêmes rôles que `view()`

Routes principales :
- `GET /api/patients/:tenantId` (liste + recherche), `POST /api/patients`,
  `GET /api/patients/:id`, `PUT /api/patients/:id`,
  `GET /api/patients/:id/photo-url`, `PUT /api/patients/:id/photo`
  (upload attachment local).
- `GET /api/consultations/:tenantId` (liste + filtres spécialité/
  médecin/date), `POST /api/consultations`, `GET /api/consultations/:id`,
  `PUT /api/consultations/:id`.
- `GET /api/queue/:tenantId` (état courant du jour), `POST /api/queue/
  events` (ajout d'un événement).

## 10. Frontend

Nouvelles pages `frontend/src/pages/Patients.tsx`,
`Consultations.tsx`, `FileAttente.tsx` — structure liste + détail + modale
de `Products.tsx` (état local `viewMode: "list" | "details"`, modale de
création/édition).

Routes ajoutées dans `App.tsx` : `/patients`, `/consultations`,
`/file-attente`, chacune `lazy` + `<ProtectedRoute><Layout>...`.

Data-fetching `@tanstack/react-query` : `queryKey: ["/api/patients",
currentTenant?.id]`, etc. Mutations offline via `useOfflineCreateMutation`/
`useOfflineUpdateMutation` (à vérifier/compléter si absents à côté de
`useOfflineDeleteMutation`, même famille de hooks).

Policies miroir frontend : `frontend/src/lib/policies/patients.policy.ts`,
`consultations.policy.ts`, `queue.policy.ts`, mêmes règles que §9,
méthodes `can*`. `usePolicy(...)` + `<PolicyGuard>` pour le gating UI.

i18n : nouveaux fichiers `frontend/src/lib/i18n/patients.ts`,
`consultations.ts`, `queue.ts` (`{ en, fr }`), ajoutés au tableau
`sections` de `frontend/src/lib/i18n/index.ts`.

Sidebar (`frontend/src/components/Sidebar.tsx`) : entrées "Patients",
"Consultations", "File d'attente" ajoutées à `menuItems`, gated par
`patientsPolicy.canView()` etc., icônes `lucide-react` (`Users`,
`CalendarCheck`, `CircleX` — cohérent avec les icônes vues sur la
maquette `dashboard-medecin`).

## 11. Tests

- `patients.repository.spec.ts`, `consultations.repository.spec.ts`,
  `queue.repository.spec.ts` : construction directe avec `CouchDBService`
  mocké, même style que `products.repository.spec.ts` — couvrent
  recherche, création, `getActiveQueue` (pliage d'événements, y compris
  cas priorité modifiée après création).
- `*.service.spec.ts`, `*.policy.ts` testés indirectement via les specs
  de repository/controller existants comme gabarit (pas de test dédié
  systématique pour les policies dans le repo actuel).
- `patient-photo-sync.service.spec.ts` : mock du client S3 et du flux de
  changements CouchDB — vérifie l'upload, le patch `photoS3Key`, et le
  comportement best-effort en cas d'échec S3 (log, pas d'exception
  propagée).
- Pas de nouveau test frontend (pages React fines, convention du projet
  — pas de jsdom/RTL, cf. `CLAUDE.md`).

## 12. Hors périmètre de cette spec

- Pré-consultation infirmière détaillée (constantes complètes, symptômes
  structurés), consultation médicale structurée par spécialité,
  consultation-hub — Phase 2.
- Prescription, demandes de laboratoire, résultats, pharmacie — Phase 3.
  Les boutons correspondants existent visuellement sur
  `consultations-show` mais ne sont pas branchés.
- Plan de prise en charge, clôture, suivi post-consultation, historique
  patient détaillé — Phase 4.
- Salles (gestion dédiée au-delà du champ `roomId` texte libre), Admin
  (gestion utilisateurs/rôles/journal d'audit) — Phase 5.
- Garde de transition stricte sur les statuts (state machine) — non
  demandé, cohérent avec l'absence de ce pattern ailleurs dans le repo ;
  à reconsidérer si des transitions invalides posent problème en usage
  réel.
- Correction de `CLAUDE.md` (section Postgres/Drizzle obsolète) —
  signalé en §2, à traiter séparément.
- Suppression de photo patient (`s3:DeleteObject`) — non prévue, à
  ajouter si besoin confirmé.
