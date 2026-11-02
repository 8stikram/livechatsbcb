# Guide de développement

## Organisation

| Dossier | Rôle |
|---|---|
| `apps/desktop` | L'app Windows (Electron, React) : fenêtre Contrôle et overlay transparent |
| `services/party` | Le service en ligne (Cloudflare Workers et Durable Objects) qui gère les parties |
| `packages/protocol` | Les messages échangés entre l'app et le service |
| `assets` | Le logo d'origine |
| `docs` | Ce guide, et les images du README |
| `tools` | La génération des icônes à partir du logo |

## Commandes

À lancer depuis la racine du projet :

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

## Connexion Discord

La connexion avec Discord est obligatoire : le pseudo et la photo viennent de là. Elle se fait dans le navigateur, et l'app ne voit jamais le mot de passe. Le service demande à Discord `identify` et `guilds`, c'est-à-dire le compte et la liste de ses serveurs, et rien d'autre : ni les messages, ni les salons, ni les membres. Il n'y a pas de bot, et rien à installer sur les serveurs.

Pour savoir qui est encore sur quel serveur, le service garde le jeton Discord de chaque compte, chiffré. Il le rend à Discord à la dernière déconnexion du compte.

À la première connexion, l'app demande avec quels serveurs l'utiliser : on clique sur leurs photos, avec une barre de recherche. Ces serveurs restent en ronds sur le côté, avec un rond « + » pour en ajouter ou en retirer. Chaque serveur a une seule party, ouverte à tous ses membres qui ont l'app, et cliquer sur un rond y entre en quittant la précédente. Quelqu'un qui quitte le serveur en sort sous 5 minutes.

Une party privée avec un code à 6 caractères reste possible, depuis le coin « Party privée » de l'écran des serveurs. Elle garde son rond sur le côté tant qu'on ne la quitte pas.

Si Discord ne répond plus, ceux qui sont déjà dans une party continuent, et les serveurs déjà connus restent accessibles 24 h.

Pour mettre en service (le Client ID n'est pas secret, le Client Secret l'est et ne se colle nulle part ailleurs) :

1. dans le portail Discord, déclarer l'adresse de retour `https://livechatsbcb-party.livechatsbcb-party.workers.dev/v1/auth/callback` ;
2. mettre le Client ID dans `DISCORD_CLIENT_ID` de `services/party/wrangler.jsonc`, puis lancer `npx wrangler types` ;
3. depuis `services/party`, lancer `npx wrangler secret put DISCORD_CLIENT_SECRET`.

Les tests utilisent un faux Discord (`services/party/test/fake-discord.ts`), et rien de réel n'est contacté, à part les photos par défaut de Discord.

## Envois

Un envoi part de l'onglet LiveChat : une image ou une vidéo, un son, et un texte. Un texte seul peut aussi partir de l'onglet Party. Le service l'annonce quand son dernier fichier est arrivé, chaque PC télécharge tout, puis tout le monde le lance au même instant. Les envois passent l'un après l'autre, sans s'interrompre.

Une vidéo fixe le passage et la durée. Sinon, c'est le son. Avec une vidéo et un son, celui qui envoie choisit ce qu'on entend.

Pour que le projet reste gratuit, le service applique lui-même ces limites :

- 500 Mo par envoi ;
- chaque fichier est effacé 1 jour après son envoi ;
- 8 Gio stockés au total : au-delà, les envois de fichiers sont refusés ;
- 900 000 opérations d'écriture par mois sur le stockage.

Les réglages de l'overlay (écran, volume, position des zones) sont propres à chaque PC.

L'overlay ne s'affiche pas par-dessus un jeu en plein écran exclusif : il faut le mode fenêtré sans bordure.

L'onglet Historique garde ce qui est passé dans la party, 50 envois au maximum et jamais plus d'1 jour. « Rejouer pour tous » remet l'envoi dans la file de la party, sans rien renvoyer au stockage. « Revoir pour moi » ne l'affiche que sur son propre écran.

## Mode avancé

Le mode avancé ajoute une « scène » à l'envoi : une liste d'images posées sur tout l'écran, en pourcentage de sa taille, avec leurs effets. Chaque PC la redessine avec le même code que l'aperçu de l'onglet LiveChat (`renderer/src/scene.tsx`), donc rien n'est filmé ni recalculé. Le même fichier utilisé deux fois n'est envoyé qu'une fois.

Le service refuse ce qui dépasse les limites : 5 images, 1 vidéo, 1 son, 1 seul élément flou, et 500 Mo au total. Ces limites n'ont pas encore été mesurées sur un vrai jeu.

## Bibliothèque

La bibliothèque vit dans `library.json`, dans le dossier de données de l'app, et le service n'en sait rien. Elle parcourt les dossiers choisis (5 000 fichiers et 8 niveaux au maximum) à chaque ouverture de l'onglet.

Le clic droit passe par un menu de Windows. Renommer et mettre à la corbeille sont bloqués tant que l'app compte sur le fichier : envoi en cours, file d'attente non vide, ou fichier en préparation dans l'onglet LiveChat. Un fichier renommé reste suivi par les favoris et les LiveChats sauvegardés.

Un LiveChat sauvegardé garde le chemin de ses fichiers et une petite image. Un fichier compte comme manquant s'il a disparu ou si sa taille a changé. « Retrouver » accepte un fichier de même nature et de même taille que l'un de ceux qui manquent, puis cherche les autres à côté, sous leur nom.

## Fenêtre et démarrage

Fermer la fenêtre laisse l'app ouverte près de l'horloge, pour continuer à afficher ce que les autres envoient. On la quitte par un clic droit sur son icône, et la lancer une seconde fois ramène simplement sa fenêtre.

Une fois installée, l'app se lance discrètement au démarrage de Windows, sauf si on décoche la case dans Réglages. Le compte reste connecté tant qu'il sert au moins une fois tous les 90 jours.

## Publier le service

Le service se publie depuis `services/party` avec `npx wrangler deploy`. Le service et l'app doivent partir ensemble quand le protocole change, car les anciennes apps sont alors invitées à se mettre à jour. Pour le vérifier ensuite (cela ne crée rien, se connecter demande un vrai compte Discord) :

`node test/online-smoke.mjs https://livechatsbcb-party.livechatsbcb-party.workers.dev`

## Publier une version de l'app

`npm run release -- 1.2.3` construit l'installateur et l'envoie sur le stockage des mises à jour. Les apps installées le détectent à leur lancement, puis toutes les heures.

Le lien à donner à un nouveau membre est toujours le même : `https://livechatsbcb-party.livechatsbcb-party.workers.dev/download`.

Pour vérifier une vraie mise à jour : installer une version publiée, publier une version plus récente, puis lancer `node test/update-check.mjs` depuis `apps/desktop`.

## Sécurité

- Le jeton de chaque membre reste dans le processus principal, chiffré sur le disque, et n'atteint jamais les fenêtres.
- Les fenêtres n'ont pas accès à Node, et les pages servies par l'app ont une politique de contenu stricte.
- Le service ne garde qu'une empreinte des jetons, et limite les essais de code par adresse IP.
- Le ticket de connexion ne sert qu'une fois, et seulement à l'app qui a lancé la connexion. La réponse de Discord ne peut revenir que sur le PC qui l'a demandée.
