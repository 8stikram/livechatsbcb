# LiveChatSBCB

App Windows pour une bande de potes (10 personnes en ligne au maximum) : un média envoyé par l'un s'affiche chez tout le monde en même temps.

## Organisation

| Dossier | Rôle |
|---|---|
| `apps/desktop` | L'app Windows (Electron, React) : fenêtre Contrôle et fenêtre Scène |
| `services/party` | Le service en ligne (Cloudflare Workers et Durable Objects) qui gère les parties |
| `packages/protocol` | Les messages échangés entre l'app et le service |
| `assets` | Le logo d'origine |
| `tools` | La génération des icônes à partir du logo |

## Commandes

À lancer depuis ce dossier :

| Commande | Effet |
|---|---|
| `npm run dev:server` | Démarre le service en local, sur le port 8787 |
| `npm run dev:app` | Démarre l'app en mode développement |
| `npm run typecheck` | Vérifie les types |
| `npm test` | Teste le service |
| `npm run test:e2e` | Teste l'app avec de vraies fenêtres (le port 8787 doit être libre) |
| `npm run icons` | Régénère les icônes |
| `npm run build:exe` | Construit l'installateur dans `apps/desktop/release` |

## Adresse du service

L'adresse du service est intégrée à l'app au moment de la construction :

- `npm run build:exe` vise le service en ligne, `https://livechatsbcb-party.livechatsbcb-party.workers.dev` ;
- `npm run dev:app` et `npm run test:e2e` visent le service local, `http://127.0.0.1:8787` ;
- la variable `LIVECHATSBCB_SERVER_URL` remplace l'adresse dans tous les cas.

## Publier le service

Le service se publie depuis `services/party` avec `npx wrangler deploy`. Pour le vérifier ensuite (cela crée une party puis la supprime) :

`node test/online-smoke.mjs https://livechatsbcb-party.livechatsbcb-party.workers.dev`

## Sécurité

- Le jeton de chaque membre reste dans le processus principal, chiffré sur le disque, et n'atteint jamais les fenêtres.
- Les fenêtres n'ont pas accès à Node, et les pages servies par l'app ont une politique de contenu stricte.
- Le service ne garde qu'une empreinte des jetons, et limite les essais de code par adresse IP.
