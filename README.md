# LiveChatSBCB

App Windows pour une bande de potes (10 personnes en ligne au maximum) : un média envoyé par l'un s'affiche chez tout le monde en même temps.

## Organisation

| Dossier | Rôle |
|---|---|
| `apps/desktop` | L'app Windows (Electron, React) : fenêtre Contrôle et overlay transparent |
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
| `npm run test:e2e` | Teste l'app avec de vraies fenêtres, presque hors de l'écran (le port 8787 doit être libre) |
| `npm run icons` | Régénère les icônes |
| `npm run build:exe` | Construit l'installateur dans `apps/desktop/release` |

## Adresse du service

L'adresse du service est intégrée à l'app au moment de la construction :

- `npm run build:exe` vise le service en ligne, `https://livechatsbcb-party.livechatsbcb-party.workers.dev` ;
- `npm run dev:app` et `npm run test:e2e` visent le service local, `http://127.0.0.1:8787` ;
- la variable `LIVECHATSBCB_SERVER_URL` remplace l'adresse dans tous les cas.

## Médias

Un média part de l'onglet Médias : image, vidéo, son ou texte. Le service l'annonce, chaque PC le télécharge, puis tout le monde le lance au même instant. Les médias passent l'un après l'autre, sans s'interrompre.

Pour que le projet reste gratuit, le service applique lui-même ces limites :

- 500 Mo par fichier ;
- chaque fichier est effacé 1 jour après son envoi ;
- 8 Gio stockés au total : au-delà, les envois de fichiers sont refusés ;
- 900 000 opérations d'écriture par mois sur le stockage.

Les réglages de l'overlay (écran, volume, position des zones) sont propres à chaque PC.

L'overlay ne s'affiche pas par-dessus un jeu en plein écran exclusif : il faut le mode fenêtré sans bordure.

## Publier le service

Le service se publie depuis `services/party` avec `npx wrangler deploy`. Pour le vérifier ensuite (cela crée une party puis la supprime) :

`node test/online-smoke.mjs https://livechatsbcb-party.livechatsbcb-party.workers.dev`

## Publier une version de l'app

`npm run release -- 1.2.3` construit l'installateur et l'envoie sur le stockage des mises à jour. Les apps installées le détectent à leur lancement, puis toutes les heures.

Le lien à donner à un nouveau membre est toujours le même : `https://livechatsbcb-party.livechatsbcb-party.workers.dev/download`.

Pour vérifier une vraie mise à jour : installer une version publiée, publier une version plus récente, puis lancer `node test/update-check.mjs` depuis `apps/desktop`.

## Sécurité

- Le jeton de chaque membre reste dans le processus principal, chiffré sur le disque, et n'atteint jamais les fenêtres.
- Les fenêtres n'ont pas accès à Node, et les pages servies par l'app ont une politique de contenu stricte.
- Le service ne garde qu'une empreinte des jetons, et limite les essais de code par adresse IP.
