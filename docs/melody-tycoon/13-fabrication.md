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

## Étape 1 — le serveur (fait)

- **Un monde par serveur Discord** : seuls les membres du serveur peuvent l'ouvrir. Chaque membre fonde son label (choix entre 3 débutants), 20 labels au plus par monde.
- **Actions** : fonder, signer, créer un son (avec aperçu du prix et de la note avant de payer), programmer une sortie, concert, emprunt. Une action refusée par les règles renvoie un message clair et ne change rien.
- **Le temps avance seul** : une semaine de jeu chaque matin à **6 h (heure de Paris)**, été comme hiver. Après une panne, le monde rattrape au plus 3 semaines.
- **Rester gratuit** : le monde tient en 4 lignes de stockage ; **100 mondes vivants** au plus ; un monde que personne n'ouvre pendant **30 jours** s'endort (plus de calcul) et libère sa place.
- **Tests** : 6 tests serveur (accès, actions refusées, fonder, son → sortie → paie au tick, deux joueurs et deux serveurs séparés, heure de Paris). Les tests utilisent une semaine toutes les 1,5 s.

Pas encore dans l'appli : il faut maintenant les écrans (style Nuit Néon jeu vidéo).

## Étape 2 — les écrans dans l'appli (fait)

- Dans **Jeux**, un sélecteur en haut : **Melody Tycoon** | Jeux de party. Il n'apparaît que dans la party d'un serveur Discord. Si un jeu de party démarre, tout le monde revient sur les jeux de party.
- Style **Nuit Néon jeu vidéo** (noir, violet → rose, cartes, gros boutons, animations, peu de chiffres).
- **Fonder** : nom du label + choix entre 3 cartes d'artistes débutants.
- **Accueil** : 3 grandes tuiles (Créer un son avec vinyle qui tourne, Prochaine sortie avec bande croisée, Cette semaine avec streams qui montent et étoiles) + 4 tuiles (classement, effectif, coffre, recrutement).
- **Effectif** : cartes d'artistes à collectionner, fiche avec radar, énergie, moral, hype, contrat ; boutons Créer un son et Concert (gain affiché).
- **Studio** : artiste → thème (« en vogue ») → beat (« son style », « va avec le thème ») → équipe (4 niveaux pour écriture, beat, producteur, studio) → titre → révélation de la note. La fourchette de qualité et le prix se mettent à jour à chaque choix.
- **Sorties** : coffre, choix de la semaine et de la promo ; sons programmés et sortis avec étoiles.
- **Recrutement** : cartes des artistes libres, bouton Signer avec l'avance, raison si impossible.
- **Charts** : podium du serveur, top global et top par genre, tes sons en surbrillance.
- **Banque** : cash, dettes, prêts, emprunter (somme et durée).
- Pas encore : embrouilles du studio, roue du featuring, négociation, tutoriel. Le serveur Melody n'est pas encore mis en ligne : à faire avec la prochaine version publiée.

## Étape 3 — embrouilles et featuring (fait)

- **Cabine** : après « Entrer en cabine », une carte par choix (écriture, beat, producteur, studio). Soit **ça roule** (qualité +2, +5 pour un coup de génie, énergie +3 ou moral +5), soit une **embrouille** à régler avec 2 ou 3 réactions (payer, recadrer = pari sur la discipline, changer d'approche, ignorer). 12 embrouilles + « l'invité demande plus ».
- Chance d'embrouille : 28 % au niveau 1, 20 % au 2, 13 % au 3, 8 % au 4, moins si l'artiste est discipliné, plus s'il a le moral bas ou est fatigué, −10 % par embrouille déjà subie sur le son (entre 3 et 60 %).
- **Featuring** : 8 invités possibles, du plus gros que le label peut payer au plus petit (jamais un artiste d'un autre joueur pour l'instant). Curseur d'offre de 30 à 150 % de la demande, chance affichée en direct, **roue** qui tourne. Refus : la demande monte de 10 %, 3 essais par semaine. Moins de 60 % : vexé pour la semaine. Moins de 40 % : vexé 4 semaines sans tourner la roue. Une fois sur quatre, l'invité demande 20 % de plus en cabine.
- **Pas de triche** : tout est tiré sur le serveur à partir de la graine du monde. Quitter la cabine et recommencer redonne les mêmes cartes la même semaine.
- Les surcoûts des embrouilles peuvent dépasser le budget du palier : ils sont pris seulement sur le cash.
- On peut quitter l'onglet en pleine session : on retrouve la cabine en revenant.
- Pas encore : relation avec les invités, featuring avec l'artiste d'un autre joueur, négociation de contrats, tutoriel.

## Étape 4 — négociation des contrats (fait)

- **Recrutement** : le bouton devient « Négocier · ~prix affiché ». Il ouvre la **table de négociation** : la carte de l'artiste, la bulle de son agent, sa **patience** en cœurs (3 à 5) et 6 tours au plus.
- 4 clauses avec des boutons − / + : **avance**, **royalties**, **durée** (6, 12, 18, 24 ou 36 mois), **salaire par semaine**.
- Le **vrai prix est caché** : entre 85 et 120 % du prix affiché. Chaque artiste a **un point bloquant** (avance mini, royalties mini, durée maxi ou salaire mini), révélé la première fois qu'on le casse.
- Réponses de l'agent (note sur 100) :
  - 100 ou plus : **signé** ;
  - 80 à 99 : **contre-offre** (« Il veut … » sous chaque clause, bouton « Accepter sa contre-offre ») ;
  - 60 à 79 : pas content, −1 cœur ;
  - 40 à 59 : vexé, −2 cœurs ;
  - moins de 40 : **il s'en va**, plus de discussion pendant 28 semaines (et −20 points aux discussions suivantes) ;
  - point bloquant cassé : −1 cœur la première fois, −2 ensuite.
  - Plus de cœurs ou 6 tours : on réessaie dans 4 semaines.
- Ce qui compte : avance (45 pts), royalties (35), salaire (10), contrat plus court que voulu (+3 par 6 mois) ou plus long (−5 par 6 mois), réputation du label (de −7 à +17).
- **Renouvellement** : dans l'effectif, bouton « Renouveler le contrat » quand il reste 8 semaines ou moins. Un artiste de mauvaise humeur demande plus, un artiste heureux moins. Un renouvellement signé rallonge le contrat et donne +10 de moral ; une insulte coûte −10 de moral.
- Quand un contrat finit, le rapport de la semaine le dit et l'artiste redevient libre.
- **Pas de triche** : le vrai prix et le point bloquant restent sur le serveur, tirés de la graine du monde. Revenir la même semaine donne le même agent.
- Pas encore : tutoriel, featuring avec l'artiste d'un autre joueur. Toujours pas en ligne ni dans une version publiée.

## Étape 5 — tutoriel (fait)

Version courte, avec ce qui existe déjà (le scouting viendra plus tard). Choix du propriétaire : tout protégé, une bulle simple (pas de mascotte), un bouton « Passer ».

- Démarre pour chaque **nouveau** label. Pas de tutoriel pour un joueur qui revient après une faillite, ni pour les labels déjà créés.
- Une **bulle** en bas à droite dit quoi faire, et un **cadre lumineux** entoure le bouton à cliquer. Le reste de l'écran est assombri, mais on peut toujours cliquer partout.
- Étapes :
  1. **Accueil** : ton cash, la tuile Créer un son, les Charts (3 bulles, bouton Suivant).
  2. **Signer un 2e artiste** : Recrutement → Négocier → faire une offre → accepter la contre-offre. Pendant cette étape, l'agent ne part jamais, même après une insulte.
  3. **Créer un son** : 3 sessions qui roulent et une embrouille facile avec le producteur (le pari réussit toujours). Au featuring, pas d'insulte possible et la roue dit oui au 2e essai au plus tard.
  4. **Programmer la sortie** : Sorties → ton son → semaine et promo → Programmer.
  5. **Aperçu** : streams, fans et argent attendus la première semaine, plus le total offert par le tutoriel. Bouton Terminer.
- **Argent rendu** : tout ce que coûtent ces étapes est rendu, jusqu'à 40 000 € au total. Le salaire par semaine d'un contrat n'est pas rendu.
- **Passer** : le jeu crée un son gratuit avec ton premier artiste et le sort la semaine suivante.
- L'étape est gardée sur le serveur : on reprend où on en était.
- Toujours pas en ligne ni dans une version publiée.

## Étape 6 — featuring entre joueurs (fait)

Choix du propriétaire : accord **avant** le studio, accepter / refuser / autre prix, **cachet seul** (pas de part des streams), bonus **+2 de qualité** quand deux joueurs travaillent ensemble.

- **Recrutement** : deux listes, « Artistes libres » et « Chez les autres joueurs ». Sur un artiste d'un autre joueur : **Proposer un featuring**, avec le cachet à régler par − / + (le départ est le prix qu'il demanderait à un inconnu).
- En haut de Recrutement, le bloc **Featurings entre joueurs** montre les demandes envoyées et reçues.
  - Celui dont c'est le tour peut **accepter**, **refuser** ou proposer **un autre prix**. Le prix fait des allers-retours jusqu'à un oui ou un non.
  - Pas de réponse sous **2 semaines** : c'est non (le rapport de la semaine le dit).
  - On peut annuler sa demande tant que l'autre n'a pas répondu.
- **Oui** : le cachet est payé tout de suite au label de l'invité. L'**accord** reste valable **4 semaines** (non remboursé s'il ne sert pas).
- **Studio** : à l'étape Featuring, l'accord apparaît en premier (« Accord avec … · déjà payé · +2 qualité »). Un clic et l'invité est sur le son, sans roue. Quitter la cabine garde l'accord.
- L'invité dépense **10 d'énergie** quand le son est enregistré (refusé s'il est trop fatigué) et gagne une part des nouveaux fans quand le son sort.
- Une seule demande ouverte par artiste et par label, 10 au plus par label et 300 par serveur (pour rester dans le gratuit).
- Toujours pas en ligne ni dans une version publiée.

## Étape 7 — studio & sorties (fait)

Choix du propriétaire : la note vient des **choix**, pas de l'argent ; c'est la **notoriété** qui rapporte des streams ; l'argent reste équilibré.

- **Liste d'artistes** : la liste du propriétaire (~1000 noms) + ~20 artistes latinos, soit **1152 artistes** et **36 labels**. Nouveaux genres : métal, reggae / dub, jazz / classique. Seuls le nom et le genre viennent de la liste ; fans et niveau sont estimés. Les grands noms sont dans des labels gérés par le jeu (cadenas), les petits sont libres.
- **Studio** : chaque semaine, **5 thèmes et 5 beats au hasard** par artiste. Une **★** marque ce qui va bien avec l'artiste (pas toujours présente). Aucun signe pour les choix risqués.
- **Note** : choix 28 %, artiste 35 %, le reste (thème, beat, producteur, studio payés) compte peu. Payer le max donne +2 à +8 points, pas plus. **Expérience** : notoriété de l'artiste et sons déjà faits (un débutant perd 2 points).
- **Combos cachés** : 10 duos thème + beat secrets par saison (+7). Le duo « parfait » (tout va avec l'artiste) donne +3. Un combo trouvé s'écrit dans le **Carnet** du label (40 au plus).
- **Embrouilles** : on ne voit plus rien avant de choisir sa réaction. Chaque pari ajoute du risque.
- **Surprise** : parfois un son explose (boom, +6 à +16) ou rate (flop). Plus de risque = plus de surprises, dans les deux sens.
- **Révélation** : après le studio, une **fourchette** ; la vraie note seulement à la sortie (elle peut sortir de la fourchette).
- **Tendance du mois** : un genre, un thème, un beat, affichés en bandeau. Coller à la tendance aide les streams.
- **Titre et cover obligatoires** : la cover se choisit comme un média LiveChat (bibliothèque, PC, copiés, Ctrl+V), recadrée en carré, image fixe. Visible par tout le serveur. 600 covers gardées par serveur au plus.
- **Sorties** : 1 son par artiste et 3 par label chaque semaine ; la semaine bloquée est grisée avec la raison.
- **Promo** : Posts, Story, Pub TikTok, Influenceurs, Playlist, Clip YouTube, Clip pro, Affiches. Les **vues** dépendent du buzz (fans, hype) et se découvrent à la sortie. Rarement (~1 sur 30) une vidéo devient **virale**.
- **Sons du jeu** : titres inventés dans la langue de l'artiste, sérieux ou absurdes.
- **Extras** : page du son (cover, note, streams semaine par semaine, promo), case « Seulement les joueurs du serveur » dans les charts, moment « hit » animé.
- Toujours pas en ligne ni dans une version publiée.

## Étape 7 bis — équilibrage après le test du propriétaire (fait)

- **Styles** : 2 styles au plus par artiste (le sien + un autre).
- **Note du son** : elle tourne autour du **niveau de l'artiste**. De bons choix la bougent un peu (+3 à −7). Ce qu'on paie (texte, beat, producteur, studio) **n'augmente pas** la note : ça enlève le risque de rater (le bas de la fourchette remonte). Le haut reste à +5 au-dessus de l'artiste, hors surprise et combo.
- **Streams** : c'est le buzz qui décide. Les fans d'un petit artiste écoutent peu (≈ 0,4 stream par fan à 4 000 fans, 1 à 60 000, 3 pour une star). Un premier son fait **1 000 à 3 000 streams**. La note compte peu (±15 %).
- **Percer sans fans** : 1 chance sur 250, et là le son fait 10 à 40 fois plus de découvertes.
- **Fans** : la moitié des gens qui découvrent le son restent (avant : 2 %, mais sur 5 fois plus de monde). Avec un son gratuit toutes les 2 semaines et un concert par semaine : 3 200 → ~5 000 fans en 24 semaines.
- **Feats** : prix de base doublé, puis multiplié selon l'écart de fans avec ton artiste (jusqu'à ×20). Irko avec un débutant : ~24 000 €. Entre égaux : ~4 000 €. La carte explique pourquoi c'est cher.
- **Sorties** : bilan de la semaine (streams, argent, meilleur son, courbe sur 12 semaines), tri (récents, streams, argent) et filtre par artiste. Sur chaque son : streams et argent au total ; le détail (semaine, coût, bénéfice) est dans la page du son.
- **Effectif** : « ses sons tournent autour de X ».

## Étape 7 ter — recrutement, marché et onglet Label (fait)

- **Début** : on donne juste le nom du label (10 000 € en caisse). Pas d'artiste au départ.
- **Centre de formation** (onglet Recrutement) : 3 jeunes au départ, 12 places. Leur note et leur potentiel sont des fourchettes qui se resserrent avec le temps (« connu à X % »). Ils progressent seuls, moins vite qu'en pro. Pépite rare, visible quand on les connaît assez. On peut les renommer, les libérer, ou les **faire signer** (contrat maison gratuit, 72 semaines).
- **Tutoriel** : après l'accueil, il envoie au centre de formation faire signer un jeune, puis au studio.
- **Recruteur** : 1 gratuit (1 ★). Mission de 2 semaines dans une zone (France gratuit, autres 200 à 400 €), genre au choix. Il ramène 1 à 4 talents ; on a 3 semaines pour les prendre. Chaque semaine, 4 recruteurs à engager (1 à 5 ★, 50 à 3 000 €/semaine), noms rigolos.
- **Marché** : recherche, genre, pays, avance max ; tri note, fans, âge, prix ; favoris ; artistes sous contrat chez un label montrés avec un cadenas (après les libres) ; nouvelles du marché.
- **Vendre** un artiste : dans l'Effectif, pour la moitié de sa valeur (pas pendant le tutoriel ni en studio).
- **Onglet Label** : classement du serveur, fiches des labels (artistes, meilleurs sons), featurings entre joueurs, artistes des autres joueurs. Le classement n'est plus dans Charts.

## Étape 8 — transferts entre joueurs (fait)

- **Offre** : dans l'onglet Label, sur un artiste d'un ami, « Faire une offre de transfert ». Prix libre (même 1 €).
- **Contre-offres** : le vendeur accepte, refuse ou propose un autre prix ; ça repart dans l'autre sens jusqu'à un oui ou un non. 2 semaines pour répondre.
- **Accord des labels** : l'acheteur a ensuite 2 semaines pour **négocier un nouveau contrat** avec l'artiste (même écran que pour un artiste libre). L'argent ne bouge que s'il signe : prix du transfert au vendeur, avance à l'artiste, son ancien contrat s'arrête.
- **Clause de rachat** : dans l'Effectif, le joueur peut mettre un prix sur son artiste. Une offre à ce prix passe sans son accord.
- **Fil de la party** : l'accord et le transfert apparaissent dans les nouvelles du marché, avec le montant.
- **Vente** : on ne peut plus vendre un artiste dans ses 8 premières semaines (sinon un jeune du centre signé gratuitement se revendait tout de suite).
- **Prix du studio selon le palier** : Label Maison paie 15 % des prix, Underground 40 %, ensuite plein tarif. Un son « plume reconnue » + beat exclusif + producteur reconnu + studio pro coûte ~3 000 € au lieu de 20 000 €.

## Étape 9 — interviews, piques et clashs (fait)

Tout est dans l'onglet **Label**. Ce qui se gagne ou se perd : des fans et du buzz, jamais d'argent.

- **Interview de la semaine** (façon FIFA) : un de tes artistes, 3 questions, 3 tons de réponse. Humble : il est content (+moral, +réputation). Sûr de lui : du buzz. Provoc : beaucoup de buzz, mais −2 de réputation, et la phrase part dans les nouvelles du marché. Les questions suivent ce qui se passe (son qui vient de sortir, clash en cours, artiste énervé, label rival).
- **Pique de la semaine** : une phrase à choisir parmi 3, contre le label de ton choix (joueur ou label du jeu). Ton artiste prend du buzz, le leur en perd un peu. 1 fois sur 5, ça se retourne contre toi.
- **Disstrack** : un de tes artistes enregistre gratuitement un son « Clash » contre un label (10 d'énergie). Il sort la semaine suivante, dans tes Sorties et les charts. Le label visé a 2 semaines pour répondre avec son propre disstrack.
- **Résultat** : la semaine après la sortie des deux sons. Compte : la note du son, le buzz de l'artiste, son public, un peu de chance. Le gagnant prend 4 % des fans du perdant (50 000 max) et du buzz ; le perdant perd 3 % de ses fans.
- **Se dégonfler** (refuser ou ne pas répondre) : −3 de réputation et du buzz en moins, et tout le monde le sait.
- **Labels du jeu** : ils répondent 2 fois sur 3, sinon ils se dégonflent.
- **Historique** : victoires et défaites de clash sur la fiche de chaque label. Tout passe dans les nouvelles du marché.

## Étape 10 — EP, albums et tournées (fait)

**Projets** (onglet Sorties, « Monter un projet ») :

- **EP** : 3 à 6 sons d'un même artiste. **Album** : 8 à 16 sons. Au plus 2 sons déjà sortis (les singles annonce), le reste inédit.
- Tous les sons sortent **la même semaine**, 1 à 8 semaines plus tard. Première semaine : +20 % de streams pour un EP, +40 % pour un album.
- Pochette au choix (comme pour un son). Coût du mix et du pressage selon le palier : un EP coûte 300 € au Label Maison, un album 1 200 €.
- La semaine de sortie : une note (moyenne des sons) et une annonce dans les nouvelles du marché. Un album noté 75 ou plus : +3 de réputation.
- **Deluxe** : une fois par album, dans les 10 semaines après sa sortie. 3 à 6 sons inédits en plus, qui sortent la semaine suivante. L'album repart comme en deuxième semaine.

**Tournées** (Effectif, fiche de l'artiste, « Organiser une tournée ») :

- 4 à 20 dates, 2 par semaine. Annoncée 2 semaines avant le départ. Le montage (et le stock de merch) se paie à l'annonce. L'écran montre la salle visée, le public par date et le gain estimé.
- Pendant la tournée : pas de studio, pas de concert seul. Mais chaque semaine du buzz (+3), des fans, de l'argent.
- **Chaque semaine une histoire** : bonne (toute la salle chante, un invité surprise…), mauvaise (embrouille avec la sécu, voix cassée…) ou drôle. Les plus grosses passent dans les nouvelles du marché. Les histoires sensibles (un discours politique sifflé, par exemple) ne touchent que les artistes inventés, jamais les vrais (risque R4).
- **Merch** : 12 % du public achète. Ça rapporte en plus.
- **Tournée commune** : avec un autre de tes artistes, ou celui d'un ami (il doit accepter dans son onglet Label ; son label touche la moitié de l'argent).
- **Première partie** : un de tes artistes ouvre les concerts et gagne des fans.
- Un artiste vendu en tournée : la tournée s'arrête.
