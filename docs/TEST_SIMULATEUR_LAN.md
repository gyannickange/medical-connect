# Test LAN avec deux caisses simulées

Le simulateur lance deux applications Tauri avec des profils complètement
distincts :

- `com.stockflow.desktop.caisse1` pour Caisse 1 ;
- `com.stockflow.desktop.caisse2` pour Caisse 2.

Chaque profil possède son propre stockage WebView, ses cookies, son
`localStorage`, son identifiant d'appareil et son certificat LAN. Le profil
impose également un identifiant natif déterministe (`device-sim-caisse1` ou
`device-sim-caisse2`) afin que le serveur Vite commun ne puisse pas confondre
les deux appareils.

## Prérequis

Le backend doit être accessible sur l'adresse configurée. En développement
local, il doit écouter sur `http://localhost:5200` :

```bash
cd /Users/gyannick97/Sites/React/StockFlow/backend
npm run dev
```

Il est nécessaire lors du premier enrôlement de chaque profil afin de délivrer
son certificat tenant.

## Lancement

Ouvrir trois terminaux dans le dossier `frontend`.

Terminal 1 :

```bash
source /Users/gyannick97/.cargo/env
npm run desktop:simulator:web
```

Terminal 2 :

```bash
source /Users/gyannick97/.cargo/env
npm run desktop:simulator:caisse1
```

Terminal 3, après l'ouverture de Caisse 1 :

```bash
source /Users/gyannick97/.cargo/env
npm run desktop:simulator:caisse2
```

Se connecter dans les deux fenêtres avec deux utilisateurs appartenant au même
tenant. L'indicateur `Agent LAN natif` doit afficher `Actif`, puis
`Pairs du même tenant : 1` dans chaque fenêtre.

Il n'est pas nécessaire de couper Internet : la découverte mDNS fonctionne
dans les deux situations. La coupure Internet sert seulement à vérifier ensuite
que la découverte continue de fonctionner sans le backend distant.

## Vérification de l'isolation

Déconnecter Caisse 2 et la reconnecter avec un utilisateur d'un autre tenant.
Après quelques secondes, chaque fenêtre doit afficher
`Pairs du même tenant : 0`.

## Limite actuelle

Ce test valide l'identité, le certificat et la découverte mDNS. Le transport
des opérations métier entre les caisses sera implémenté dans l'étape suivante.
