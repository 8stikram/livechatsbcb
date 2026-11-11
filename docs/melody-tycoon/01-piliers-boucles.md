# 01 — Piliers, boucles, rythme, classement

## 1.1 Piliers

| Pilier | Ce que le joueur ressent | Systèmes qui le portent |
|---|---|---|
| Révéler des talents | « Je l'ai vu avant tout le monde » | Scouts, soumissions, centre de formation, potentiel caché (02) |
| Produire avec des choix qui comptent | « Ce son, c'est mes décisions » | Création de son, événements, featuring (03) |
| Faire vivre un label | « Je tiens une maison » | Contrats, moral, hiérarchie, staff, banque (02, 05) |
| Exister face aux autres | « Je veux passer devant mon pote » | Marché, guerres, coopérations, charts, festival (04, 05) |
| Revenir chaque jour | « Qu'est-ce que mon son a fait cette nuit ? » | Tick quotidien, charts, événements, notifications (04, 06) |

## 1.2 Le temps

- **Tick** : chaque jour à 06:00 (heure de Paris), le serveur fait passer **1 semaine de jeu** pour tout le monde en même temps.
- Entre deux ticks, le joueur agit librement : créer, négocier, programmer. Les résultats tombent au tick suivant.
- **Mois de jeu** = 4 ticks. **Année de jeu** = 52 ticks. **Saison** = 28 ticks (4 semaines réelles).
- Le calendrier de jeu sert aux saisons (été, Noël…). La saison 1 commence en semaine 1 (janvier).
- Un monde où personne ne s'est connecté depuis 30 jours réels se met **en veille** : plus de tick. Il se réveille à la prochaine connexion, sans rattrapage.

Ce qui se passe à chaque tick, dans cet ordre :
1. Les sorties programmées pour cette semaine sortent.
2. Calcul des streams de tous les sons actifs (joueurs + labels gérés par le jeu).
3. Charts publiés (global, par genre, par région, labels, artistes).
4. Hype, fans et superfans mis à jour.
5. Revenus encaissés : streams, live, merch, sync, superfans, sponsors.
6. Coûts prélevés : staff, frais fixes, allocations, remboursements de prêt, intérêts.
7. Énergie, moral et progression des artistes.
8. Contrats : semaines restantes −1, fins de contrat, alertes.
9. Événements tirés au sort (label, artistes, monde).
10. Contrôle de faillite.
11. Notifications envoyées.

## 1.3 Boucle quotidienne (10 min à 1 h)

1. **Accueil** : résumé de la nuit (streams, places dans les charts, cash gagné ou perdu), alertes (contrat qui se termine, moral bas, dette).
2. **Événements** à traiter : 0 à 3 cartes avec un choix.
3. **Recrutement** : rapports de scouts arrivés, démos reçues (2 à 5 par tick).
4. **Studio** : 1 son par artiste qui a assez d'énergie (5 choix + événements).
5. **Sorties** : choisir le format, le marketing et la semaine de sortie.
6. **Finances** : rembourser, emprunter, investir (staff, merch, tournée).
7. **Party** : répondre à une offre de featuring, une offre de transfert, un clash.

La durée de jeu est limitée naturellement par l'énergie des artistes et par le cash. Un petit label (5 artistes) se joue en 10 à 20 min ; un gros label (25 artistes ou plus) peut occuper 1 h.

## 1.4 Boucle « hebdomadaire » (chaque tick)

- Charts par genre, par région et global.
- Mini-bilan financier (dans l'Accueil).
- Fins de contrat et renouvellements (alerte 4 ticks avant la fin).
- Tournées et campagnes marketing qui avancent.

## 1.5 Boucle mensuelle (tous les 4 ticks)

- **Bilan du mois** : compte de résultat, comparaison avec les autres labels.
- **Tendances** renouvelées : 3 beats et 2 thèmes « en hausse », 2 « en baisse », par région.
- Salaires du staff (prélevés chaque tick, mais résumés ici).
- Point sur les objectifs de saison.

## 1.6 Boucle de saison (28 ticks)

- **Début** : 3 objectifs de label proposés (le joueur en choisit 2), par exemple « 1 son dans le top 10 global », « signer un artiste de 80 ou plus », « finir sans dette ».
- **Milieu** (tick 14) : festival du serveur et rapport de mi-saison.
- **Fin** : trophées (06), classement final, récompenses, montée de palier si les conditions sont remplies.
- **Après** : on garde tout (labels, artistes, cash). Les compteurs de saison repartent à zéro (streams de la saison, objectifs).

## 1.7 Classement final des labels

Quatre critères. Pour chacun, le meilleur label du monde a 100 points et les autres sont placés sur une **échelle logarithmique**, pour qu'un label 10 fois plus riche n'écrase pas tout :

`points(x) = 100 × log10(1 + x) / log10(1 + max_du_monde)`

| Critère | Mesure | Poids |
|---|---|---|
| Cash net | cash − dettes (0 si négatif) | 30 % |
| Popularité | total des fans des artistes sous contrat | 30 % |
| Valeur du catalogue | voir 04 (revenus futurs estimés des masters détenus) | 25 % |
| Réputation | réputation / meilleure réputation × 100 (linéaire) | 15 % |

**Score de saison** = somme pondérée, sur 100.

Récompenses de fin de saison (on garde tout, donc elles restent modestes pour ne pas creuser l'écart) :
- 1er : titre « Label de la saison » affiché sur le profil, +3 de réputation, trophée.
- 2e et 3e : +2 et +1 de réputation, trophée.
- Tous : badge « Saison N terminée », avec la place finale.
- Le dernier, s'il reste actif : +10 000 € pour relancer.

## 1.8 Joueur qui arrive en cours de route

Il démarre avec un petit bonus, mais toujours **en dessous** du dernier label actif :

- Cash de départ = `max(30 000, min(0,3 × médiane_des_capitaux, 0,7 × plus_petit_capital))` (capital = cash + catalogue).
- 1 artiste de départ de plus au choix (4 au lieu de 3 propositions), même niveau que pour les autres.
- Réputation : 10, palier Label Maison comme tout le monde.
- **Protection de 7 ticks** : ses artistes ne peuvent pas être visés par une guerre, ni recrutés de force via une clause de rachat.

## 1.9 Exemple de journée (joueur moyen, saison 1, tick 9)

> 06:00 — « Rue Glacée » de Nova Kalé fait 84 000 streams (+31 %) et entre 41e du chart Rap FR. +336 € bruts, 269 € pour le label.
> 12:30 — Le joueur ouvre le jeu. Événement : « Liha veut un clip pour son prochain son » (payer 5 000 €, promettre pour plus tard, refuser).
> 12:35 — Rapport du scout parti en Belgique : 4 profils, dont une rappeuse drill notée « 52-60, potentiel 70-85 ».
> 12:40 — Studio avec Nova Kalé : thème Rupture, beat lovetrap en lease, beatmaker local, studio de quartier. Embrouille : « le beatmaker ne répond plus » → le joueur paie 300 € de plus pour garder le planning. Fourchette affichée : 58-70.
> 12:50 — Sortie programmée en single pour le tick 11, avec réseaux sociaux et affiches.
> 12:52 — Un ami de la party propose un featuring à 2 500 €. Le joueur contre-propose 1 800 €, la roue tourne à 64 % : accepté.
