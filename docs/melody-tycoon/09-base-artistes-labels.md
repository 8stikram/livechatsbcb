# 09 — Base d'artistes et de labels

## 9.1 Ce qui est livré maintenant

| Fichier | Contenu |
|---|---|
| `artistes-echantillon.csv` | ~235 artistes : ~220 vrais (rap US, FR, UK, R&B, pop, afro, latin, électro, hyperpop), dont **~80 de la scène underground** (Bedry, Irko, Yass Boi, 8stikram et leurs proches, Ptite Soeur, Jeune Morty, 2hollis, Lucy Bedroque, Rommulas, fakemink…) + 15 inventés |
| `labels.csv` | 23 vrais labels + le pseudo-label « Indépendants » + 8 labels inventés |

**Important** :
- Seuls les **noms** des vrais artistes sont utilisés. Toutes les notes (GEN, potentiel, fans du jeu, hype) sont **inventées pour le jeu**, comme les notes d'un jeu de foot.
- La colonne `a_verifier` signale ce que je ne sais pas avec certitude : `label` = le label de départ est une attribution simplifiée ; `niveau` = note et fans estimés à la louche (scène underground, à régler par toi) ; `tout` = presque rien trouvé, à compléter. Le détail des recherches est en 9.7.
- Les villes vides sont celles dont je ne suis pas sûr.
- Je n'ai mis ni artistes décédés, ni artistes dont la présence poserait un problème évident. La liste finale reste ton choix.

## 9.2 Format d'un artiste (fichier JSON du catalogue)

| Champ | Type | Exemple | Note |
|---|---|---|---|
| id | texte | `tiakola` | Minuscules, sans accent, stable pour toujours |
| nom | texte | Tiakola | Nom de scène |
| alias | liste | `["Tiako"]` | Pour la recherche |
| pays | code à 2 lettres | FR | |
| ville | texte, optionnel | La Courneuve | |
| genre | id de genre | `rap_fr` | Genre principal (08) |
| genres_secondaires | liste, 0 à 2 | `["afro","rnb"]` | |
| sous_genres / tags | liste, 1 à 4 | `["melodique","lovetrap"]` | Sert aux affinités de beat et à la recherche |
| gen | 1-99 | 86 | Niveau actuel |
| pot_min, pot_max | 1-99 | 86, 91 | Fourchette de potentiel « vraie » ; chaque monde tire le potentiel réel dedans |
| fans | entier | 4 000 000 | Fans du jeu (échelle ci-dessous) |
| hype | 0-100 | 78 | Hype de départ |
| label_id | id ou vide | `warner` | Vide = libre. `inde` = sur sa propre structure |
| reel | oui / non | oui | |
| profil_energie | texte | `normal` | 02 |
| sync, merch | 0-100 | 55, 55 | Potentiel de sync, attrait merch |
| regions | objet | `{"fr":70,"afrique":15,"monde":15}` | Répartition des fans. Par défaut : 60 / 25 / 15 selon le pays |
| attrs | objet, optionnel | `{"voix":88,…}` | Si absent : généré depuis `gen`, le genre et les tags (9.4) |
| prix_min, prix_max | € | calculés | **Non stockés** : calculés par la formule de valeur (05), ±15 % |
| traits, risque_scandale | — | — | **Jamais dans le catalogue pour un vrai artiste** : tirés par monde (H4). Autorisés pour les artistes inventés |
| photo | — | vide | Prévu, non utilisé (noms seulement) |
| a_verifier | texte | `label` | Supprimé du fichier final |

**Échelle des fans du jeu**

| Catégorie | Fans du jeu | GEN typique | Part visée dans la base de 1 000 |
|---|---|---|---|
| Légende mondiale | 50 à 100 M | 90-96 | 2 % |
| Star mondiale | 15 à 50 M | 85-93 | 6 % |
| Star nationale | 3 à 15 M | 80-90 | 12 % |
| Confirmé | 500 000 à 3 M | 74-86 | 25 % |
| Montant | 50 000 à 500 000 | 64-80 | 30 % |
| Niche / underground | 5 000 à 50 000 | 55-72 | 25 % |

**La scène underground compte autant que les stars** : au moins 300 des 1 000 artistes (catégories Montant et Niche) viennent des scènes underground FR, US et UK. Ce sont eux que les petits labels peuvent signer au début, avec un gros potentiel caché (jusqu'à +20 au-dessus de leur note). Ils passent par la liste manuelle `seed.csv`, car les sources ouvertes les connaissent mal.

Répartition visée par scène : 35 % francophone (France, Belgique, Suisse, Maghreb, Afrique francophone), 30 % US-Canada, 12 % UK, 23 % reste du monde. Environ 60 % rap/trap/drill, 40 % le reste.

## 9.3 Format d'un label

| Champ | Exemple | Note |
|---|---|---|
| id, nom, pays | `rec118`, Rec. 118, FR | |
| reel | oui | |
| taille | petit / moyen / gros / major | Budget du label géré par le jeu |
| palier_jeu | 1 à 5 | Palier équivalent (pour les comparaisons et les guerres) |
| genres_forts | `rap_fr, afro, rnb` | Ce qu'il signe |
| reputation | 0-100 | |
| style_ia | prudent / agressif / sélectif | Comportement sur le marché : prudent = vend cher et achète peu ; agressif = surenchérit ; sélectif = ne prend que des GEN élevées |

Comportement des labels du jeu (simple, pas d'« intelligence » coûteuse) : ils ne créent pas de sons étape par étape. Leurs sorties sont simulées (04, § 4.8), ils répondent aux offres par des seuils (05, § 5.4), et une fois par mois ils signent 0 à 2 artistes libres qui correspondent à leurs genres.

## 9.4 Générer les attributs détaillés

À partir de `gen`, du genre et des tags, pour ne pas saisir 20 notes à la main :

1. Partir de `gen` pour chaque attribut technique et mental.
2. Appliquer le profil de la famille de genre (ex. Rap : écriture +6, instrument −25, voix −3).
3. Appliquer les tags (`plume` : écriture +6 ; `scene` : performance +8 ; `voix` : voix +8 ; `auto_produit` : production +15 ; `rare` : endurance −15 ; `prolifique` : endurance +15 ; `viral` : charisme +6…).
4. Ajouter un petit écart propre à l'artiste (±4, calculé depuis son `id` : toujours le même partout).
5. Recaler pour que la note générale retombe sur `gen`.

Résultat : identique dans tous les mondes pour les attributs ; seuls le potentiel réel, les traits et le risque de scandale changent d'un monde à l'autre.

## 9.5 Plan de collecte pour arriver à ~1 000 artistes

**Principe** : un script lancé **à la main sur ton PC** (dossier `tools/melody-data/`), jamais sur le serveur. Il fabrique `artists.json` et `labels.json`, que tu relis avant de les publier avec une mise à jour. Aucun coût, aucune collecte automatique en production.

**Sources (gratuites et ouvertes)**

| Source | Ce qu'on prend | Conditions |
|---|---|---|
| **Wikidata** (requêtes SPARQL) | Nom, alias, pays, ville de naissance ou d'origine, genres, label (propriété « label discographique »), années d'activité, identifiant MusicBrainz | Données libres (CC0) |
| **MusicBrainz** | Genres et tags de la communauté, type (solo, groupe), labels des dernières sorties, date de la dernière sortie | Données libres ; 1 requête par seconde ; s'identifier avec un nom d'application |
| **Wikipédia — statistiques de consultation** | Nombre de vues de la page (FR et EN) sur 12 mois → mesure de notoriété ; vues des 60 derniers jours → hype | API publique et gratuite |
| **Liste manuelle** (`seed.csv`) | Les noms qu'on veut absolument (scène francophone niche, que les sources ouvertes couvrent mal), avec genre et tags | Remplie par toi et moi |

**Sources écartées** : récupération sur Spotify, Deezer, Genius ou YouTube (interdite par leurs conditions pour cet usage), et toute photo.

**Étapes du script**

| # | Étape | Détail |
|---|---|---|
| 1 | Liste de départ | `seed.csv` (noms imposés) + requêtes Wikidata par genre et par pays (rap, R&B, pop, afro, électro… × FR, BE, CH, US, CA, UK, NG…), limitées aux artistes actifs depuis 2015 |
| 2 | Enrichir | Pour chaque nom : fiche Wikidata → identifiant MusicBrainz → genres, tags, label récent, dernière sortie |
| 3 | Notoriété | Vues Wikipédia sur 12 mois (FR + EN) → **fans du jeu** par une échelle logarithmique calée sur 5 repères (ex. The Weeknd = 85 M, Tiakola = 4 M, un artiste niche = 20 000) |
| 4 | Hype | Vues des 60 derniers jours ÷ moyenne sur 12 mois → hype entre 20 et 90 |
| 5 | Niveau | `gen` = base selon la catégorie de fans (tableau 9.2) ± un écart ; **puis retouche à la main** des 150 plus connus (la notoriété n'est pas le talent) |
| 6 | Potentiel | `pot_min = gen` ; `pot_max = gen + marge` (marge plus grande si la carrière est récente : jusqu'à +18 pour un artiste apparu depuis moins de 3 ans) |
| 7 | Genres du jeu | Table de correspondance : tags MusicBrainz/Wikidata → les 12 genres et les tags du jeu (`trap`, `cloud rap`, `uk drill`, `afrobeats`…) ; les cas inconnus sortent dans un fichier « à classer » |
| 8 | Labels | Label Wikidata/MusicBrainz → table de correspondance vers les 23 labels du jeu (les filiales sont rattachées à leur major) ; sinon `inde` |
| 9 | Nettoyage | Doublons (même identifiant MusicBrainz ou nom très proche), groupes dissous, artistes décédés, pages d'homonymes, noms qui ne passent pas à l'affichage |
| 10 | Liste d'exclusion | `exclusions.csv` : les noms que tu ne veux pas voir dans le jeu |
| 11 | Sortie | `artists.json`, `labels.json`, et un **rapport** : nombre par genre, pays, catégorie ; lignes incomplètes ; changements depuis la version précédente |
| 12 | Relecture | Tu parcours le rapport (10 min), on corrige `seed.csv` et les tables, on relance |

**Fréquence** : une fois avant le lancement, puis **une fois par saison** (toutes les 4 semaines) si tu le souhaites, pour faire entrer les nouveaux artistes et rafraîchir la hype. Une nouvelle version n'écrase jamais l'état d'un artiste déjà en jeu dans un monde (07, § 7.7).

**Si les sources ouvertes ne suffisent pas pour la niche francophone** (probable pour 100 à 200 noms) : ils passent par `seed.csv`, avec seulement nom, genre et tags ; le reste est généré (catégorie « Niche » ou « Montant » par défaut).

## 9.6 Artistes inventés

- **Dans le catalogue** : ~150 artistes inventés fixes (pépites, artistes des labels inventés), écrits à la main ou générés puis relus, avec traits et risque de scandale.
- **Par monde** : générés à la demande (démos, rapports de scouts, centre de formation) à partir de la graine du monde : nom tiré de listes par pays (prénom, nom de scène, suffixe), genre selon la région, GEN 35-65, potentiel selon la chance de pépite.
- **Règle de nommage** : un nom généré est comparé au catalogue ; s'il ressemble trop à un vrai artiste, on retire.

## 9.7 Recherches faites le 11/11/2026 (pages publiques, lues une par une)

| Sujet | Ce que j'ai trouvé | Source |
|---|---|---|
| **Bedry** | Rappeur de Fontenay-sous-Bois, trap / cloud. Singles « Hasba » et « T'as dit nan » (2025), mixtape *Beewaba* (octobre 2026, 11 titres, 47e au classement SNEP). Proches : Sherifflazone, 63OG, 63KLUF, Bryan Countach, Mazenko, Jeune Morty, La Fève, Bu$hi ; même scène que Jäde et Norsacce | Deezer, Album of The Year, Billetweb |
| **Irko** | Né à Tirana, installé à Lyon depuis 2018. *Ghillie in the Mist* (2021), *Dirty Synths and Nice Bars* (2022, avec Meel B), *Danger Rapproché* (2023, avec amne). Proches : amne (Amnezzia), Meel B, abel31, 1863, 111SYRI, Giacoshi, Femtogo, Realo, Zoomy | Deezer, Rate Your Music |
| **Yass Boi** | Albums *777* (2022) et *LE VISAGE* (2025). Proches : 8stikram, Dracofeuu, H4mza, Matapland, L'Apache, Sarah Massok | Deezer |
| **8stikram** | *CHIMCHAR* (janvier 2025, 8 titres, dont « Vieux-Lille » avec Yass Boi), « J'suis down bad » (avec Yass Boi), « Murasame », « Voir l'avenir ». Proches : Yass Boi, Jäck Stone, Deagox | Deezer, Apple Music, SoundCloud |
| **AWA** | Arab With Attitude, label de Kore, créé chez Sony Music France (2018). Artistes : Zola, Nahir, Diddi Trix, Doria. Catalogue racheté par Sony, artistes passés chez RCA France | Billboard France, Booska-P |
| **Tractopelle Music** | Trouvé sous le nom **Tractopelle Musik / TractoLabel** : label de Monaco fondé en 2025 par MC Pao. Artistes cités : Alkpote, Veust, Coyote Jo Bastard, Taïpan, Baby Kirua, Tmax, Soleil Noir, J. Lord, Taxi B, Deuklo, Infinit'. Les listes diffèrent selon les pages (signés ou simples collaborations) | Sites du label, L'ADN |

Ce que je n'ai **pas** pu trouver : le nombre d'écoutes de chacun (les notes et les fans du jeu restent des estimations), la ville de la plupart des proches, et la confirmation que le Irko trouvé est bien celui auquel tu penses.
