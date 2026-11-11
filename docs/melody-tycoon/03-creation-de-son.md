# 03 — Création de son (cœur du jeu)

## 3.1 Vue d'ensemble

```
Artiste ─► Thème ─► Beat ─► Producteur ─► Studio ─► Featuring ─► Bilan du son
  (0 €)   choix 1  choix 2    choix 3     choix 4    choix 5      (figé)
             │        │          │           │          │
          événement événement événement  événement  événement
```

- L'artiste est obligatoire et gratuit. Les 5 choix suivants sont payants (chacun a une option gratuite ou optionnelle).
- **Après chaque choix, un événement** : fluide (bonus) ou embrouille (2 ou 3 réactions).
- Pendant tout le parcours, un bandeau montre : **budget dépensé / budget fixé**, **fourchette de qualité estimée**, **énergie qui sera consommée**, **délai**.
- À la fin, le son est **figé** : pas de retouche. Il part dans le coffre du label (« sons prêts ») en attendant une sortie (04).
- Toute la création se joue en une fois, en 2 à 4 minutes. Le serveur valide chaque étape (argent, tirages).

## 3.2 Avant de commencer : artiste et budget

1. Choisir un **artiste** : il faut au moins 10 d'énergie, pas de page blanche, pas de grève, pas en tournée ce tick.
2. Fixer un **budget global** du son avec un curseur, de 0 € à `min(cash disponible, plafond du palier)`.

| Palier | Plafond de budget par son |
|---|---|
| Label Maison | 15 000 € |
| Underground | 60 000 € |
| Respecté | 250 000 € |
| Mainstream | 1 000 000 € |
| Empire | 5 000 000 € |
| Divin | Sans plafond |

**Règle prix + budget** : une option est disponible seulement si `prix ≤ budget restant` **et** `prix ≤ cash`. Sinon elle est **grisée**, avec la raison (« budget dépassé » ou « trésorerie insuffisante »).

- Le budget se **rallonge une seule fois** en cours de route (+50 % max), au prix de −3 de moral (« le label improvise »).
- Les surcoûts des embrouilles peuvent dépasser le budget : ils sont pris sur le cash. Si le cash ne suffit pas, la réaction « payer » est grisée.
- Le budget non dépensé est rendu à la fin.

## 3.3 Les 4 niveaux de chaque choix

Chaque choix a 4 niveaux. Le niveau 1 est toujours la **débrouille** (gratuit, qualité plafonnée). Un choix « coûteux » = niveau 3 ou 4 (ça compte pour l'énergie).

### Choix 1 — Thème

Le joueur choisit **un thème** dans la liste (08), puis **comment il est écrit** :

| Niveau | Nom | Prix | Valeur T (0-100) | Risque d'embrouille |
|---|---|---|---|---|
| 1 | Écriture libre (l'artiste seul) | 0 € | = Écriture de l'artiste | 20 % |
| 2 | Séance d'écriture | 600 € | max(Écriture, 60) | 15 % |
| 3 | Co-auteur | 3 500 € | max(Écriture, 72) | 12 % |
| 4 | Plume star | 20 000 € | max(Écriture, 86) | 10 % |

Le thème joue sur la **cohérence** avec le beat (08) et sur l'**adéquation** au public (tendances, saison).

### Choix 2 — Type de beat

Le joueur choisit **un type de beat** (liste de 24 dans 08), puis **sa provenance** :

| Niveau | Nom | Prix | Valeur B | Risque |
|---|---|---|---|---|
| 1 | Banque de beats gratuite | 0 € | 45 | 20 %, dont « sample refusé » |
| 2 | Lease (location) | 400 € | 60 | 12 % |
| 3 | Beat exclusif | 3 000 € | 72 | 8 % |
| 4 | Sur mesure | +50 % du prix du producteur choisi à l'étape suivante | P_prod + 5 (max 99) | 6 % |

Avec « Sur mesure », le prix exact s'affiche après le choix du producteur ; le jeu réserve d'abord une estimation dans le budget.

### Choix 3 — Producteur

Le jeu propose **6 producteurs** tirés dans le vivier du monde (ils se renouvellent tous les 4 ticks) + le producteur maison s'il existe + la débrouille.

| Niveau | Nom | Prix | Niveau du producteur | Fiabilité |
|---|---|---|---|---|
| 1 | Pote qui fait des prods | 0 € | 30-40 | 50-70 |
| 2 | Beatmaker local | 500 à 1 500 € | 45-60 | 55-85 |
| 3 | Producteur confirmé | 3 000 à 8 000 € | 60-76 | 60-90 |
| 4 | Producteur star | 20 000 à 60 000 € | 76-90 | 50-95 |
| 4+ | Légende (palier Mainstream ou plus) | 100 000 à 400 000 € | 90-97 | 40-90 |

Chaque producteur a :
- un **niveau** ;
- des **affinités de beat** : jusqu'à 2 beats en A, 2 en B, 3 en C ; le reste = aucune ;
- une **fiabilité** (0-100) ;
- une **relation** avec le label (−3 à +3), qui bouge selon la façon dont on gère les embrouilles.

**Impact double** :
- Bonus de qualité : `P_prod = niveau × affinité` (A = 1,00 ; B = 0,85 ; C = 0,70 ; aucune = 0,55).
- Risque : `chance d'embrouille = 35 % − fiabilité × 0,3 − relation × 3 %` (min 3 %). Les embrouilles de producteur sont : refus, retard, conflit (cartes dans 08).

### Choix 4 — Studio

| Niveau | Nom | Prix | Valeur S | Bonus direct | Risque technique | Délai |
|---|---|---|---|---|---|---|
| 1 | Home Studio | 0 € | 40 | — | 25 % | Aucun |
| 2 | Studio de quartier | 1 500 € | 58 | — | 15 % | Aucun |
| 3 | Studio pro | 8 000 € | 74 | Fourchette resserrée de 1 | 8 % | +1 tick (mixage) |
| 4 | Studio prestige | 40 000 € | 88 | Fourchette resserrée de 2, moral +3 | 4 % (mais surcoûts ×3) | +1 tick |

« Délai +1 tick » : le son ne peut pas sortir au tick suivant, seulement à celui d'après.

### Choix 5 — Featuring (optionnel)

Le joueur peut passer. Sinon, il choisit un invité : un artiste d'un autre label (joueur ou géré par le jeu), un artiste libre, ou un artiste de son propre label (gratuit, mais ça coûte de l'énergie aux deux). Voir 3.7.

## 3.4 Énergie

`coût = 10 + 5 × (nombre de choix de niveau 3 ou 4 parmi thème, beat, producteur, studio) + 5 si featuring`

| Cas | Coût |
|---|---|
| Tout en débrouille | 10 |
| 2 choix coûteux | 20 |
| 4 choix coûteux + featuring | 35 |

Modificateurs : profil Lazy +5, Oiseau de nuit ±5, Perfectionniste+ +5, événement « nuit blanche » +5.

- L'énergie est dépensée **au premier choix validé**. Abandonner en route ne la rend pas.
- Il faut avoir le coût complet. Sinon le jeu propose de descendre un niveau ou de passer en débrouille.
- L'invité d'un featuring dépense 10 d'énergie (s'il appartient à un joueur).
- Énergie de départ < 30 : qualité −4 (« pas dans son assiette »).

## 3.5 Débrouille et randomisation

**Quand** : le joueur clique « Débrouille » sur un choix, ou une embrouille l'y force (« le producteur claque la porte »).

**Ce qui se passe** : le jeu **tire au sort** parmi les options de niveau 1 et 2 que le label peut payer (2 chances sur 3 pour le niveau 1). Une petite animation de tirage montre le résultat. Pour le thème et le beat, le **style lui-même** est aussi tiré au sort parmi ceux compatibles avec l'artiste.

**Coût de la débrouille** (pas d'annulation gratuite) :
- qualité −3 par choix randomisé ;
- fourchette élargie de 3 par choix randomisé ;
- réputation −0,5 si le label a une réputation > 30 (un label installé qui bricole, ça se sait) ; rien en dessous ;
- énergie consommée normalement.

**Plafond de qualité** selon le nombre de choix de niveau 1 (parmi les 4) :

| Choix de niveau 1 | Qualité maximale |
|---|---|
| 0 ou 1 | 99 |
| 2 | 78 |
| 3 | 68 |
| 4 | 62 |

Un label fauché peut donc sortir des sons corrects (45-62) gratuitement et grandir. Mais un tube demande d'investir.

## 3.6 Les événements entre chaque étape

Après chaque choix validé, le serveur tire : **fluide** ou **embrouille**.

`chance d'embrouille = risque de l'option + modificateurs`, bornée entre 3 % et 60 %.

| Modificateur | Effet |
|---|---|
| Discipline de l'artiste | −(discipline − 50) × 0,2 % |
| Moral < 40 | +15 % |
| Fatigue créative > 70 | +10 % |
| Directeur artistique | −3 % par niveau |
| Trait Fêtard / Perfectionniste | +8 % / −5 % |
| Embrouille déjà subie sur ce son | −10 % par embrouille (pas d'acharnement) |
| Deuxième embrouille mal gérée d'affilée | +10 % |

**Fluide** — un bonus au hasard :

| Bonus | Effet |
|---|---|
| « Ça coule tout seul » | Qualité +2 |
| « Session express » | Délai −1 tick (sinon énergie rendue : +3) |
| « Bonne ambiance » | Moral +5 |
| « Coup de génie » (5 % des fluides) | Qualité +5, et le son a +2 % de chance d'être viral |

**Embrouille** — une carte avec 2 ou 3 réactions. Chaque réaction touche le coût, la qualité, le temps, le moral ou le risque. Archétypes de réaction :

| Réaction | Tendance |
|---|---|
| **Payer plus** | Sûr, cher. Règle le problème, relation +1 |
| **Recadrer** | Gratuit. Jet sur la discipline (artiste) ou la fiabilité (producteur) : réussite = réglé ; échec = moral −8 ou relation −1, qualité −3 |
| **Changer d'approche** | Change l'élément (souvent en randomisé) : qualité −3, mais peut ouvrir un bon tirage |
| **Ignorer** | Gratuit et rapide. Qualité −2 à −6, ou risque reporté sur l'étape suivante (+10 %) |

Exemples complets (la liste des 40 cartes est dans 08) :

**« Le producteur ne répond plus »** (après le choix 3)
| Réaction | Effet |
|---|---|
| Payer une rallonge (+30 % de son prix) | Il revient. Relation +1 |
| Lui mettre la pression | Jet sur la fiabilité : réussite → il revient, relation −1 ; échec → il part, le producteur est **randomisé** et l'acompte de 50 % est perdu |
| Attendre | Délai +1 tick, qualité inchangée, moral de l'artiste −3 |

**« L'artiste veut changer de thème »** (après le choix 1)
| Réaction | Effet |
|---|---|
| Accepter son thème | Le thème change (c'est lui qui choisit), moral +6, cohérence à recalculer |
| Recadrer | Jet sur la discipline : réussite → rien ; échec → moral −8, qualité −3 |
| Compromis : payer un co-auteur (+1 500 €) | Thème gardé, T passe au niveau 3 si c'était en dessous |

**« Le sample est refusé »** (après le choix 2, surtout avec la banque gratuite)
| Réaction | Effet |
|---|---|
| Payer les droits (500 € à 15 % du budget) | Rien d'autre |
| Refaire le beat sans le sample | Qualité −3, délai +0 |
| Sortir quand même | Qualité inchangée, mais 25 % de risque de **procès** après la sortie (06) |

**« Panne au studio »** (après le choix 4)
| Réaction | Effet |
|---|---|
| Louer une autre cabine (+25 % du prix du studio, ×3 en prestige) | Rien d'autre |
| Finir en Home Studio | S retombe à 40 pour ce son |
| Revenir demain | Délai +1 tick |

**« L'invité demande plus »** (après le choix 5)
| Réaction | Effet |
|---|---|
| Payer +20 % | Featuring gardé, relation +1 |
| Refuser | 50 % il reste (relation −1), 50 % il part : featuring annulé, cachet rendu à 50 % |
| Proposer un échange (un featuring retour gratuit) | Gratuit maintenant ; dette de featuring à honorer dans les 8 ticks, sinon réputation −2 |

## 3.7 Featuring : négociation façon « gambling »

**Prix demandé** par l'invité :

`demande = 2 000 € × (fans_invité / 100 000)^0,7 × (1 + hype_invité / 100) × (1 − 0,1 × relation)`

| Invité | Fans | Hype | Demande |
|---|---|---|---|
| Petit artiste | 20 000 | 20 | ~800 € |
| Artiste confirmé | 1 000 000 | 40 | ~14 000 € |
| Star nationale | 8 000 000 | 60 | ~69 000 € |
| Star mondiale | 80 000 000 | 80 | ~390 000 € |

**Déroulé** :
1. Le joueur voit la demande et règle un **curseur d'offre** (de 30 % à 150 % de la demande).
2. Le jeu affiche en direct la **chance d'acceptation** :

`chance = 50 % + 120 % × (offre/demande − 1) + 5 % × relation + (réputation_label − 50) × 0,3 % + bonus`

bornée entre 5 % et 95 %. Bonus : même genre +5 %, artiste du label mieux classé que l'invité dans les charts +5 %, invité avec le trait Fier −10 %.

3. Le joueur lance la **roue** (animation : une aiguille tourne sur un cadran vert/rouge, la part verte = la chance). Suspense de 2-3 secondes.
4. Résultat :

| Résultat | Effet |
|---|---|
| Accepté | Cachet payé. Featuring confirmé |
| Refusé (offre ≥ 60 % de la demande) | La demande monte de +10 %. Nouvelle tentative possible (3 max par son) |
| Refusé (offre < 60 %) | **Vexé** : relation −2, pas de nouvelle tentative sur ce son |
| Offre < 40 % | Vexé sans même lancer la roue : relation −3 et **rancune** (voir ci-dessous) |

- **Rancune** : pendant 28 ticks, cet artiste refuse tout featuring avec le label et ses demandes de contrat montent de 20 %. Visible dans sa fiche (icône).
- **Relation** (−3 à +3) par paire label–artiste : +1 par featuring réussi, +1 si le son fait un score de hit ≥ 60.
- **Invité appartenant à un autre joueur** : pas de roue. La demande part chez le propriétaire, qui accepte, refuse ou contre-propose (réponse sous 2 ticks, sinon refus automatique, et le son continue sans featuring). Le cachet va au label propriétaire ; son artiste touche sa part de royalties dessus.

**Effet du featuring sur le son** :
- Qualité : `+ (GEN_invité − C_art) / 10`, borné entre −2 et +6.
- Fans utilisés pour les streams : fans de l'artiste + 50 % des fans de l'invité (04).
- Adéquation : +0,05 si l'invité apporte un genre ou une région que l'artiste n'a pas.
- Fans croisés : 2 % des fans de l'invité qui écoutent deviennent fans de l'artiste (une fois).

## 3.8 Qualité : formule

**Centre de la fourchette** :

`Q = 0,35 × C_art × affinité + 0,20 × P_prod + 0,15 × T + 0,10 × B + 0,10 × S + 0,10 × Cohérence`

| Terme | Source | Plage |
|---|---|---|
| C_art × affinité | Compétence artistique × affinité avec le genre du beat (02) | 20-105 |
| P_prod | Niveau du producteur × affinité avec le beat | 16-97 |
| T | Écriture du thème (choix 1) | 20-99 |
| B | Provenance du beat (choix 2) | 45-99 |
| S | Studio (choix 4) | 40-88 |
| Cohérence | Table thème × beat (08) | 30-100 |

**Modificateurs** (ajoutés au centre) :

| Source | Effet |
|---|---|
| Moral | (moral − 50) / 10 → −5 à +5 |
| Énergie de départ < 30 | −4 |
| Fatigue créative > 70 | −3 |
| Featuring | −2 à +6 |
| Événements fluides | +2 ou +5 |
| Embrouilles | −2 à −6 selon la réaction |
| Choix randomisés | −3 chacun |
| Compétences signature | Selon la carte (08) |

**Largeur de la fourchette** (±w) :

`w = 6 + 3 × (choix randomisés) − (niveau du directeur artistique) − (bonus studio) − (Perfectionniste : 3 ou 5)`, minimum 2.

**Affichage** : après chaque choix, le joueur voit `[Q − w ; Q + w]` avec ce qu'on sait déjà (les étapes pas encore faites sont comptées au niveau 1).

**Note finale** = `Q + tirage uniforme dans [−w ; +w]`, puis plafond de débrouille (3.5), puis bornage entre 1 et 99.

**Lecture de la note** :

| Note | Mot affiché |
|---|---|
| < 40 | Raté |
| 40-54 | Passable |
| 55-64 | Correct |
| 65-74 | Bon |
| 75-84 | Très bon |
| 85-92 | Tube en puissance |
| 93+ | Classique |

## 3.9 Exemples chiffrés

**A. Débutant, tout en débrouille** — artiste C_art 50, affinité 1,0, écriture 52.
Pote qui fait des prods (35, affinité B → 30), banque gratuite (45), Home Studio (40), cohérence 80.
`Q = 17,5 + 6,0 + 7,8 + 4,5 + 4,0 + 8,0 = 47,8` → fourchette 42-54 (w = 6). Plafond 62. Coût : 0 €, 10 d'énergie.

**B. Label Underground, son soigné** — C_art 70, affinité 1,05, moral 70.
Co-auteur (72), beat exclusif (72), producteur confirmé (70, affinité A → 70), studio pro (74), cohérence 90.
`Q = 25,7 + 14,0 + 10,8 + 7,2 + 7,4 + 9,0 = 74,1`, moral +2 → **76,1**. w = 6 − 1 (studio) − 1 (DA niveau 1) = 4 → fourchette 72-80.
Coût : 3 500 + 3 000 + 5 000 + 8 000 = **19 500 €**, 30 d'énergie, délai +1 tick.

**C. Empire, tout au maximum** — C_art 90, affinité 1,10, moral 85.
Plume star (90, car son écriture est 90), sur mesure (99), légende (95, A), prestige (88), cohérence 95, featuring d'une star (+4).
`Q = 34,7 + 19,0 + 13,5 + 9,9 + 8,8 + 9,5 = 95,4`, moral +3,5, featuring +4 → borné à 99. Fourchette 95-99.
Coût : 20 000 + 150 000 (sur mesure) + 300 000 + 40 000 + 390 000 = **900 000 €**.

**D. Son complet avec embrouilles (exemple « un son »)**
> Artiste : Nova Kalé (C_art 59, rap FR 1,05, écriture 61, moral 62, énergie 78). Budget fixé : 4 000 €.
> 1. Thème : **Rupture**, séance d'écriture (600 €). T = 61. → *Fluide : « Bonne ambiance », moral +5.*
> 2. Beat : **lovetrap**, lease (400 €). B = 60. Cohérence Rupture × lovetrap = 95. → *Fluide : « Ça coule tout seul », +2.*
> 3. Producteur : beatmaker local « Dz Minuit » (niveau 55, lovetrap en A, fiabilité 60), 900 €. → ***Embrouille : il ne répond plus.*** *Le joueur paie la rallonge (+270 €).*
> 4. Studio de quartier (1 500 €). S = 58. → *Fluide : énergie +3.*
> 5. Featuring : passé.
> Centre : `0,35 × 59 × 1,05 + 0,20 × 55 + 0,15 × 61 + 0,10 × 60 + 0,10 × 58 + 0,10 × 95 = 21,7 + 11,0 + 9,2 + 6,0 + 5,8 + 9,5 = 63,2` ; moral (67) +1,7 ; fluide +2 → **66,9**. w = 6 → fourchette **61-73**.
> Tirage : +1,4 → note finale **68 (Bon)**. Dépensé : 3 670 € sur 4 000. Énergie : −10 (aucun choix coûteux), +3.

## 3.10 Formats de sortie

Un son produit va dans le coffre. Il sort ensuite dans un **projet** :

| Format | Sons | Frais de sortie | Délai mini entre 2 sorties du même artiste | Particularité |
|---|---|---|---|---|
| Freestyle / snippet | 1 (créé en mode rapide) | 0 € | 1 tick | Création en 2 choix seulement (thème + beat), énergie 5, qualité plafonnée à 70. Pas de classement au chart global. Hype +2 à +6. Streams ×0,4 |
| Single | 1 | 0 € | 2 ticks | Le plus simple |
| EP | 3 à 6 | 2 000 € × palier | 6 ticks | Fans : +20 % de streams par piste la 1re semaine |
| Mixtape | 6 à 12 | 3 000 € × palier | 8 ticks | Qualité moyenne perçue +3 (les fans pardonnent), hype +, revenus de sync −50 % |
| Album | 8 à 16 | 8 000 € × palier | 14 ticks | Fans : +40 % de streams par piste la 1re semaine, réputation + si moyenne ≥ 75, éligible aux trophées |
| Deluxe | +3 à 6 sons sur un album sorti depuis moins de 10 ticks | 3 000 € × palier | — | Relance l'album : la décroissance repart de la semaine 2. Un seul deluxe par album |

`palier` = 1 (Maison) à 6 (Divin) : les coûts grandissent avec le label.

- **Singles avant projet** : un son déjà sorti en single peut être mis dans un EP ou un album (2 max par projet). Il sert de « single annonce » : +10 % de portée pour le projet par single ayant un score de hit ≥ 50.
- **Note du projet** = moyenne des 60 % meilleurs sons + bonus de cohésion (+3 si 70 % des pistes ou plus partagent la même famille de beat).
- **Remplissage** : chaque son du projet noté sous 50 retire 1 point à la note du projet.
- Un son resté plus de 20 ticks dans le coffre perd 1 point d'adéquation par tick (il se démode).

Le marketing, la date de sortie et le calcul des résultats sont dans 04.
