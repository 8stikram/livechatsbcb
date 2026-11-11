# 13 — Journal de fabrication

## Étape 0 — Moteur de règles et simulateur (11/11/2026)

Fait dans `packages/melody` :

| Fichier | Rôle |
|---|---|
| `src/config.ts` | **Tous les chiffres d'équilibre**, à un seul endroit |
| `src/data/` | Genres, beats, thèmes ; catalogue généré depuis les CSV (`npm run data -w @livechatsbcb/melody`) |
| `src/artists.ts` | Attributs, note générale, affinités, énergie |
| `src/quality.ts` | Prix des 4 choix, énergie, fourchette de qualité, featuring |
| `src/release.ts` | Marketing, streams de première semaine, score de hit, nouveaux fans |
| `src/economy.ts` | Valeur d'un artiste, catalogue, concerts, paliers, classement |
| `src/world.ts` | Créer un monde, signer, créer un son, programmer une sortie, concert, prêt |
| `src/tick.ts` | Le tick : sorties, charts, argent, coûts, prêts, faillite, paliers |
| `src/sim.ts` | Simulateur : 4 labels automatiques jouent des saisons entières |

Lancer le simulateur : `npm run sim -w @livechatsbcb/melody -- 3 1` (3 saisons, graine 1). Trois saisons se jouent en 0,1 seconde.

**Pas encore fait** (prévu au MVP 1) : le serveur (monde par serveur Discord, tick automatique), les écrans, les événements de studio tirés au sort, la négociation en plusieurs tours, le scouting, les démos, le tutoriel. Le moteur accepte déjà le bonus ou le malus d'un événement et les choix « débrouille », mais rien ne les tire encore.

## Chiffres changés par rapport au document de conception

Le premier essai suivait le document à la lettre : un label passait Empire en 2 saisons. Réglages retenus après simulation :

| Sujet | Document | Maintenant | Pourquoi |
|---|---|---|---|
| Nouveaux fans par sortie | découverte × 3 % × q | découverte × **2 % × q²** | La croissance explosait ; la qualité doit compter davantage |
| Effet de la hype sur la portée | 1 + hype / 50 | **1 + hype / 100** | Idem |
| Plafond du marketing | 10 × les fans, puis 50 % | **max(100 000, 3 × les fans), puis 25 %** | On ne peut plus acheter des millions de fans d'un coup |
| Public d'un concert | × (1 + hype / 100) | × **(0,5 + hype / 50)** | Les concerts rapportaient autant avec des sons bâclés : il faut des hits pour remplir |
| Concerts la même semaine | pas de limite | **−25 % de public par concert en plus**, 3 maximum | Limite l'argent facile |
| Énergie d'un concert | 8 | **10** | Idem |
| Valeur d'un artiste | 20 × fans × 0,012 € | 20 × (fans × 0,012 € **+ ce que rapportent 2 concerts**) | Un artiste coûtait bien moins que ce qu'il rapportait |
| Avance attendue | — | **15 % de la valeur** | Réglage de départ |
| Qui accepte de signer | note ≥ 80 : palier Respecté | En plus, selon les fans : jusqu'à 50 000 fans au palier Maison, 500 000 Underground, 5 M Respecté, 25 M Mainstream | Empêche de signer une star le premier jour |
| Réputation | gains fixes | gains **× (100 − réputation) / 100**, et +0,2 pour un « Succès » | Monter devient plus dur en haut ; un petit label avance quand même |
| Entrée dans un chart | toute place | au moins **100 000 streams** (global) et **10 000** (genre) | Avec 236 artistes, les charts sont encore peu remplis. À retirer avec le catalogue de 1 000 |

## Ce que donne la simulation (graine 1)

| Fin de | Label qui investit | Label en débrouille | Joueur occasionnel (1 jour sur 3) |
|---|---|---|---|
| Saison 1 | Maison, 41 000 fans, réputation 20 | Maison, 30 000 fans, 111 000 € | Maison, 14 000 fans |
| Saison 2 | Underground, 185 000 fans | Underground, 297 000 fans, 568 000 € | Maison, 16 000 fans |
| Saison 3 | Underground, 271 000 fans, réputation 59 | Underground, 328 000 fans, 1,4 M€ | Maison, 18 000 fans |

Lecture : le rythme est lent et régulier, aucun label n'explose. **Limites connues** : les robots jouent mal (ils ne renouvellent pas les contrats, n'empruntent pas, n'achètent pas d'artistes aux autres), et la débrouille avec beaucoup de concerts rapporte encore plus de cash que l'investissement. À reprendre quand de vrais joueurs testeront.
