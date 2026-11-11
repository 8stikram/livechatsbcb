# Melody Tycoon — Game Design Document

> Version 1 — 11/11/2026. Spécification, pas de code.
> Chaque partie est un fichier séparé : on peut en relire une seule sans tout charger.

## 1. Résumé exécutif

1. **Melody Tycoon** est un jeu de gestion de label musical, ton « mode carrière FIFA », intégré à LiveChat SBCB, tout en haut de l'onglet Jeux.
2. Un serveur Discord = un **monde** ; chaque joueur de la party y dirige **son propre label** contre les autres.
3. Le temps avance seul sur le serveur : **1 jour réel = 1 semaine de jeu** (le « tick », à 6 h, heure de Paris). Une saison = 4 semaines réelles = 28 semaines de jeu.
4. Le cœur du jeu, c'est la **création de son** : artiste puis 5 choix payants (thème, beat, producteur, studio, featuring), avec un événement après chaque étape, une qualité affichée sous forme de fourchette, et un son figé une fois produit.
5. Un son sort en single, EP, album, mixtape, freestyle ou deluxe, avec du marketing et une date. Au tick, le serveur calcule les streams, la hype, les fans, les charts et l'argent.
6. Trois ressources seulement : **cash, hype, fans**. La réputation du label et la valeur du catalogue en découlent.
7. Autour du cœur : scouts, centre de formation, contrats négociés en plusieurs tours, moral et hiérarchie des salaires, staff, banque, faillite (remise à zéro du label).
8. Entre joueurs : marché d'artistes, featurings, guerres (conférence de presse, clash, guerre de charts), coopérations, festival du serveur, trophées de fin de saison.
9. La base de départ contient environ 1 000 vrais artistes (**leurs noms seulement**, stats inventées) et 23 vrais labels, en plus d'artistes et de labels inventés.
10. Le MVP tient en 3 étapes. Coût d'hébergement : **0 €**, en restant dans l'offre gratuite actuelle (Durable Objects SQLite et R2).

## Sommaire des fichiers

| N° | Fichier | Contenu |
|---|---|---|
| 00 | `00-sommaire.md` | Résumé, hypothèses, réglages clés |
| 01 | `01-piliers-boucles.md` | Piliers, boucles, rythme, classement final |
| 02 | `02-artistes-recrutement.md` | Artistes, potentiel, traits, genres, scouting, formation, staff, moral |
| 03 | `03-creation-de-son.md` | **Cœur du jeu** : 5 choix, événements, qualité, énergie, featuring, formats |
| 04 | `04-sortie-charts-economie.md` | Marketing, streams, hype, fans, charts, revenus, live, merch, sync |
| 05 | `05-contrats-marche-labels.md` | Contrats, négociation, marché, paliers, banque, faillite, guerres, coopérations, festivals |
| 06 | `06-evenements-notifications.md` | Événements, scandales, saisons, notifications |
| 07 | `07-donnees-technique.md` | Schéma de base de données, stockage, budget gratuit |
| 08 | `08-contenus.md` | Genres, beats, thèmes, traits, compétences, cartes événements |
| 09 | `09-base-artistes-labels.md` | Format de la base, plan de collecte, échantillon (`artistes-echantillon.csv`, `labels.csv`) |
| 10 | `10-ecrans.md` | Écrans, onglet par onglet |
| 11 | `11-tutoriel.md` | Tutoriel jouable |
| 12 | `12-roadmap-risques.md` | Roadmap MVP, risques, questions ouvertes |

## Hypothèses posées (à valider)

| # | Hypothèse | Pourquoi |
|---|---|---|
| H1 | **1 jour réel = 1 semaine de jeu** au lieu de « 1 semaine réelle = 1 mois ». La saison reste à 4 semaines réelles. | Avec 1 semaine = 1 mois, les charts « hebdomadaires » tomberaient tous les 1,75 jour réel : bancal. Avec un tick par jour, il y a des résultats chaque matin, et c'est ça qui fait revenir. Les 2 réglages font avancer le jeu presque à la même vitesse (4,3 contre 7 semaines de jeu par semaine réelle). |
| H2 | Melody Tycoon n'existe que dans les **parties de serveur** (liées à un serveur Discord), pas dans les parties à code. | Les parties à code sont temporaires, alors qu'un label doit durer des semaines. |
| H3 | Les vrais artistes ne subissent **jamais** d'événement sensible (addiction, procès, santé, plagiat). Ces événements ne touchent que les artistes inventés. | Pour ne pas inventer de faits gênants sur de vraies personnes. Les vrais artistes ont seulement des événements neutres (fatigue, désaccord artistique, buzz). |
| H4 | Les **traits** et le **risque de scandale** d'un vrai artiste sont tirés au hasard dans chaque monde, et pas fixés dans la base. | Même raison : on ne colle pas d'étiquette « Fêtard » à une vraie personne. Et chaque monde devient différent. |
| H5 | Les producteurs, studios, scouts et membres du staff sont tous **inventés**. | Moins de données à gérer, pas de vraies personnes en jeu. |
| H6 | Les définitions des beats supertrap, lovetrap, regalia, crank et new jazz sont mon interprétation (voir 08). | Ce sont des micro-genres récents qui bougent vite : **à corriger par toi**. |
| H7 | Monnaie : l'euro (€). Les fans sont des « fans actifs » du jeu, à une échelle simplifiée. | Lisible pour un public francophone. |
| H8 | Un monde accepte **20 labels de joueurs maximum** (plus les labels gérés par le jeu). | Pour tenir le budget gratuit (voir 07) et garder des charts lisibles. |

## Réglages clés (tous modifiables dans un seul fichier de config côté serveur)

| Réglage | Valeur | Effet |
|---|---|---|
| Heure du tick | 06:00 Europe/Paris | Résultats au réveil |
| Ticks par saison | 28 | 4 semaines réelles |
| Cash de départ | 30 000 € | Assez pour ~6 sons « studio de quartier » |
| Réputation de départ | 10 / 100 | Palier Label Maison |
| Taux par stream | 0,004 € | Brut, avant partage avec l'artiste |
| Énergie récupérée par tick | 25 × (endurance / 70) | ~1 son par artiste et par jour |
| Frais fixes Label Maison | 200 € / tick | Loyer et distribution |
| Délai avant faillite | 14 ticks d'affilée | 2 semaines réelles pour se redresser |
