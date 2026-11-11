# 05 — Contrats, marché, paliers, banque, faillite, relations entre labels

## 5.1 Valeur marchande d'un artiste

`Valeur = 20 × revenu hebdomadaire estimé + 5 000 € × 1,08^(GEN − 50) × facteur_potentiel`

- revenu hebdomadaire estimé = moyenne sur 8 ticks des revenus bruts (streams + live + merch) ; pour un artiste sans historique : `fans × 0,012 €`.
- facteur_potentiel = `1 + (milieu de la fourchette de potentiel − GEN) / 100`.

| Profil | GEN | Fans | Valeur |
|---|---|---|---|
| Pépite inconnue | 54 | 3 200 | ~9 000 € |
| Artiste montant | 68 | 100 000 | ~50 000 € |
| Confirmé | 76 | 1 000 000 | ~300 000 € |
| Star nationale | 84 | 10 000 000 | ~2,5 M€ |
| Star mondiale | 92 | 80 000 000 | ~20 M€ |

Cette valeur sert de base à l'avance demandée, aux clauses de rachat, aux prix du marché et au patrimoine du label.

## 5.2 Le contrat

| Clause | Plage | Effet |
|---|---|---|
| Durée | 6 à 36 mois de jeu (24 à 144 ticks) | Fin de contrat → artiste libre |
| Avance | 0 à 150 % de la valeur | Payée tout de suite. À recouper sur ses royalties |
| Allocation hebdomadaire | 0 à 2 % de la valeur par tick | « Salaire fixe ». Compte dans la hiérarchie |
| Taux de royalties | 10 à 50 % | Part de l'artiste sur les revenus des masters |
| Propriété des masters | Label / Artiste (licence) | Licence : le label exploite pendant la durée du contrat + 12 mois, puis perd les sons. L'artiste accepte alors 10 points de royalties en moins |
| Édition (droits d'auteur) | Oui / Non | Oui : +0,0006 € par stream pour le label ; l'artiste demande +5 % d'avance |
| Budget marketing garanti | 0 à 500 000 € par période de 8 ticks | Promesse à tenir |
| Sorties minimum | 0 à 6 par saison | Promesse à tenir (dans les deux sens : si l'artiste refuse de créer, c'est lui qui est en faute) |
| Clause de sortie | Aucune / « si moral < 20 pendant 4 ticks » / « si pas de sortie pendant 12 ticks » | L'artiste peut partir librement |
| Clause de rachat | Aucune ou un montant (au moins 120 % de la valeur) | Un autre label qui paie ce montant emporte l'artiste sans l'accord du label |
| Option de renouvellement | Aucune / +6 mois / +12 mois, aux mêmes conditions | À l'avantage du label |
| Partage live | 50 à 100 % pour l'artiste | Le label garde le reste |
| Partage merch | 30 à 80 % pour l'artiste | Idem |
| Promesse de rôle | Aucune / Espoir / Établi / Tête d'affiche | À tenir, sinon moral −5 par tick |
| Primes | Prime de hit (score ≥ 70), prime de top 10, prime par million de streams | Payées seulement si ça arrive |

## 5.3 Négociation en plusieurs tours

**Acteurs** : le joueur et l'**agent** de l'artiste. L'agent a :
- des **attentes** cachées pour chaque clause (calculées depuis la valeur, les traits, la réputation du label, la concurrence) ;
- **1 ou 2 points bloquants** (🔒), par exemple « les masters restent à l'artiste » ou « statut Tête d'affiche » ;
- une **patience** de 3 à 5 tours.

**Score de l'offre** (ce que l'agent calcule) : chaque clause rapporte des points par rapport à l'attente. L'offre est acceptée si le score total ≥ 100 **et** si aucun point bloquant n'est violé.

| Clause | Points |
|---|---|
| Avance | 30 × (avance / avance attendue) |
| Royalties | 25 × (taux / taux attendu) |
| Allocation | 10 × (allocation / attendue) |
| Rôle promis | +10 par cran au-dessus de l'attente, −15 par cran en dessous |
| Marketing garanti, sorties minimum | 10 × ratio |
| Durée | −5 par tranche de 6 mois au-dessus de ce qu'il veut |
| Primes | Comptées à **70 %** de leur valeur attendue (50 % pour un artiste Anxieux, 90 % pour un artiste confiant) |
| Masters à l'artiste | +15 |
| Réputation du label | + (réputation − 50) × 0,3 |
| Relation / rancune | +5 par point de relation ; −20 en cas de rancune |

**Un tour** :
1. Le joueur règle les clauses et envoie.
2. Réponse de l'agent :

| Score | Réponse |
|---|---|
| ≥ 100, aucun blocage | **Accepté** |
| 80-99 | **Contre-offre** : l'agent modifie 1 à 3 clauses et dit lesquelles comptent le plus |
| 60-79 | Contre-offre sèche, patience −1 |
| 40-59 | « Ce n'est pas sérieux » : patience −2 |
| < 40 | **Vexé** : fin de la négociation, relation −2, **rancune** 28 ticks (ses demandes montent de 20 %), réputation −0,5 |
| Point bloquant violé | « Non négociable » : patience −1, le point est révélé (🔒) |

3. Patience à 0 → l'agent **se lasse** : fin, relation −1, nouvelle tentative possible dans 4 ticks.

**Leviers du joueur** : remplacer du fixe par des primes (moins cher si l'artiste ne perce pas), raccourcir la durée, céder les masters, promettre un rôle, garantir du marketing. Un **juriste** affiche une attente cachée par niveau.

**Concurrence** : si un autre label (joueur ou jeu) négocie avec le même artiste, l'agent le dit (« j'ai une autre offre ») et ses attentes montent de 10 %. Entre deux joueurs, celui qui obtient un « accepté » en premier signe.

**Renouvellement** : possible à partir de 8 ticks avant la fin. Les attentes dépendent du moral (moral > 70 : −10 % ; moral < 40 : +25 % ou refus).

**Exemple de contrat**
> Nova Kalé (valeur 9 200 €). Attentes cachées : avance 2 000 €, royalties 24 %, 18 mois, rôle Espoir, 🔒 « au moins 2 sorties par saison ».
> Tour 1 — offre : avance 500 €, royalties 18 %, 24 mois, pas de rôle, 0 sortie garantie → score 61 + blocage : « non négociable sur les sorties », patience 4 → 3.
> Tour 2 — offre : avance 1 000 €, royalties 20 %, 18 mois, Espoir, 3 sorties par saison, prime de hit 1 000 € → score 94 : contre-offre « avance 1 500 € ».
> Tour 3 — le joueur accepte 1 500 €. **Signé** : 1 500 € d'avance, 20 %, 18 mois, Espoir, 3 sorties par saison, prime de hit 1 000 €, masters au label, clause de rachat 12 000 €.

## 5.4 Marché

Trois listes dans l'onglet Marché :

| Liste | Contenu | Comment signer |
|---|---|---|
| **Artistes libres** | Fin de contrat, pépites repérées, artistes d'un label en faillite | Négociation directe (5.3) |
| **Sous contrat** | Artistes des labels du jeu et des autres joueurs | Offre de transfert au label + négociation avec l'artiste |
| **Liste des transferts** | Artistes mis en vente ou en prêt par leur label | Achat direct, enchère ou prêt |

**Transfert (achat)** :
1. Offre au label propriétaire (montant, éventuellement un artiste en échange).
2. Le propriétaire accepte, refuse ou contre-propose (un joueur a 2 ticks pour répondre ; un label du jeu répond tout de suite : il accepte à partir de 110-140 % de la valeur, selon l'importance de l'artiste chez lui).
3. Puis négociation du contrat avec l'artiste (5.3). S'il refuse, le transfert tombe et rien n'est payé.

**Clause de rachat** : payer la clause saute l'étape 2. L'ancien label reçoit l'argent et une notification. L'artiste doit quand même accepter le nouveau contrat.

**Enchères** : le vendeur fixe un prix de départ et une durée (1 à 3 ticks). Offres visibles de tous dans la party. À la fin, le meilleur offrant négocie avec l'artiste ; s'il échoue, le deuxième a sa chance.

**Prêt d'artiste** : durée de 4 à 14 ticks, frais de prêt, partage des revenus (par défaut 70 % à l'emprunteur). Les sons créés pendant le prêt appartiennent à l'emprunteur. Fans et progression restent à l'artiste.

**Contre-offres et surenchère** : quand deux labels visent le même artiste, le propriétaire voit les deux offres.

**Limites** : effectif limité par le palier (5.5). Un artiste acheté ne peut pas être revendu avant 8 ticks. Un joueur protégé (nouveau, 7 ticks) ne peut pas subir de clause de rachat.

**Prévu après le MVP** (décrit pour mémoire) :
- *Deal de distribution* : un distributeur du jeu verse une avance contre 20 % des revenus de streaming pendant N ticks.
- *Sous-licence* : céder l'exploitation d'un son dans une région contre un montant fixe.
- *Résidence* : un artiste joue chaque tick dans la même salle pendant 4 à 8 ticks, sans usure mais à demande réduite.

## 5.5 Paliers de label

| Palier | Artistes max | Conditions pour y monter | Débloque |
|---|---|---|---|
| **Label Maison** | 5 | Départ | Création de son, concerts isolés, 1 scout, 1 place de formation, prêt classique |
| **Label Underground** | 10 | Réputation ≥ 20, 1 son dans un top 50 de genre, 25 000 fans au total | Tournées, merch, producteur maison, EP et mixtape, enchères |
| **Label Respecté** | 25 | Réputation ≥ 40, 1 son dans le top 100 global, 500 000 fans, 250 000 € de revenus cumulés | Albums et deluxe, scouting des artistes de GEN ≥ 80, prêt sur patrimoine, guerres de labels, festival en tête d'affiche |
| **Label Mainstream** | 50 | Réputation ≥ 60, 3 sons dans le top 10 global, 5 M de fans, 5 M€ de revenus cumulés | Producteurs « légende », radio nationale, sponsors, rachat de labels du jeu en difficulté (après MVP) |
| **Empire** | 100 | Réputation ≥ 80, 1 n°1 global, 50 M de fans, 100 M€ de revenus cumulés | Stades, filiale (un second label spécialisé, après MVP) |
| **Label Divin** | 670 | Réputation ≥ 95, 10 n°1 globaux, 500 M de fans, 2 Md€ de revenus cumulés, 1er de la party pendant 2 saisons d'affilée | Titre unique ; **un seul Label Divin par monde** ; cosmétiques |

- La montée se fait au tick où toutes les conditions sont remplies : événement de party, +5 de moral pour tous les artistes.
- **Pas de descente** de palier, sauf en cas de faillite (remise à zéro).
- Les plafonds et les coûts liés au palier (budget par son, frais fixes, frais de sortie, places de staff) sont dans 02, 03 et 04.

## 5.6 Banque

Trois formules, cumulables. Les remboursements sont prélevés à chaque tick.

| Formule | Montant max | Taux par tick | Durée | Condition |
|---|---|---|---|---|
| **Prêt classique** | Maison 20 000 € ; Underground 100 000 € ; Respecté 500 000 € ; Mainstream 3 M€ ; Empire 20 M€ ; Divin 100 M€ | `1,0 % + (50 − réputation) × 0,01 %` (réputation 10 → 1,4 % ; réputation 90 → 0,6 %) | 8, 16 ou 24 ticks, mensualités fixes | 1 seul à la fois |
| **Prêt sur patrimoine** | 40 % × (valeur du catalogue + 50 % de la valeur des artistes sous contrat) | 0,6 % | 26 ticks | Palier Respecté ou plus. En cas de défaut, la banque saisit des masters |
| **Prêt d'urgence** | Le découvert + 10 % | 3,0 % | À rembourser en 4 ticks | **Automatique** si le cash est négatif au tick. 2 actifs au maximum. Réputation −1 à chaque fois |

- Mensualité du prêt classique : `capital / durée + intérêts sur le capital restant`.
- Remboursement anticipé : possible à tout moment, sans frais.
- Directeur financier : −0,1 point de taux par niveau.
- Exemple : 20 000 € sur 16 ticks à 1,4 % → 1 250 € de capital + 280 € d'intérêts le premier tick, puis dégressif. Coût total ≈ 2 380 €.

## 5.7 Difficulté et faillite

**État « En difficulté »** : au tick, si
- le cash est négatif et aucun prêt d'urgence n'est possible (déjà 2 actifs), **ou**
- les dettes totales dépassent le patrimoine (cash + valeur du catalogue + 50 % de la valeur des artistes).

Tant que l'état dure, un **compteur** monte de 1 par tick. Il redescend de 2 par tick quand le label est sain.

| Compteur | Effet |
|---|---|
| 1 | Alerte rouge sur l'Accueil + notification. Écran « Plan de redressement » |
| 4 | Le staff réclame : moral du label −5. Les artistes de moral < 40 peuvent partir librement |
| 7 | La banque gèle les nouvelles signatures et le marketing au-delà de 1 000 € |
| 12 et 13 | Dernier avertissement (notification à chaque connexion) |
| **14** | **Faillite** |

**Plan de redressement** (actions proposées) : vendre un artiste (un label du jeu rachète tout de suite à 60 % de la valeur), vendre des masters (à 70 % de leur valeur), licencier du staff, annuler une tournée, demander un **renflouement** à un autre joueur (don ou prêt entre joueurs, libre).

**Faillite = game over** :
- Le label est **remis à zéro** : cash, artistes, staff, catalogue, palier.
- Ses artistes deviennent **libres** (les autres joueurs peuvent les signer). Ses masters sont vendus aux enchères dans la party sur 3 ticks (départ à 30 % de la valeur).
- Le joueur garde son **palmarès** (historique, trophées, meilleur classement) et une ligne « Faillite, saison N ».
- Il repart au tick suivant avec un nouveau label : départ standard (30 000 €), **sans** bonus de rattrapage.
- Toute la party est notifiée.

## 5.8 Guerres de labels

Disponibles au palier Respecté (les deux labels doivent y être, sinon seule la guerre de charts est possible). Jamais contre un joueur protégé. Délai : 4 ticks entre deux attaques du même label vers la même cible.

### A. Conférence de presse (descendre un artiste rival)

| Élément | Valeur |
|---|---|
| Coût | 5 000 € × palier |
| Qui parle | Un de tes artistes, ou toi (patron du label, gestion médiatique fixée à 50) |
| Réussite | `40 % + (gestion médiatique − 50) × 0,5 % + 5 % × niveau de l'attaché de presse` |
| Réussite | Cible : hype −8. Ton artiste : hype +4 |
| Échec | Ton label : réputation −2 ; ton artiste : hype −4 |
| Riposte | La cible a 1 tick pour répondre gratuitement (même jet). Riposte réussie : effets annulés et hype +4 pour elle |

### B. Clash sur les réseaux

- Il faut un artiste **Provocateur**, ou de charisme ≥ 70, avec 5 d'énergie. Un Anxieux ne peut pas.
- `score = charisme × 0,4 + gestion médiatique × 0,3 + hype × 0,3 + tirage (0 à 30) + bonus (Provocateur +10, Plume acérée+ +10)`. La cible lance le même jet.

| Résultat | Effet |
|---|---|
| Vainqueur | Hype +10, fans +2 %, ses sons actifs ×1,3 pendant 2 ticks |
| Perdant | Hype −6, moral −5, réputation de son label −1 |
| Bad buzz (20 % pour l'attaquant, 10 % pour la cible ; ×1,5 si Provocateur ; −10 % par niveau du community manager) | Réputation −3, fans −2 %. S'ajoute au résultat |

- **Son de clash** : dans les 2 ticks, chaque camp peut créer un son au thème « Clash » : adéquation +0,2 et hype ×2 à la sortie. Le son le mieux classé relance le clash (deuxième manche).
- Une rivalité est créée (visible sur les deux fiches) : pas de featuring possible entre les deux artistes pendant 14 ticks.

### C. Guerre de charts (duel de sortie)

1. Un label lance un **défi** : un artiste, une semaine (au moins 2 ticks plus tard), un format.
2. Le défié accepte (il choisit son artiste) ou refuse (réputation −2, « a fui le duel »). Pas de pénalité s'il est d'un palier inférieur.
3. Au tick prévu, les deux sorties sont comparées en streams de première semaine. Toute la party voit le duel en direct dans les Charts.

| Résultat | Effet |
|---|---|
| Vainqueur | Hype +8, réputation +1, 10 % des streams de découverte du perdant |
| Perdant | Hype −4 |
| Mise (optionnelle) | Les deux labels misent la même somme ; le vainqueur prend tout |

## 5.9 Coopérations

| Coopération | Fonctionnement | Gain |
|---|---|---|
| **Featuring entre joueurs** | 03, § 3.7. Cachet fixe négocié entre les deux joueurs | Fans croisés, qualité, relation |
| **Tournée commune** | 2 artistes de 2 labels, coûts fixes partagés 50/50, demande = somme des deux × 0,85 | Salles plus grandes, +3 % de fans croisés par date |
| **Prêt d'artiste** | 5.4 | Revenus pour le prêteur, effectif pour l'emprunteur |
| **Co-marketing** | 2 sorties la même semaine, budgets mis en commun, portée totale ×1,3 répartie selon la mise | Pas de malus de concurrence entre elles |
| **Pacte** | Non-agression pendant une saison | Réputation +1 chacun ; le rompre : −5 |
| **Renflouement** | Don ou prêt libre entre joueurs | Sauver un ami de la faillite |

Chaque coopération menée au bout : réputation +1 pour les deux, et relation +1 entre les artistes concernés.

## 5.10 Festivals et événements communs

### Le Festival du Serveur
- **Quand** : tous les 14 ticks (au milieu et à la fin de chaque saison). Annoncé 4 ticks avant à toute la party.
- **Inscription** (3 ticks) : chaque label propose jusqu'à 3 artistes.

| Scène | Places | Frais d'inscription | Attribution |
|---|---|---|---|
| Tête d'affiche | 1 | Enchère (départ 10 000 € × palier moyen de la party) | Meilleure enchère |
| Scène principale | 4 | 3 000 € × palier | Les 4 meilleurs `fans × (1 + hype/100)` parmi les inscrits |
| Scène découverte | 8 | 500 € | Artistes de moins de 100 000 fans ; tirage si trop d'inscrits |

Les places libres sont prises par des artistes des labels du jeu.

- **Performance** (au tick du festival) : `note = performance scénique × 0,5 + hype × 0,2 + énergie × 0,1 + tirage (0 à 20) + bonus Bête de scène`.
- **Retombées** : cachet (tête d'affiche : 30 % de la billetterie simulée ; principale : 8 % ; découverte : 0), fans `+ note / 20 %` (jusqu'à +5 %), hype +5 à +15, superfans +0,2 point. Note < 40 : hype −5.
- **Prix du public** : la meilleure note gagne +3 de réputation pour son label et un trophée.
- Énergie : 15. Un artiste blessé ou en grève déclare forfait (frais perdus, réputation −1).

### Les Trophées (fin de saison, tick 28)
Catégories : Son de la saison (meilleur score de hit), Album de la saison, Révélation (plus forte hausse de fans, parti de moins de 50 000), Artiste de la saison (streams), Clip de la saison, Label de la saison (classement final). Chaque trophée : réputation +2 à +5, hype +10 pour l'artiste, ligne au palmarès. Cérémonie visible par toute la party (écran dédié, 06).

### La Nuit des Charts (tous les 7 ticks)
Semaine spéciale : streams de découverte ×1,5 pour tout le monde. Le n°1 global de cette semaine gagne un disque spécial. Tous les joueurs ont donc intérêt à sortir au même moment : c'est la semaine la plus disputée.

### Appel à projets (aléatoire, environ 1 par saison)
Un événement commun propose une **compilation de la party** : chaque label peut fournir 1 son. Les revenus sont partagés à parts égales, la réputation monte de +1 pour chaque participant, et le meilleur son gagne +5 de hype.
