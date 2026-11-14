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

## Étape 11 — avatars (fait)

Style choisi par le propriétaire parmi 3 maquettes (néon, pixel, silhouette) : **la silhouette**. Une ombre noire devant un soleil de couleur, sans visage.

- **Aucun visage dessiné**, donc aucune ressemblance avec une vraie personne (risque R4). On ne montre que ce qu'on voit de loin : coiffure, chapeau, lunettes, barbe, chaîne, guitare, groupe.
- **Vrais artistes** : 303 ont leur vraie dégaine, écrite à la main dans `packages/melody/src/data/looks.ts` (une ligne par artiste, facile à corriger). Exemples : Daft Punk casqués, Kalash Criminel et Ziak en cagoule, Ariana Grande en queue-de-cheval, Mozart en perruque, SCH cheveux longs et lunettes noires.
- **Les autres** (artistes inventés, jeunes du centre, vrais artistes pas encore écrits) : une dégaine tirée de leur nom et de leur genre. Toujours la même pour le même artiste. Un rappeur drill a souvent une cagoule ou une capuche, un métalleux les cheveux longs, un DJ un casque.
- **Humeur visible** sur tes artistes : une croix rouge de colère quand le moral est sous 35, des « Z » quand l'énergie est sous 25.
- **Où** : toutes les cartes d'artiste (Effectif, studio, marché, négociation, autres joueurs), le centre de formation, les offres de featuring et de transfert, les invitations en tournée, la fiche des labels.
- Rien ne change côté serveur : l'avatar se dessine dans l'appli.

## Étape 12 — saisons (fait)

Choix du propriétaire : saison de **4 vraies semaines** (28 semaines de jeu), **on garde tout** à la fin, **3 objectifs proposés dont 2 à choisir**, et tous les plus (trophées, cérémonie animée, palmarès, coup de pouce au dernier).

- **Objectifs** (Accueil) : chaque label reçoit 3 objectifs adaptés à son palier (un son dans un top, finir sans dette, sortir un EP, finir une tournée, signer un artiste noté 60+…). Il en choisit 2, c'est verrouillé. Sans choix après 4 semaines, le jeu prend les deux premiers. Réussi : +1 à +3 de réputation et du cash (1 000 à 10 000 € × le palier) à la fin de la saison. Raté : rien.
- **Fin de saison** (semaine 28) : classement final (le même calcul que le classement du serveur), puis récompenses. Podium : +3, +2, +1 de réputation. Le dernier reçoit 10 000 € s'il y a au moins 2 labels.
- **Trophées**, entre labels de joueurs : Label de la saison, Son de la saison (meilleur démarrage), Projet de la saison (EP ou album le mieux noté), Artiste de la saison (le plus de streams), Révélation (plus forte hausse de fans, parti de moins de 50 000). Chaque trophée d'artiste : +2 de réputation pour le label, +10 de buzz pour l'artiste.
- **Cérémonie** : à la première ouverture après la fin de saison, un écran en 3 temps (podium, trophées, ton bilan) avec confettis. On peut la revoir depuis l'onglet Label.
- **Palmarès** : sur la fiche de chaque label, sa place et ses trophées saison par saison (12 saisons gardées).
- **Après** : rien n'est remis à zéro sauf les compteurs de saison. De nouveaux objectifs sont proposés tout de suite.
- Un label qui arrive en cours de saison reçoit ses objectifs à son arrivée.

## Étape 13 — staff (fait)

Choix du propriétaire : **les 4 postes essentiels**, embauche **comme les recruteurs** (candidats à étoiles aux noms drôles, liste qui change chaque semaine), **salaire chaque semaine**, et tous les plus (coach attitré, staff qui progresse, débauchage entre amis, petites phrases).

- **Onglet Staff** : 4 postes, une personne chacun. Licencier coûte 2 semaines de salaire. Engager quelqu'un sur un poste déjà pris remplace l'ancien (même prix de départ).
- **Salaires** : 50 à 3 000 € par semaine selon les étoiles, × le palier du label.
- **Coach** : les artistes progressent 10 % plus vite par étoile. Celui qu'il suit de près (au choix) : 30 % par étoile.
- **Producteur maison** : le producteur du studio coûte 20 % de moins par étoile. Gratuit à 5 étoiles.
- **Community manager** : +15 % de vues par étoile sur toutes les promos.
- **Booker** : +5 % de public par étoile en concert et en tournée, et 5 % d'énergie en moins par concert.
- **Progression** : une étoile de plus après une saison (28 semaines) au label, avec un nouveau titre.
- **Débauchage entre amis** : on propose +20 %, +50 % ou +100 % de salaire au staff d'un autre joueur. Son label a 2 semaines pour s'aligner (il garde la personne, plus chère) ou la laisser partir. Sans réponse, elle part. Après une arrivée ou un alignement, personne ne peut la débaucher pendant 4 semaines. Un point rouge sur l'onglet Staff prévient le joueur visé.
- **Petites phrases** : une semaine sur trois environ, quelqu'un du staff dit une bêtise dans le bilan de la semaine.
- Limites (gratuité) : 3 offres en cours par label, 100 par serveur.

## Étape 14 — moral détaillé (fait)

Choix du propriétaire : **rangs automatiques**, les **4 nouvelles causes** de baisse, des conséquences **progressives**, et tous les plus (remonter le moral, onglet Dynamique, leaders, bulles d'humeur).

- **Rangs** (calculés chaque semaine avec la note et les fans) : Tête d'affiche (10 % du haut, au moins 1), Établi (30 %), Espoir (40 %), Développement (le reste). Visibles dans l'Effectif et l'onglet Dynamique.
- **Attentes** : une Tête d'affiche veut un son toutes les 4 semaines, un Établi toutes les 6, un Espoir toutes les 8. Le Développement n'attend rien. Un son programmé suffit à le rassurer.
- **Ce qui fait baisser le moral, chaque semaine** : pas de son à temps (−1), mis de côté plus de 6 semaines sans rien faire (−1, sauf si le coach le suit), injustice de salaire (−3 : un rang plus bas gagne plus de 10 % de plus que lui). **Jalousie** (−4, une fois) : un autre artiste de même rang ou plus bas sort un son avec une promo au moins 3 fois plus grosse que sa dernière (et au moins 3 000 € × le palier). Déjà là avant : flops, fatigue, embrouilles, piques.
- **Ce qui le fait remonter** : tubes, concerts pleins, le coach qui le suit (+1 par semaine). Quand rien ne le dérange, le moral revient d'un point par semaine vers 60 (63 avec un **leader** dans le label : 12 % des artistes le sont, toujours les mêmes).
- **Moral bas, progressif** : sous 40, plus d'embrouilles en studio. Sous 30, il refuse le studio une semaine sur trois environ et **demande à partir** (annoncé dans les nouvelles du marché). Sous 15, **grève** : ni studio, ni concert, ni tournée. Dès 80, de meilleurs sons (déjà là).
- **Remonter le moral** (prix × le palier) : Prime 500 € (+8, toutes les 4 semaines), Voyage d'inspiration 2 000 € (+15 et fin de la page blanche, toutes les 8 semaines), Soirée du label 1 000 € (+5 pour tous, toutes les 4 semaines). **Augmenter** : ajoute juste ce qu'il faut à son allocation pour finir une injustice.
- **Onglet Dynamique** : le moral du label (les têtes d'affiche comptent plus), chaque artiste avec son rang, sa paie garantie, ses attentes, son moral et ses soucis en rouge, et les boutons. Un point rouge sur l'onglet quand un artiste demande à partir ou fait grève. Le bilan prévient une fois quand une injustice commence.
- **Bulles d'humeur** : environ une semaine sur trois, un artiste dit comment il va dans le bilan, selon son plus gros souci.
- Un joueur absent toute une saison : son artiste finit par demander à partir, sans aller jusqu'à la grève.

## Étape 15 — évolution des artistes (fait)

Choix du propriétaire : **profils cachés + hauts et bas**, **une dizaine de talents**, changement de genre **avec transition**, et les plus « bilan des progrès », « courbe de la note » et « envie de changer ». **Pas de traits de caractère.**

- **6 profils cachés** (toujours les mêmes pour un artiste) : Précoce (très vite ses 20 premières semaines, puis lent), Tardif (l'inverse), Régulier, Explosif (des semaines rien, d'autres énorme), Fragile (progresse vite mais perd plus vite), Éclosion tardive (presque rien jusqu'à son 6e son noté 65 ou plus, puis un bond de 4 à 8 points). Le profil se révèle après 8 semaines au label, tout de suite avec un coach 3 étoiles.
- **Perdre ses acquis** : après 6 semaines sans rien faire, −1 sur une compétence toutes les 3 semaines (toutes les 2 si Fragile). Pas si le coach le suit.
- **Repousser ses limites** : 3 sons d'affilée notés au moins 5 points au-dessus de sa note → son plafond monte de 1. 6 fois par saison au plus.
- **10 talents** (0 à 2 par artiste, environ 1 sur 3 n'en a pas) : Refrain contagieux, Bête de scène, Perfectionniste, Machine à tubes, Artiste d'album, Aimant à featurings, Infatigable, Caméléon, Viral, Storyteller. Chacun touche un système qui existe déjà (streams, concerts, studio, albums, featurings). **Niveau +** après 10 sorties ou à 80 de note. Les talents s'affichent sur les cartes (effectif, marché, artistes des potes).
- **Changer de genre** (bouton dans l'Effectif) : 3 000 € × le palier, moitié prix si c'est son envie. 8 semaines un peu moins fort au studio (4 avec un coach ou un producteur maison 3 étoiles, 2 pour un Caméléon +). Fans perdus : 3 % vers un genre voisin, 8 à 20 % vers un genre lointain (moitié avec un community manager 3 étoiles, rien pour un Caméléon +). L'ancien genre reste en second. Après la transition, ses sons du nouveau genre touchent plus de nouveaux auditeurs pendant 8 semaines. Une fois par saison par artiste, 3 par label. Moral −10 si ce n'est pas son idée.
- **Envie de changer** : un artiste créatif avec au moins 6 sorties demande parfois à passer à un autre genre. Oui : moitié prix et moral +10. Non, ou pas de réponse en 4 semaines : moral −5. Un point rouge sur l'onglet Effectif prévient.
- **Bilan des progrès** : une ligne chaque semaine dans le bilan (« Progrès de la semaine : X +1 · Y −1 »).
- **Courbe de la note** : les 28 dernières semaines dans la fiche de l'artiste, avec le gain ou la perte.

## Étape 16 — enchères, prêts et échanges (fait)

Choix du propriétaire : **enchères simples**, **prêt simple**, **les potes + les labels du jeu**, et les plus « alerte dépassé », « échange d'artistes » et « prix de réserve secret ». **Pas de fil de la partie, pas de prix d'achat immédiat, pas d'option d'achat sur un prêt.**

- **Mettre aux enchères** (fiche de l'artiste) : un prix de départ, 1, 2 ou 3 semaines, et un **prix de réserve secret** si on veut. Possible 8 semaines après sa signature, pas pendant le studio, pas s'il est prêté. 2 enchères ouvertes par label, 40 par serveur.
- **Enchérir** (Marché, en haut) : au moins 5 % de plus que la meilleure offre (100 € minimum). Il faut l'argent et une place dans l'effectif. Le vendeur peut annuler tant qu'aucun joueur n'a enchéri.
- **Labels du jeu** : un label du jeu de niveau suffisant enchérit aussi, jusqu'à 55 à 100 % de la valeur de l'artiste (caché). Il monte jusqu'à la réserve s'il en a les moyens. S'il gagne, il paie et l'artiste part chez lui.
- **Alerte dépassé** : dès qu'on est dépassé, une ligne dans le bilan et un point rouge sur l'onglet Marché.
- **Fin de l'enchère** : le gagnant doit ensuite **négocier le contrat** avec l'artiste (comme un transfert). S'il échoue, la meilleure offre suivante a sa chance la semaine d'après. Si personne n'atteint la réserve : « Personne n'a atteint ton prix de réserve », l'artiste reste.
- **Prêter un artiste** (fiche de l'artiste) : 4 à 14 semaines, des frais choisis (un « prix juste » est proposé). Il faut que son contrat dure plus longtemps que le prêt. 3 offres par label, 60 par serveur. Une offre reste 4 semaines au Marché.
- **Pendant le prêt** : le label qui l'emprunte paie les frais, garde **70 %** de ce que l'artiste rapporte (streams, concerts, tournées), les 30 % vont au prêteur. **Les sons faits pendant le prêt restent** au label qui l'emprunte. Son contrat est gelé : pas de vente, d'enchère, de clause, de renouvellement, de changement de genre ni d'augmentation. Une tournée doit finir avant son retour.
- **Labels du jeu** : environ 3 fois sur 10, un label du jeu prend une offre de prêt au prix juste ou moins, et verse aussi 30 %.
- **Retour** : l'artiste rentre à la fin, ou plus tôt si le label qui l'emprunte fait faillite. Si le prêteur a fait faillite, il est libre.
- **Échange d'artistes** : dans une offre de transfert à un pote, on peut ajouter un de ses artistes en plus (ou à la place) de l'argent. Possible 8 semaines après sa signature.

## Étape 17 — embrouilles du studio et sorties ratées (fait)

Choix du propriétaire : **pas de mixtape ni de freestyle** (on garde EP, album et deluxe), **40 embrouilles** au studio, **humour absurde et noir**, des **embrouilles selon la situation**, **une dizaine de bonnes surprises** en plus, et le plus « pas deux fois la même ». Il a aussi demandé que **sortir des sons ratés fasse perdre du buzz**, pour que personne ne spamme des sons chaque semaine.

- **40 embrouilles** (il y en avait 26) : 8 après l'écriture, 8 après le beat, 8 avec le producteur, 8 au studio, 8 avec l'invité. Les nouvelles : le parolier est mort, il veut tout réécrire contre son rival, le beat est maudit, « chez mon ancien label c'était mieux », caprices de tête d'affiche, le producteur en garde à vue, il s'endort dans la cabine, et 7 avec l'invité (couplet en vocal depuis Dubaï, couplet trop fort, couplet raté, bagarre, l'invité veut être en tête, extrait posté sans prévenir, l'invité a disparu).
- **Humour noir** : les cartes les plus noires (mort, malédiction, disparition) ne tombent que sur les artistes inventés, et pour l'invité, que si lui aussi est inventé. Pas de blagues sur des communautés, des personnes réelles ou des attentats.
- **Selon la situation** (et alors 3 fois plus souvent) : fatigué ou moral bas (énergie ou moral sous 40), en clash, prêté par un autre label, tête d'affiche d'un label d'au moins 3 artistes.
- **Pas deux fois la même** : les embrouilles du dernier son du label ne retombent pas au son suivant.
- **15 bonnes surprises** (il y en avait 4), avec une petite phrase : une star passe au studio, refrain écrit aux toilettes, sieste stratégique, le chat sur la console… Même fréquence qu'avant.
- **Buzz pendant la séance** : certaines réactions donnent ou font perdre du buzz, donné à l'artiste quand le son est fini.
- **Sorties ratées** : une sortie est ratée si sa note est sous 50, ou 5 points ou plus sous la moyenne de ses 6 derniers sons. Un EP ou un album compte comme une seule sortie, avec sa note. À la 2e sortie ratée sur ses 4 dernières : buzz −5, 1 % de fans en moins, moral −3. À la 3e : le double, à la 4e : le triple. Une sortie au-dessus de sa moyenne efface tout. Sortir souvent n'est pas puni, seulement les sons ratés.
- **Le label** : si un autre artiste du label a déjà déçu ses fans dans les 4 dernières semaines, la réputation du label baisse de 1 (une fois par semaine au plus).
- Pas d'alerte avant la sortie : le joueur le découvre dans le bilan de la semaine. Seuls les labels des joueurs sont concernés.

## Étape 18 — ventes de CD et vinyles et soutien du label (fait)

Choix du propriétaire : **pas de superfans**, pas de fan club, pas de précommandes, pas de merch toute l'année. **Ventes de CD et vinyles automatiques** à la sortie d'un EP ou d'un album, montant **moyen**, et les plus « disque d'or et de platine », « séance de dédicace » et « ventes dans le bilan ». Il a ajouté une idée à lui : **choisir dans quels artistes le label investit le plus**, devenue ensuite des **rôles**.

- **Combien** : un album d'un artiste à 100 000 fans, note 70, buzz normal, vend environ 670 CD et vinyles à 12 €, soit environ 8 000 €. Un EP vend moitié moins. Une bonne note vend plus (note 90 : ×1,5 ; sous 40 : très peu), le buzz aussi (de ×0,7 à ×1,6), une pochette +10 %.
- **Deluxe** : à sa sortie, il vend un tiers de ce que vendrait l'album.
- **Séance de dédicace** (case à cocher en montant le projet) : +25 % de ventes, l'artiste perd 15 d'énergie la semaine de sortie.
- **Estimation** : en montant le projet, une fourchette « entre X et Y € » selon la note des sons choisis. Le buzz à la sortie peut faire monter le chiffre.
- **Disque d'or** à 2 000 ventes (réputation +2), **disque de platine** à 6 000 (réputation +4), deluxe compris. Un badge sur la carte du projet, une ligne dans le bilan et les news.
- **Bilan** : « N CD et vinyles vendus (+M €) » dans la ligne de sortie du projet. Si l'artiste est prêté, l'argent est partagé 70/30 comme le reste.
- **Rôles dans le label** (onglet Dynamique), à la place des curseurs de soutien (le propriétaire trouvait chiant qu'en boostant un artiste, ça enlève aux autres) : chaque artiste a un rôle, qui donne un bonus sans rien enlever aux autres.
  - **Artiste phare** : promo +25 %, ventes de CD et vinyles +30 % (nommé ainsi car « Tête d'affiche » est déjà un rang).
  - **Pépite** : progresse 25 % plus vite.
  - **Pilier** : moral +1 par semaine, et quand il a le moral (60 ou plus), +1 pour les autres artistes du label.
  - **Artiste libre** : le rôle de base, sans bonus ni malus.
- **Places** : 1 par rôle au palier Maison, une de plus à chaque palier. Un changement de rôle par artiste et par semaine. **Pas de jalousie.**
- **En pleine forme** (idée du propriétaire, comme les cartes spéciales d'un jeu de foot) : après un n°1 du top global ou un disque d'or ou de platine, la carte de l'artiste brille 4 semaines : note +3, promo et ventes +10 %.
- Seuls les labels des joueurs ont des rôles et la pleine forme. Les onglets seront revus à la fin, avant la sortie.

## Étape 19 — prêt sur patrimoine et paliers Mainstream et Empire (fait)

Choix du propriétaire : prêt de **40 %** du patrimoine, durée **au choix 13, 26 ou 52 semaines**, si on ne paie plus **la banque saisit des sons**, avec une **alerte 2 semaines avant**. **Mainstream** : producteurs légende. **Empire** : stades réservés et stars moins chères (**−25 %**). À la montée : **annonce à toute la party, moral +5, écran de fête**. Une **barre par condition** pour le palier suivant. Les plus : **racheter les sons saisis**, **rembourser en avance**, **tableau des 6 paliers**.

- **Prêt sur patrimoine** (Banque, dès le palier Respecté) : jusqu'à 40 % du patrimoine (valeur des sons + moitié de la valeur des artistes), arrondi au millier. 0,6 % d'intérêts par semaine, 13, 26 ou 52 semaines. Un seul à la fois, en plus du prêt classique.
- **Impayé** : si le cash est dans le rouge (ou qu'un prêt d'urgence court encore) alors qu'un prêt sur patrimoine est en cours, alerte dans le bilan et la Banque. 2 semaines après, si rien n'a changé, la banque saisit les sons qui rapportent le plus jusqu'à couvrir la dette. Un son saisi ne rapporte plus rien et ne compte plus dans le catalogue.
- **Rachat** : à la Banque, un son saisi se rachète à sa valeur + 25 % (1 000 € au moins).
- **Rembourser en avance** : chaque type de prêt (classique, patrimoine, urgence) se rembourse d'un coup, sans frais.
- **Producteur légende** (studio, dès Mainstream) : 150 000 €, le plus fort du jeu (niveau 74 contre 68 pour une star de la prod), et moins de risque de rater.
- **Stades** (60 000 places) : réservés à l'Empire, pour les concerts et les tournées.
- **Stars moins chères** : un artiste de plus de 5 M de fans demande 25 % d'avance en moins à un Empire.
- **Montée de palier** : moral +5 pour tous les artistes, « X devient Empire ! » dans les news de toute la party, et un écran de fête avec des confettis.
- **Onglet Label** : « Ton palier » avec une barre par condition (réputation, fans, argent gagné, hits) et le tableau des 6 paliers. Le tableau ne dit que ce qui change vraiment avec le palier (taille des artistes signables, budget par son, prêt, et les nouveautés).

## Étape 20 — événements de label, opportunités et événements du serveur (fait)

Choix du propriétaire : **40 cartes** de vie du label, 2 à 4 réponses, même ton que le studio (absurde et humour noir sur des artistes inventés, jamais de vrais partis ni de vraies personnes). Une carte sans réponse : **au bout de 4 semaines, « ignorer » s'applique**, 3 cartes au plus en attente. **Événements du serveur pour tout le monde, 1 ou 2 par semaine** : plateformes, mode du moment, drôles, argent. Opportunités : **sync** (pub, série, film, jeu vidéo) avec **négociation à 50/50** (+50 % ou perdue), **offres de festival** à un cachet juste, petits plus (**playlist éditoriale, remix officiel, session live filmée**). **Pas de sponsor chaque semaine** : des **marques** paient une promo aux artistes connus.

- **Cartes** (Accueil) : chaque semaine, environ 40 % de chance d'une carte de vie du label, 10 % d'une deuxième, 30 % d'une opportunité. Les montants suivent le palier. Une carte « pari » affiche ce qui se passe si c'est gagné ou raté. Les 4 cartes les plus noires ne tombent que sur des artistes inventés.
- **Sync** : cachet selon les fans et le charisme. Accepter : cachet + streams du son ×2 pendant 2 semaines. Négocier : 50 % de chance d'avoir +50 %, sinon l'offre est perdue.
- **Festival** (artistes de 5 000 fans et plus) : cachet = environ deux concerts, coûte de l'énergie, donne des fans et du buzz.
- **Marques** (artistes de 100 000 fans et plus) : un paiement unique, qui grandit avec les fans.
- **Petits plus** : playlist éditoriale (×1,5 pendant 2 semaines), remix officiel (payant, buzz + ×1,3), session live (fans et buzz).
- **Événements du serveur** : 13 en tout (panne, pluie, playlist géante d'un genre, un genre qui explose 2 semaines, retour des années 2000, danse virale ou astronaute sur un son d'un joueur, boycott des intros, IA qui sature, chat DJ, taxe surprise, bonus culture, dédommagement des plateformes). Ils s'affichent sur l'Accueil et dans les news de toute la party. Un bonus de streams ne compte que pour sa semaine, il ne s'accumule pas.
- Les dernières réponses restent visibles sous les cartes.

## Étape 21 — guerres : conférence de presse et guerre de charts (fait)

Début du MVP 3 (le clash existait déjà, étape des clashs). Choix du propriétaire : la conférence est un **pari**, et **plus ton artiste a de buzz face à la cible, plus ça marche** ; **gratuite, 1 par semaine**, **dès le début** ; parle **un de tes artistes ou toi, le patron**. La guerre de charts se gagne au **plus de streams** la 1re semaine, **pour l'honneur** (pas de mise) : buzz, réputation et fans. Refuser : **honte publique**. **2 semaines pour répondre**. Les plus : **duel en direct dans les Charts**, **riposte à la conférence**, **palmarès des duels**. Seulement entre joueurs.

- **Conférence de presse** (onglet Label) : on vise un artiste d'un autre joueur. Chances = 40 % + (médias − 50) × 0,5 % + (buzz de l'orateur − buzz de la cible) × 0,6 % + 5 % par étoile du community manager, entre 10 et 85 %. Le patron parle comme un artiste à 50 en médias et sans buzz. Les chances de chaque orateur s'affichent. Réussi : cible buzz −8, orateur buzz +4. Raté : réputation −2, orateur buzz −4.
- **Riposte** : le label visé peut répondre gratuitement la semaine même ou la suivante, une fois. Réussie : l'effet est annulé et la cible gagne 4 de buzz.
- **Guerre de charts** (onglet Label) : on choisit un joueur, son artiste et une semaine (dans 3 à 8 semaines). L'autre accepte avec son artiste ou refuse. Sans réponse en 2 semaines, c'est un refus. Refuser : réputation −2 et « X a fui le duel » dans les news, sauf si celui qui défie est d'un palier plus haut.
- **Le jour du duel** : on compare le meilleur son de chaque artiste sorti cette semaine-là. Gagnant : buzz +8, réputation +1, et il prend 10 % des nouveaux fans du son perdant. Perdant : buzz −4. Si un seul a sorti un son, il gagne ; si aucun, match nul. 3 duels en cours au plus, un seul avec le même label.
- **Charts** : les duels acceptés et finis s'affichent en haut, avec une barre des streams des deux sons. **Fiche du label** : duels gagnés, perdus, fuis.

## Étape 22 — coopérations : alliés, ennemis et renflouement (fait)

Choix du propriétaire : **pas de co-marketing, pas de pacte**. À la place, son idée : **2 alliés et 2 ennemis au plus** par label. Une **alliance se fait à deux** ; un **ennemi se déclare seul**. Entre joueurs, **on n'attaque que ses ennemis**, avec **25 % d'effet en plus** ; les labels du jeu restent libres. Entre alliés : **pas d'attaque**, un **featuring meilleur**, **pas de honte sur un retard de prêt**, une **alerte quand l'allié est en danger**. On change **une fois par saison**. **Renflouement** : don ou prêt, **sans limite**, **taux au choix (0, 5 ou 10 %)**, remboursé **un peu chaque semaine** ; un retard est reporté avec **réputation −1**. Les plus : « X vient au secours de Y » dans les news, alerte.

- **Onglet Label, « Alliés et ennemis »** : proposer une alliance (l'autre a 2 semaines pour accepter), déclarer un ennemi, voir qui t'a déclaré la guerre. Remplir une place libre est toujours possible ; lâcher un allié ou faire la paix, une fois par saison. Toute la party voit les alliances, les ruptures et les déclarations de guerre dans les news. La fiche de chaque label montre ses alliés et ennemis.
- **Attaques** : la pique, le disstrack, la conférence de presse et le duel de charts ne visent que les ennemis déclarés parmi les joueurs (les listes ne montrent qu'eux). Un label attaqué peut toujours répondre (disstrack, riposte, duel). Contre un ennemi (dans un sens ou l'autre) : +25 % de buzz, de fans pris et d'effet.
- **Alliés** : un featuring avec l'artiste d'un label allié donne +2 de qualité et ×1,5 de fans croisés. Un retard de remboursement entre alliés ne coûte pas de réputation. Quand un allié passe dans le rouge, tu reçois une alerte (puis toutes les 4 semaines s'il y reste).
- **Aider un joueur** : donner une somme, ou proposer un prêt (taux 0, 5 ou 10 %, sur 4, 8 ou 12 semaines). L'autre accepte ou refuse sous 2 semaines. Chaque semaine, la même part est prise sur son cash. S'il n'a pas assez, c'est reporté, il perd 1 de réputation (sauf entre alliés) et le prêteur est prévenu. Si l'aidé est en danger, « X vient au secours de Y » dans les news.

## Étape 23 — Festival du Serveur (fait)

Choix du propriétaire : le festival a lieu **chaque mois de jeu (toutes les 7 semaines)**, avec **3 scènes**. La tête d'affiche se gagne aux **enchères visibles**, **3 artistes au plus par label**, et un **forfait coûte une petite honte**. Les plus : **affiche sur l'Accueil**, **résultats en direct**, **Prix du public = trophée**, **mauvais concert = buzz −5**. **Pas de Nuit des Charts, pas de compilation.** Les trophées de fin de saison existaient déjà (Étape 17).

- **Inscriptions** : elles ouvrent 4 semaines avant (news pour toute la party), dans l'onglet Label.
  - **Scène principale** : 3 000 € × palier. Les 4 plus gros inscrits jouent (fans × (1 + buzz/100)).
  - **Scène découverte** : 500 €, pour moins de 100 000 fans. 8 places, tirage au sort s'il y a trop d'inscrits.
  - Un inscrit pas retenu récupère son argent. On peut retirer un artiste avant le jour J.
- **Tête d'affiche** : enchère visible, départ à 10 000 € × palier moyen des joueurs, hausse mini 5 %. L'argent de la meilleure offre est bloqué ; il est rendu, avec une alerte, quand quelqu'un surenchérit.
- **Places vides** : prises par les artistes des labels du jeu.
- **Le jour J** : note = scène × 0,5 + buzz × 0,2 + énergie × 0,1 + tirage (0 à 20) + 5 par niveau de Bête de scène.
  - Cachet : 30 % (tête d'affiche) ou 8 % (principale) de la billetterie, mais au plus 0,5 € ou 0,2 € par fan de l'artiste.
  - Fans : jusqu'à 5 % des siens, plus une part du public.
  - Buzz : +5 à +15. Sous 40, buzz −5 et une news moqueuse.
  - Énergie −15.
- **Forfait** : un artiste en grève, sous 20 d'énergie ou parti du label annule. Il perd l'inscription, le label perd 1 de réputation, et la news « X a annulé » part.
- **Prix du public** : il va au meilleur artiste d'un joueur. Son label gagne +3 de réputation, et la fiche du label compte ses prix.
- **Accueil** : l'affiche du festival à venir (tête d'affiche, scène principale, découverte). Ensuite, pendant 2 semaines, les résultats tombent un par un (découverte, principale, tête d'affiche), puis le Prix du public s'allume. Un bouton permet de revoir.
