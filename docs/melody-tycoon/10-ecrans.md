# 10 — Écrans

> Structure des écrans seulement. Le look (façon mode carrière) viendra avec tes captures d'écran, puis une maquette.

## 10.1 Entrée et cadre général

- **Dans l'onglet Jeux** : une grande carte horizontale « Melody Tycoon » tout en haut, séparée des jeux de party. Elle affiche : nom et palier du label, cash, place dans la party, pastille de notifications, compte à rebours avant le prochain tick, bouton **Ouvrir**. Sans label : bouton **Créer mon label**. Dans une party à code : carte grisée « disponible dans les parties de serveur ».
- **Le jeu s'ouvre en plein écran** dans la fenêtre de l'application (bouton retour vers LiveChat toujours visible).

**Cadre permanent** :
| Zone | Contenu |
|---|---|
| Barre du haut | Logo et nom du label, palier, **cash**, **fans totaux**, **réputation**, semaine et saison en cours, compte à rebours du tick, cloche, retour |
| Menu principal | Les 13 onglets (icône + nom) |
| Zone centrale | L'écran de l'onglet, souvent en « tuiles » sur l'Accueil et en liste + fiche ailleurs |
| Panneau de droite (repliable) | Fil de la party : dernières actions visibles des autres labels (sorties, signatures, clashs) |

**Navigation** : cliquer sur un nom d'artiste, de son ou de label ouvre toujours sa **fiche** en panneau, depuis n'importe quel écran. Touche Échap = retour. Pas de page qui défile sans fin : listes paginées ou avec défilement interne.

## 10.2 Les 13 onglets

| # | Onglet | Sert à |
|---|---|---|
| 1 | Accueil | Voir l'essentiel et quoi faire maintenant |
| 2 | Effectif | Gérer les artistes |
| 3 | Recrutement | Scouts, démos, centre de formation |
| 4 | Marché | Acheter, vendre, prêter |
| 5 | Studio | Créer des sons |
| 6 | Sorties | Coffre, calendrier, programmation |
| 7 | Charts | Classements et tendances |
| 8 | Finances | Comptes, banque |
| 9 | Staff | Recruter et affecter le staff |
| 10 | Dynamique | Moral, hiérarchie, promesses |
| 11 | Merch et tournées | Concerts, tournées, merch |
| 12 | Événements et réseaux | Cartes à traiter, guerres, coopérations, festival |
| 13 | Paramètres | Label, notifications, aide |

### 1. Accueil
**Affiche** (tuiles) :
- **À faire** : cartes d'événement en attente (avec délai), négociations en cours, artistes prêts à enregistrer, sons prêts à sortir.
- **Cette nuit** : résumé du dernier tick (streams, meilleures places, cash gagné ou perdu, fans).
- **Trésorerie** : cash, courbe sur 8 ticks, prochaine mensualité, alerte de faillite si besoin.
- **Contrats** : ceux qui finissent dans moins de 8 ticks.
- **Moral du label** : jauge + les 2 artistes les plus bas.
- **Prochains rendez-vous** : sorties programmées, festival, Nuit des Charts, fin de saison.
- **Classement de la party** : top 5 + ta place.
- **Objectifs de saison** : progression.

**Actions** : chaque tuile est cliquable vers l'onglet concerné ; bouton principal **« Créer un son »**.

### 2. Effectif
**Affiche** : tableau des artistes (statut, nom, genre, GEN, potentiel connu, énergie, moral, hype, fans, fin de contrat, état). Tri et filtres. Vue « cartes » en option.
**Fiche artiste** (panneau, 5 sous-onglets) :
| Sous-onglet | Contenu |
|---|---|
| Profil | Attributs en 4 familles, compétences signature, traits connus, genres et affinités, profil d'énergie |
| Forme | Énergie, fatigue créative, moral et ses causes, progression récente, blessure |
| Contrat | Toutes les clauses, avance restant à recouper, promesses et leur état |
| Discographie | Sons et projets, notes, streams, meilleures places |
| Relations | Relations et rancunes (artistes, producteurs, labels) |

**Actions** : créer un son, programmer un concert, affecter un coach, changer de genre, renouveler, mettre en vente ou en prêt, libérer.

### 3. Recrutement
Trois volets :
- **Scouts** : liste des scouts, mission en cours (région, genre, retour dans N ticks), bouton **Nouvelle mission**. **Rapports** reçus : profils avec notes estimées (±), fourchette de potentiel, traits vus ; actions : observer encore, ajouter à la liste de suivi, ouvrir la négociation.
- **Démos** : 2 à 5 cartes par tick (nom, genre, extrait décrit en texte, note estimée) ; actions : ignorer, feedback encourageant, feedback cash, signer.
- **Centre de formation** : places, artistes en formation (progression, ticks restants), **Créer un artiste** (champ pseudo), orienter, promouvoir.
- **Liste de suivi** : artistes repérés, avec alerte si un autre label s'y intéresse.

### 4. Marché
**Affiche** : 3 listes (Libres / Sous contrat / Liste des transferts), recherche par nom, filtres (genre, pays, GEN, fans, prix, label). Chaque ligne : valeur estimée, label, fin de contrat, clause de rachat si connue.
**Actions** : faire une offre, payer la clause, enchérir, proposer un prêt, proposer un featuring. **Mes offres** : envoyées et reçues, avec leur délai.
**Écran de négociation** (commun aux contrats) : à gauche les clauses avec curseurs, à droite l'agent (humeur, patience en pastilles, points bloquants révélés, dernière réponse), en bas le coût total pour le label et l'effet sur la hiérarchie.

### 5. Studio
- **Liste** des artistes disponibles (énergie, fatigue, dernier son), sons en cours (délai de mixage).
- **Parcours de création** (plein écran, 6 étapes en haut : Artiste · Thème · Beat · Producteur · Studio · Featuring) :
  - au centre : les options de l'étape en cartes (prix, effet, risque ; grisées avec la raison) ;
  - bandeau permanent : budget dépensé / fixé, **fourchette de qualité** (barre qui se resserre), énergie, délai ;
  - bouton **Débrouille** à chaque étape (animation de tirage) ;
  - entre deux étapes : la **carte d'événement** (fluide = petit écran de bonus ; embrouille = 2 ou 3 boutons avec effets annoncés) ;
  - étape Featuring : curseur d'offre, pourcentage de chance, **roue** ;
  - fin : **révélation de la note** (la barre se fige sur la note), récapitulatif des coûts, bouton « Mettre au coffre » ou « Programmer la sortie ».
- **Producteurs** : vivier du moment, relations.

### 6. Sorties
- **Coffre** : sons prêts (note, âge, artiste).
- **Calendrier** : frise des 8 prochains ticks ; mes sorties, celles annoncées par les autres labels, périodes et événements.
- **Programmer** (assistant en 4 pas) : sons et format → titre et pochette (envoi d'image, recadrage carré) → marketing (cases à cocher, portée totale estimée) → semaine.
- **Sorties passées** : résultats, courbe de streams, revenus cumulés.

### 7. Charts
Sélecteur : Global · Genres · Régions · Projets · Artistes · Labels · **Party**. Chaque ligne : place, évolution, titre, artiste, label, streams, semaines, meilleure place ; mes sons surlignés.
**Tendances** : beats et thèmes en hausse et en baisse, par région ; prochain changement dans N ticks.
**Duels** : guerres de charts en cours, en face à face.

### 8. Finances
- **Vue d'ensemble** : cash, dettes, patrimoine, valeur du catalogue, score de saison.
- **Compte de résultat** du mois et de la saison, par catégorie (revenus : streaming, live, merch, sync, superfans, vente directe, sponsors, transferts ; coûts : production, marketing, staff, allocations, royalties, frais fixes, intérêts).
- **Par artiste** : ce qu'il rapporte et ce qu'il coûte, avance restante.
- **Banque** : prêts en cours (échéancier), simulateur d'emprunt (montant, durée → mensualité et coût total), remboursement anticipé.
- **Prévision** à 4 ticks (avec un directeur financier).
- **Plan de redressement** (si en difficulté).

### 9. Staff
Liste du staff (poste, niveau, salaire, affectation), places utilisées / disponibles. **Recruter** : 6 candidats, renouvelés tous les 4 ticks. Actions : embaucher, affecter (coach → artiste ; scout → mission), licencier.

### 10. Dynamique du label
- **Moral** : jauge du label, liste des artistes avec leur moral et ses causes (+/−).
- **Hiérarchie** : artistes par statut ; **grille des rémunérations** en barres, anomalies en rouge.
- **Promesses** : toutes les promesses en cours (rôle, sorties, marketing, clip), état et délai.
- **Relations internes** : amitiés et tensions entre artistes.
- **Historique** : faits marquants du label.

### 11. Merch et tournées
- **Concerts** : programmer une date (artiste, région, salle → demande estimée, bénéfice estimé, énergie).
- **Tournées** : créer (dates, régions, salles), suivre, annuler.
- **Merch** : lots par artiste (stock, ventes par tick, marge), commander un lot, régler le prix, brader.
- **Clubs de superfans** : activer ou couper par artiste.

### 12. Événements et réseaux
- **Cartes en attente** (les mêmes que sur l'Accueil, en liste complète).
- **Guerres** : lancer une conférence de presse, un clash, un défi de charts ; guerres en cours et passées ; rivalités.
- **Coopérations** : proposer et suivre (tournée commune, co-marketing, pacte, prêt, renflouement).
- **Festival et trophées** : inscriptions, affiche, résultats ; cérémonie de fin de saison (écran de remise des trophées, podium des labels).
- **Fil de la party** complet.
- **Palmarès** : le mien et celui des autres joueurs.

### 13. Paramètres
Nom, couleur et logo du label · notifications par catégorie · revoir le tutoriel · aide (lexique des termes, règles résumées) · fermer mon label (double confirmation).

## 10.3 Écrans spéciaux

| Écran | Contenu |
|---|---|
| Création du label | Nom, couleur, logo (optionnel), choix d'1 artiste de départ parmi 3, puis tutoriel |
| « Pendant ton absence » | À l'ouverture, s'il y a eu au moins 1 tick : résumé tick par tick, repliable |
| Montée de palier | Animation, ce qui est débloqué |
| Faillite | Bilan du label, palmarès conservé, bouton « Repartir » |
| Fin de saison | Trophées, classement final, objectifs, récompenses |
| Fiche d'un autre label | Effectif visible (notes exactes masquées si non scoutées), palmarès, sorties, boutons d'interaction |
