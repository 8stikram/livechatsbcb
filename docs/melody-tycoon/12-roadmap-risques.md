# 12 — Roadmap MVP, risques, questions ouvertes

## 12.1 Principe

On livre d'abord **le cœur qui fait revenir** : créer un son → le sortir → voir les charts le lendemain → comparer avec les amis. Tout le reste s'ajoute par couches, chacune jouable et publiable.

## 12.2 Étapes

### Étape 0 — Fondations (invisible pour le joueur)
| Contenu | Détail |
|---|---|
| Monde par serveur | Objet `MelodyWorld`, base, tick par alarme, mise en veille |
| Données | Paquet `melody-data` : genres, beats, thèmes, cartes, réglages ; catalogue de départ (l'échantillon de ~200 artistes suffit pour tester) |
| **Simulateur d'équilibre** | Un script qui fait jouer 4 labels automatiques pendant 3 saisons en quelques secondes, et sort les courbes (cash, fans, paliers). Indispensable pour régler les chiffres avant que quelqu'un joue |
| Carte dans l'onglet Jeux | Entrée, création du label |

### MVP 1 — « Mon label sort des sons »
**On garde** :
- Création du label, 1 artiste de départ, tutoriel complet.
- **Création de son complète** : 5 choix, 4 niveaux, budget, débrouille, événements entre les étapes (20 cartes sur 40), fourchette, note figée, énergie.
- **Featuring avec la roue**, seulement avec les artistes du jeu.
- Formats : single, freestyle, EP.
- Marketing : réseaux sociaux, affiches, playlists, clip.
- Tick : streams, hype, fans, charts (global, genres, party), labels du jeu simulés, tendances.
- Contrats simples : négociation en plusieurs tours avec 6 clauses (durée, avance, royalties, rôle, sorties minimum, prime de hit).
- Scouting (1 poste de staff : scout), démos avec feedback, artistes libres.
- Concerts isolés (bars, clubs, salles).
- Finances : compte de résultat, prêt classique, prêt d'urgence, **faillite**.
- Paliers Maison → Respecté.
- Accueil, Effectif, Recrutement, Studio, Sorties, Charts, Finances, Paramètres.
- Notifications dans le jeu, résumé « pendant ton absence ».
- Classement de la party en direct.

**On coupe pour plus tard** : marché entre joueurs, staff complet, moral détaillé et hiérarchie, centre de formation, albums, merch, tournées, sync, guerres, coopérations, festival, scandales, changement de genre.

### MVP 2 — « Mon label est une vraie maison »
- **Marché entre joueurs** : transferts, clauses de rachat, enchères, prêts ; featurings entre joueurs.
- Contrat complet (toutes les clauses), recoupement, renouvellements.
- **Moral, statuts, hiérarchie salariale**, promesses ; onglet Dynamique.
- **Staff** complet ; onglet Staff.
- **Centre de formation**.
- Potentiel dynamique complet (profils de croissance, régression, dépassement), compétences « + », changement de genre.
- Albums, mixtapes, deluxe ; les 20 cartes de studio restantes.
- Tournées, merch, superfans, vente directe ; onglet Merch et tournées.
- Prêt sur patrimoine. Paliers Mainstream et Empire.
- Événements de label (30 cartes), opportunités, sync, sponsors.
- Saisons : objectifs, classement final, récompenses.

### MVP 3 — « Mon label contre les autres »
- **Guerres** : conférence de presse, clash, guerre de charts.
- **Coopérations** : tournée commune, co-marketing, pacte, renflouement.
- **Festival du Serveur**, Trophées, Nuit des Charts, compilation de la party.
- **Scandales** et saisonnalité complète.
- Radio, influenceurs. Charts par région.
- Palier Divin.
- Catalogue de ~1 000 artistes (script de collecte, relecture).

### Plus tard (hors MVP)
Label bonus partagé par toute la party · deals de distribution, sous-licences, résidences · filiales · rachat de labels du jeu · photos et avatars · audio · notifications Discord · historique sur plusieurs années.

## 12.3 Ordre de fabrication conseillé à l'intérieur du MVP 1

1. Monde, tick, label, données fixes.
2. Formules (qualité, streams, hype, fans, charts) + simulateur → réglage.
3. Création de son (serveur), puis son écran.
4. Sorties, charts, Accueil.
5. Contrats, recrutement.
6. Finances, banque, faillite.
7. Tutoriel.
8. Test entre amis sur un serveur, avec un tick accéléré (1 tick toutes les 10 minutes) pour jouer une saison en une soirée.

**Taille** : c'est de loin le plus gros jeu de l'application. À titre de repère, le MVP 1 seul représente à peu près autant de travail que les 5 jeux de party réunis ; les MVP 2 et 3 sont chacun du même ordre.

## 12.4 Risques

| # | Risque | Gravité | Parade |
|---|---|---|---|
| R1 | **Équilibre de l'économie** : trop facile (tout le monde riche en 3 jours) ou trop dur (faillites en série) | Haute | Simulateur dès l'étape 0 ; tous les chiffres dans un seul fichier de réglages ; première saison annoncée comme « saison de rodage » |
| R2 | **Effet boule de neige** : le premier prend une avance impossible à rattraper | Haute | Échelle logarithmique du classement, rendement décroissant du marketing, coûts qui montent avec le palier, bonus de rattrapage, récompenses de saison modestes |
| R3 | **Offre gratuite** : trop de mondes actifs | Moyenne | Compteurs et liste d'attente (07), veille des mondes inactifs, tick économe |
| R4 | **Vrais artistes** : même avec les noms seuls, quelqu'un peut se plaindre | Moyenne | Notes de jeu uniquement, aucun événement sensible sur un vrai artiste (H3), traits tirés par monde (H4), liste d'exclusion, mention « jeu de fiction, notes inventées », retrait d'un nom en une ligne |
| R5 | **Joueurs absents** : un label abandonné fausse le marché et les défis | Moyenne | Label gelé après 14 ticks sans connexion (ses artistes ne perdent rien, il ne peut plus être défié) ; il sort du classement de la saison |
| R6 | **Complexité** pour un nouveau joueur | Moyenne | Tutoriel jouable, onglets débloqués avec les paliers, aide à la première ouverture, lexique |
| R7 | **Entente entre amis** (dons d'argent, ventes à 1 €) : pas d'anti-triche | Basse (assumé) | Tout transfert et tout don apparaît dans le fil de la party ; prix minimum d'un transfert = 50 % de la valeur |
| R8 | **Durée de développement** | Haute | Découpage en 3 MVP publiables ; le MVP 1 est déjà un jeu complet |
| R9 | **Tick raté ou bug de calcul** en pleine nuit | Moyenne | Tick rejouable (au plus 3 de retard), journal du tick, sauvegarde de l'état avant chaque tick pendant le rodage |
| R10 | **Lassitude** après 2-3 saisons | Moyenne | Saisons différentes (calendrier décalé), tendances influencées par les joueurs, objectifs tirés, palier Divin lointain, contenus ajoutables sans code |
| R11 | Micro-genres mal définis (supertrap, regalia…) | Basse | Tes corrections ; ce sont des lignes de texte |

## 12.5 Questions ouvertes (pour toi)

| # | Question | Ma proposition par défaut |
|---|---|---|
| Q1 | Rythme : 1 jour réel = 1 semaine de jeu, ça te va ? | Oui (H1) |
| Q2 | Heure du tick | 06:00, heure de Paris |
| Q3 | Les micro-genres (supertrap, lovetrap, regalia, crank, new jazz) : mes descriptions sont-elles justes ? Quels artistes y associer ? | À corriger par toi |
| Q4 | Irko, Bedry, Yassboi, Tractopelle Music, AWA : genre, ville, niveau, qui est signé où ? Et la liste des artistes underground à ajouter (comme Ptite Soeur, Jeune Morty, 2hollis, Lucy Bedroque, Rommulas) | À remplir par toi |
| Q5 | Y a-t-il des artistes que tu ne veux **pas** dans le jeu, ou que tu veux absolument ? | Liste `seed.csv` + `exclusions.csv` |
| Q6 | Nombre maximum de labels de joueurs par serveur | 20 |
| Q7 | Un joueur qui est dans plusieurs serveurs a-t-il un label dans chacun ? | Oui, indépendants |
| Q8 | Faillite : remise à zéro totale, c'est bien ce que tu veux, même pour un ami qui a joué 2 mois ? | Oui, mais 14 ticks d'alerte et un renflouement possible par les amis |
| Q9 | Le fil de la party doit-il montrer les montants (transferts, cash des autres) ? | Transferts visibles ; cash des autres visible seulement dans le classement |
| Q10 | Le « label bonus partagé » futur : un label commun géré à plusieurs, ou un bonus de groupe ? | À définir plus tard |
| Q11 | Fin de saison : on garde tout — veux-tu quand même une « ligue » par palier plus tard, pour que les nouveaux aient leur propre classement ? | Plus tard, si l'écart devient un problème |
| Q12 | Pochettes : faut-il pouvoir en signaler une (pas de modération dans le MVP) ? | Non au MVP ; chaque joueur peut masquer les pochettes d'un autre label chez lui |
