# Configuration initiale de StockFlow — Design

Date : 2026-08-15  
Statut : validé pour passage en plan d’implémentation

## 1. Objectif

Après la toute première connexion, StockFlow doit demander les informations
nécessaires à la configuration de l’application avant d’ouvrir le tableau de
bord. Ce comportement s’applique aussi bien au mode connecté qu’au mode local.

Le parcours reprend les réglages déjà disponibles dans `Settings.tsx` :

1. informations de l’entreprise ;
2. devise et format des nombres ;
3. taxe par défaut ;
4. reçu et facture.

Une fois la configuration enregistrée, les connexions suivantes ouvrent
directement l’application. Tous les choix restent modifiables dans la page
Paramètres.

## 2. Décision d’expérience

Trois approches ont été considérées : une modale au-dessus du tableau de bord,
une simple redirection vers la page Paramètres, et un assistant dédié. La modale
est trop étroite pour l’aperçu des documents et la page Paramètres ne distingue
pas clairement les réglages nécessaires au premier démarrage. La solution
retenue est donc un **assistant dédié et obligatoire**, affiché après la première
authentification réussie.

Il ne s’agit pas d’un tutoriel : le formulaire écrit directement les vrais
réglages de l’entreprise. Le parcours est court, progressif, responsive et
indique l’étape courante. Il ne contient pas d’option « Ignorer », puisque sa
fonction est de terminer la configuration minimale de l’application.

## 3. Déclenchement et navigation

- Le choix du mode d’installation et la connexion conservent leur ordre actuel.
- Dès qu’un utilisateur est authentifié et que le tenant courant est connu, un
  garde de configuration lit le réglage booléen `initialSetupCompleted`.
- Si ce réglage n’est pas `true`, toute route applicative protégée redirige vers
  `/initial-setup`.
- La route `/initial-setup` est elle-même protégée par l’authentification, mais
  s’affiche sans la navigation principale afin de garder l’utilisateur concentré.
- Le marqueur `initialSetupCompleted` est enregistré en dernier. Il ne passe à
  `true` que lorsque tous les réglages du formulaire ont été sauvegardés.
- Après succès, l’assistant redirige vers `/`.
- Le marqueur appartient aux réglages du tenant : le comportement est donc
  cohérent avec le tenant connecté et avec le tenant local `local`.

Cette portée reste volontairement centrée sur le premier utilisateur connecté,
qui est normalement l’administrateur issu de l’inscription ou du bootstrap
local. Les règles multi-utilisateurs supplémentaires ne font pas partie de ce
changement.

## 4. Contenu de l’assistant

### Étape 1 — Informations de l’entreprise

- Nom de l’entreprise : obligatoire, espaces seuls refusés.
- Téléphone : facultatif.
- Email : facultatif, mais doit être valide lorsqu’il est renseigné.
- Site web : facultatif.
- Adresse : facultative.

Une aide concise indique que les champs facultatifs enrichissent les reçus et
factures. Ils ne bloquent cependant pas la fin de la configuration.

### Étape 2 — Devise et format des nombres

- Devise par défaut.
- Position du symbole.
- Séparateur décimal.
- Séparateur de milliers.
- Nombre de décimales, compris entre 0 et 4.

Les valeurs existantes de `useSettings` sont utilisées comme valeurs initiales.
En l’absence de réglages sauvegardés, l’assistant reprend les valeurs par défaut
actuelles de l’application.

### Étape 3 — Taxe

- Taux de taxe de vente par défaut, compris entre 0 et 100.
- Une explication précise que ce taux peut ensuite être remplacé par catégorie.

### Étape 4 — Reçu et facture

- Activation ou désactivation de l’impression automatique du reçu.
- Choix conservé entre `retail` (petit reçu thermique de 80 mm) et `invoice`
  (grande facture A4/PDF).
- Un seul aperçu est affiché à la fois : celui du format actuellement choisi.
- Le changement de format remplace immédiatement l’aperçu, sans afficher les
  deux documents côte à côte.
- L’aperçu utilise les valeurs saisies dans les étapes précédentes : nom,
  coordonnées, devise, séparateurs et taxe. Ainsi, l’utilisateur voit directement
  l’intérêt de compléter les coordonnées facultatives.

L’aperçu est une représentation légère en HTML/CSS. Il ne lance ni impression ni
génération PDF pendant la configuration.

## 5. Architecture frontend

### Composants

- `InitialSetupGate` : attend l’authentification, le tenant et les réglages ;
  redirige vers l’assistant lorsque le marqueur est absent.
- `InitialSetup` : porte l’état global du formulaire, la navigation entre étapes,
  la validation et l’enregistrement final.
- `ReceiptPreview` : composant de présentation isolé recevant le format et les
  valeurs courantes ; il affiche soit le reçu, soit la facture.
- Les schémas et valeurs du formulaire sont placés dans un module testable afin
  que la page reste centrée sur l’affichage.

L’assistant réutilise `SettingsProvider` et `useSettings` plutôt que de créer un
second système de configuration. Les clés existantes restent la source de vérité :
`companyName`, `companyAddress`, `companyPhone`, `companyEmail`,
`companyWebsite`, `defaultCurrency`, les quatre clés `currency*`,
`defaultTaxRate`, `autoPrintReceipt` et `receiptFormat`.

### Persistance en ligne et hors ligne

- En mode connecté, les écritures continuent de passer par `/api/settings`.
- En mode local, elles passent par `offlineApiRequest` et PouchDB sans tentative
  réseau, conformément au mode d’installation existant.
- La couche de réglages doit refléter immédiatement les créations et mises à
  jour locales dans son cache React ; un rechargement doit également relire le
  cache PouchDB.
- Le marqueur de fin utilise la même couche de données que les autres réglages,
  sans marqueur parallèle uniquement stocké dans le navigateur.

## 6. Validation et erreurs

- Le bouton final est désactivé pendant l’enregistrement pour empêcher les
  doubles soumissions.
- Une erreur de validation reste sur l’étape concernée avec un message lié au
  champ.
- En cas d’échec d’écriture, le marqueur final n’est pas enregistré, un message
  clair est affiché et les valeurs saisies restent dans le formulaire.
- Si certaines écritures ont réussi avant une erreur, la prochaine ouverture
  préremplit ces valeurs et reprend la configuration ; elle ne considère pas le
  parcours terminé tant que le marqueur est absent.
- La navigation précédente conserve toutes les saisies.

## 7. Mise à jour de la page Paramètres

La page Paramètres conserve sa structure et ses fonctionnalités. Toutes les
icônes de titre de section actuellement sombres utilisent la classe de couleur
primaire StockFlow (`text-primary`), en thème clair comme en thème sombre.

La section « Paramètres de reçu et facture » remplace son simple sélecteur par le
même choix et le même composant `ReceiptPreview` que l’assistant. Les deux formats
restent proposés, mais seul le document sélectionné est visible.

## 8. Accessibilité et responsive

- Chaque étape possède un titre explicite et une indication de progression.
- Les contrôles sont associés à leurs libellés et les erreurs sont annoncées.
- Le choix du document est utilisable au clavier et expose son état sélectionné.
- Les cibles tactiles mesurent au moins 44 px.
- Sur grand écran, le formulaire et l’aperçu peuvent partager l’espace ; sur
  mobile, ils s’empilent et la facture se redimensionne sans débordement.
- Le bleu reste un accent pour les icônes, le focus, la progression et l’action
  principale ; les surfaces respectent les thèmes existants.

## 9. Tests et critères d’acceptation

Les tests automatisés doivent couvrir au minimum :

- absence du marqueur après connexion → redirection vers `/initial-setup` ;
- marqueur présent → accès normal aux routes de l’application ;
- nom vide ou composé d’espaces → étape entreprise bloquée ;
- coordonnées facultatives vides → configuration autorisée ;
- email renseigné invalide, taxe hors limites ou décimales hors limites → erreur ;
- sélection `retail` → seul le petit reçu est rendu ;
- sélection `invoice` → seule la grande facture est rendue ;
- sauvegarde des clés attendues puis du marqueur en dernier ;
- échec partiel → marqueur absent et reprise possible ;
- comportement identique du garde en mode connecté et en mode local ;
- icônes des titres de section Paramètres rendues avec la couleur primaire.

La vérification finale comprend les tests unitaires, le contrôle TypeScript, le
build frontend et une inspection visuelle unique sur desktop et mobile, dans les
deux thèmes.
