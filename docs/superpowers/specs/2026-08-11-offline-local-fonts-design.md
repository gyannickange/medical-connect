# Polices locales pour fonctionnement hors ligne

## Objectif

StockFlow doit conserver sa typographie actuelle sans effectuer de requête vers Google Fonts ou une autre source distante. Seules les familles réellement utilisées par l’interface doivent être embarquées.

## Portée

Les trois rôles typographiques existants sont conservés :

- Inter pour le texte courant ;
- JetBrains Mono pour les valeurs et contenus monospace ;
- Space Grotesk pour les titres et éléments d’affichage.

Toutes les autres familles actuellement demandées dans `frontend/index.html` sont inutilisées et seront supprimées.

## Stockage et formats

Les fontes seront ajoutées sous `frontend/src/assets/fonts/` au format WOFF2 variable afin que Vite les intègre au build de production. Les fichiers nécessaires sont :

- Inter, style normal, graisses 300 à 700 ;
- Inter, style italique, graisses 300 à 700 ;
- JetBrains Mono, style normal, graisses 300 à 700 ;
- Space Grotesk, style normal, graisses 300 à 700.

Les fichiers de licence associés seront conservés avec les fontes.

## Intégration CSS

`frontend/src/index.css` déclarera les quatre ressources avec `@font-face`, des chemins locaux résolus par Vite et `font-display: swap`. Les noms de familles resteront identiques afin de ne modifier ni les variables CSS existantes ni la configuration Tailwind.

L’import `fonts.googleapis.com` de `frontend/src/index.css` sera supprimé. Les liens `preconnect` et la feuille Google Fonts de `frontend/index.html` seront également supprimés.

## Comportement hors ligne

Après compilation, le HTML et le CSS produits ne devront contenir aucune référence à `fonts.googleapis.com` ou `fonts.gstatic.com`. Les ressources WOFF2 devront être présentes dans les assets du build et référencées depuis le CSS compilé.

Les polices système existantes resteront en dernier recours dans les piles CSS si un navigateur ne peut pas charger WOFF2.

## Vérification

Un contrôle automatisé inspectera le build de production pour vérifier :

1. l’absence de toute URL Google Fonts dans le HTML et le CSS générés ;
2. la présence des quatre fichiers WOFF2 embarqués ;
3. la présence des déclarations des trois familles dans le CSS compilé.

La validation finale exécutera ce contrôle, la vérification TypeScript et le build Vite.

## Hors portée

Les polices Arial et Courier utilisées pour générer des PDF ou reçus ne sont pas téléchargées : elles reposent sur les polices standards du moteur de rendu et ne déclenchent aucun chargement Internet. Aucun composant visuel ni choix typographique ne sera modifié.
