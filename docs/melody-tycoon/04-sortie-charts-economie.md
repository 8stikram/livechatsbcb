# 04 — Sortie, charts, hype, fans, économie

> Tous les chiffres sont des **valeurs de départ**. Ils sont regroupés dans un fichier de réglages côté serveur et devront être ajustés avec un simulateur (voir 12).

## 4.1 Programmer une sortie

1. Choisir les sons du coffre et le **format** (03, § 3.10).
2. Ajouter le titre et la **pochette** (image envoyée par le joueur ; sinon une pochette générée avec les initiales).
3. Choisir le **marketing** (4.2).
4. Choisir la **semaine de sortie** : du prochain tick à 8 ticks plus tard. Le calendrier montre les sorties déjà annoncées des autres labels (titre masqué, mais artiste, genre et format visibles), les saisons et les événements.
5. Valider. Une sortie programmée peut être déplacée une fois (−2 de hype). L'annuler coûte 50 % du marketing engagé.

## 4.2 Marketing

Chaque option a un coût, une **portée** (personnes touchées), un genre où elle marche mieux, et un risque.

| Option | Coût | Portée | Marche mieux pour | Risque |
|---|---|---|---|---|
| Réseaux sociaux — posts simples | 0 € | 5 000 | Tous | — |
| Réseaux sociaux — campagne payée | 500 € / 3 000 € / 15 000 € | 20 000 / 150 000 / 900 000 | Rap, hyperpop, afro | 3 % de bad buzz |
| Affiches | 1 500 € / 10 000 € | 40 000 / 300 000 (une seule région) | Variété, pop, rap FR | — |
| Influenceurs | 3 000 € / 20 000 € / 100 000 € | 100 000 / 800 000 / 5 000 000 | Pop, danse, afro, hyperpop | 10 % : l'influenceur fait un flop ou un bad buzz (portée ÷ 2, hype −3). Chance de viral ×2 |
| Pitch playlists | 2 000 € | Tirage : 45 % rien ; 35 % petite playlist (80 000) ; 15 % moyenne (600 000) ; 5 % grosse (4 000 000). Chances ×(Q/70) | Tous | Refus = argent perdu |
| Clip vidéo | 5 000 € / 25 000 € / 120 000 € | 150 000 / 1 000 000 / 6 000 000, et qualité perçue +1 / +3 / +5 | Tous | Délai +1 tick ; 5 % de dépassement de budget (+30 %) |
| Radio | 10 000 € / 60 000 € | 500 000 / 4 000 000 | Variété, pop, R&B (×1,3) ; drill, hyperpop (×0,4) | — |

- Les options se cumulent. La portée totale est la somme, avec un rendement décroissant au-delà de 10 × les fans de l'artiste : la part au-dessus compte pour 50 %.
- **Budget marketing garanti** (contrat) : si le total dépensé pour un artiste sur 8 ticks est sous le montant promis → promesse non tenue (moral, réputation).

## 4.3 Streams de la première semaine

```
q        = Qualité / 70
F_eff    = fans de l'artiste + 0,5 × fans de l'invité
Portée   = (portée marketing + 0,5 × F_eff) × (1 + Hype / 50) × concurrence
Streams_fans       = F_eff × 3 × q² × bonus_format
Streams_découverte = Portée × 0,6 × Adéquation × q
S1 = (Streams_fans + Streams_découverte) × Chance
```

| Terme | Détail |
|---|---|
| bonus_format | Single 1 ; piste d'EP 1,2 ; piste d'album 1,4 ; freestyle 0,4 |
| concurrence | −10 % par sortie du même genre, la même semaine, d'un artiste qui a plus de fans (max −30 %) |
| Adéquation (A) | 0,5 à 1,5, voir 4.4 |
| Chance (C) | Tirage centré sur 1 (90 % des tirages entre 0,7 et 1,4). **Viral** : 2 % de chance (×2 avec influenceurs, +2 % avec « coup de génie ») → découverte ×3 à ×6 |

## 4.4 Adéquation au public

`A = 0,5 + (0,30 × affinité_genre + 0,30 × tendance_beat + 0,20 × tendance_thème + 0,20 × cohérence) / 100 + bonus`

| Terme | Plage | Source |
|---|---|---|
| affinité_genre | 0-100 | Affinité de l'artiste avec le genre du beat (0,60 → 40 ; 1,10 → 100) |
| tendance_beat | 0-100 | Tableau des tendances du mois, par région (50 = neutre) |
| tendance_thème | 0-100 | Idem |
| cohérence | 30-100 | Table thème × beat (08) |
| bonus | −0,1 à +0,2 | Saison (06), featuring qui ouvre une région (+0,05), son démodé (−0,01 par tick au coffre après 20 ticks) |

**Tendances** : renouvelées tous les 4 ticks. 3 beats et 2 thèmes montent (70-95), 2 beats et 1 thème descendent (15-35), le reste dérive doucement autour de 50. **Les sorties des joueurs influencent la tendance** : un beat qui place 3 sons ou plus dans le top 20 global monte de +10 au mois suivant.

## 4.5 Score de hit

`Score de hit = 50 × q × A × C × R`, borné entre 0 et 100, avec `R = 1 + 0,15 × log10(S1 / (3 × F_eff))` (la portée par rapport à ce que les fans seuls auraient donné).

| Score | Lecture | Effets |
|---|---|---|
| < 25 | Flop | Moral −5, hype −, réputation −1 si le marketing dépassait 20 000 € |
| 25-49 | Discret | — |
| 50-69 | Succès | Moral +6 |
| 70-89 | Hit | Hype +, réputation +0,5 |
| 90+ | Carton | Réputation +2, événement « tout le monde en parle » |

## 4.6 Vie d'un son après la première semaine

`S(t+1) = S(t) × r`, avec `r = 0,55 + 0,35 × Score de hit / 100` (un flop perd 45 % par semaine, un carton 10 %).

- **Fond de catalogue** : un son ne descend jamais sous `fans × 0,01 × q` streams par tick. Il y reste tant que le label existe.
- **Relances** : deluxe (repart de la semaine 2), sync (×2 pendant 2 ticks), buzz d'un clash (×1,3 pendant 2 ticks), été ou Noël pour les thèmes concernés.
- Total d'un son ≈ `S1 / (1 − r)` : ×2,2 pour un flop, ×4 pour un succès, ×10 pour un carton.

## 4.7 Hype et fans

**Hype** (0-100, par artiste) — volatile :

| Cause | Effet |
|---|---|
| Chaque tick | × 0,92 (elle retombe seule) |
| Sortie | + (Score de hit − 50) / 4 (de −12 à +12) |
| Top 10 global / top 10 d'un genre | +4 / +2 par tick passé dedans |
| Freestyle | +2 à +6 |
| Clash gagné / perdu | +10 / −6 |
| Scandale | −10 à −30 (ou +5 à +15 pour un Provocateur, tirage) |
| Festival, trophée | +5 à +15 |
| 6 ticks sans rien | −3 par tick en plus |

Effet : la hype multiplie la portée (`1 + Hype/50` : une hype de 100 triple la portée), les demandes de featuring et de contrat, le remplissage des salles.

**Fans** (par artiste) — durables :

| Cause | Effet |
|---|---|
| Sortie | `+ Streams_découverte × 3 % × q × A` |
| Concert | + 2 % des spectateurs (×2 avec Bête de scène+) |
| Featuring | + 2 % des fans de l'invité touchés |
| Festival | + 1 à 5 % selon la performance |
| 8 ticks sans sortie ni concert | −1 % par tick |
| Flop | −0,5 % |
| Scandale | −2 à −10 % |
| Changement de genre | −3 à −20 % (02) |

Les fans sont répartis par **région** (3 parts : région d'origine, deuxième région, reste du monde ; par défaut 60 / 25 / 15 %). Les nouveaux fans arrivent dans la région visée par le marketing.

**Superfans** : `superfans = fans × taux`, taux de 1 % au départ. +0,1 point par sortie notée 70 ou plus, +0,2 par concert en tête d'affiche, −0,3 par scandale. Entre 0,5 % et 5 %.

**Popularité du label** = somme des fans de ses artistes sous contrat (sert au classement).

## 4.8 Charts

Publiés à chaque tick, classés par streams du tick.

| Chart | Taille |
|---|---|
| Global — sons | Top 100 |
| Par genre (12 genres) — sons | Top 50 chacun |
| Par région (France-Belgique-Suisse, US, UK, Afrique, Reste du monde) — sons | Top 50 chacun |
| Projets (EP, albums, mixtapes) | Top 50 |
| Artistes (streams cumulés du tick) | Top 100 |
| Labels (joueurs et labels du jeu) | Tous |
| Classement de la party (labels des joueurs, score de saison en direct) | Tous |

- Chaque ligne montre : place, évolution (▲▼, nouvelle entrée), semaines dans le chart, meilleure place, streams, label.
- **Labels gérés par le jeu** : les artistes non signés par un joueur sortent des sons « de fond ». À chaque tick, le jeu tire environ 40 sorties parmi eux (plus un artiste est gros, plus il sort souvent, 1 fois tous les 6 à 20 ticks), avec une qualité tirée autour de leur GEN, et applique les mêmes formules. Les charts sont donc vivants dès le premier jour, et un joueur doit vraiment battre Universal pour être n°1.
- Entrer dans un top 100 pour la première fois déclenche une notification (06).

## 4.9 Réputation du label (0-100)

| Cause | Effet |
|---|---|
| Carton (score 90+) | +2 |
| Hit (70-89) | +0,5 |
| N°1 global | +3 (une fois par son) |
| Album noté 75 ou plus | +1 |
| Signer un artiste de GEN ≥ 85 | +2 |
| Coopération menée au bout | +1 |
| Trophée de fin de saison | +2 à +5 |
| Feedback apprécié | +0,5 |
| Flop avec gros marketing | −1 |
| Scandale mal géré | −2 à −10 |
| Promesse de contrat non tenue | −3 |
| Prêt d'urgence déclenché | −1 |
| Offre vexante (contrat ou featuring) | −0,5 |
| Clash perdu, défi refusé | −1 à −2 |

Effets : chances en négociation (contrats, featurings), qualité des démos reçues, accès aux gros artistes dans le scouting, taux de la banque, conditions de palier.

## 4.10 Revenus

**Formule générale par tick** :

`Revenus = streams × 0,004 € × part du label + édition + superfans + vente directe + live + merch + sync + sponsors − coûts`

| Source | Formule | Ordre de grandeur |
|---|---|---|
| Streaming | `streams × 0,004 €`. Le label garde `1 − royalties` (voir recoupement) | 1 M de streams = 4 000 € bruts |
| Droits d'auteur (édition) | `streams × 0,0006 €` si le contrat a la clause « édition » | +15 % |
| Superfans (club) | `superfans × 0,50 €` par tick, pour chaque artiste dont le « club » est activé (gratuit, mais l'artiste y passe 3 d'énergie par tick) | 1 000 superfans = 500 € par tick |
| Vente directe | À la sortie d'un EP ou album : `(superfans × 0,3 + fans × 0,002) × 12 €` de marge. Précommandes : la moitié arrive 1 tick avant | 100 000 fans, 1 500 superfans → 7 800 € |
| Live | Voir 4.11 | Principale source en milieu de partie |
| Merch | Voir 4.12 | 10 à 25 % du live |
| Sync | Voir 4.13 | Rare mais gros |
| Sponsors | Offre par événement quand la hype ≥ 60 : `5 000 € × (fans / 100 000)^0,6` pour 8 ticks. Rompu en cas de scandale | 1 M de fans → 20 000 € |

**Recoupement de l'avance** : tant que l'avance n'est pas remboursée, la part de royalties de l'artiste est retenue par le label et vient réduire le solde de l'avance. L'artiste ne touche donc que son allocation. Effets : moral −1 par tick après 12 ticks non recoupés ; un artiste recoupé gagne +5 de moral. Le joueur peut **effacer le solde** (geste commercial) : moral +10.

## 4.11 Live

**Demande par date** : `spectateurs = 3 × √fans × (1 + Hype/100) × région × usure × booker`

- région : 1 dans la région d'origine, 0,6 dans la deuxième, 0,3 ailleurs.
- usure : −15 % par date déjà jouée dans la même région sur les 4 derniers ticks.
- booker : +5 % par niveau.

| Salle | Places | Prix du billet | Coût fixe |
|---|---|---|---|
| Bar | 100 | 10 € | 100 € |
| Club | 500 | 18 € | 1 500 € |
| Salle | 2 000 | 30 € | 8 000 € |
| Grande salle | 6 000 | 45 € | 40 000 € |
| Arène | 15 000 | 65 € | 150 000 € |
| Stade | 60 000 | 80 € | 800 000 € |

`Bénéfice de la date = min(spectateurs, places) × prix × 0,7 − coût fixe`. La part de l'artiste est celle prévue au contrat (« partage live », 05).

- **Concert isolé** : réservable pour le tick suivant. **Tournée** : 4 à 20 dates sur plusieurs ticks, à annoncer 2 ticks avant ; coût de montage = 10 % des coûts fixes ; demande +10 %.
- Chaque date coûte de l'**énergie** (02) : en pratique 2 à 3 dates par tick au maximum, au détriment du studio.
- Salle remplie à moins de 40 % : hype −2, moral −3. À 80 % ou plus : moral +3.
- Santé vocale : chaque date au-delà de 2 par tick donne `(100 − santé vocale) / 10 %` de risque de blessure (indisponible 2 à 4 ticks).

| Fans | Hype | Spectateurs (à domicile) | Meilleure salle | Bénéfice par date |
|---|---|---|---|---|
| 3 200 | 12 | 190 | Bar (plein) | 600 € |
| 100 000 | 30 | 1 230 | Salle (62 %) | 17 900 € |
| 1 000 000 | 40 | 4 200 | Grande salle (70 %) | 92 000 € |
| 10 000 000 | 60 | 15 200 | Arène (pleine) | 532 000 € |
| 80 000 000 | 80 | 48 300 | Stade (80 %) | 1 900 000 € |

## 4.12 Merch

- Le joueur commande un **lot** par artiste : nombre de pièces × 8 € de coût. Prix de vente : 25 € (réglable de 15 à 40 €, la demande bouge en sens inverse).
- **Demande par tick** = `(superfans × 0,3 + fans × 0,0005 × (1 + Hype/100)) × attrait_merch / 50`, ×2 les ticks de concert, ×2 pendant Noël.
- Le stock invendu reste en stock ; au bout de 12 ticks, il peut être bradé à 5 €.
- Une collection (lot) liée à un album sorti dans les 4 ticks : demande +30 %.

## 4.13 Sync

À chaque tick, pour chaque son dont le label détient le master :

`chance = 0,3 % × (potentiel_sync / 50) × (Qualité / 70) × (1 + 0,4 × niveau de l'agent sync)`

`gain = 2 000 € × √(1 + fans / 100 000) × tirage entre 0,5 et 3`

Le joueur reçoit une carte (« une marque de sport veut "Rue Glacée" ») : accepter (gain et streams ×2 pendant 2 ticks), négocier (jet : +50 % ou offre perdue), refuser (certains artistes « intègres » gagnent +5 de moral).

## 4.14 Coûts

| Coût | Quand | Montant |
|---|---|---|
| Avance | À la signature | Selon le contrat (05) |
| Allocation des artistes | Chaque tick | Selon le contrat |
| Production | À la création | Somme des 5 choix + embrouilles (03) |
| Marketing | À la programmation | 4.2 |
| Frais de sortie | À la sortie | 03, § 3.10 |
| Staff | Chaque tick | 300 à 12 000 € par personne (02) |
| Frais fixes du label | Chaque tick | Maison 200 € ; Underground 1 000 € ; Respecté 5 000 € ; Mainstream 20 000 € ; Empire 80 000 € ; Divin 300 000 € |
| Centre de formation | Chaque tick | 300 € par artiste en formation |
| Tournée | Par date | Coût fixe de la salle |
| Royalties | Chaque tick | Part de l'artiste, une fois l'avance recoupée |
| Pénalités | Événement | Rupture de contrat, procès, promesse non tenue |
| Intérêts et remboursements | Chaque tick | 05, banque |

## 4.15 Valeur du catalogue

Pour chaque son dont le label détient le **master** :

`valeur = revenu net de streaming du dernier tick × min(20, 1 / (1 − r))`

(un son arrivé au fond de catalogue vaut 20 fois son revenu hebdomadaire). **Valeur du catalogue** = somme. Elle sert au classement, au prêt sur patrimoine et au test de faillite. Si l'artiste détient ses masters (contrat de licence), le son ne compte pas.

## 4.16 Équilibre : repères par étape de jeu

| Étape | Fans de la tête d'affiche | Qualité typique | S1 d'un single | Revenu total du single | Live par tick | Coûts fixes par tick |
|---|---|---|---|---|---|---|
| Label Maison, début | 3 000 | 50-65 | 15 000 à 55 000 | 150 à 900 € | 600 à 1 200 € | 200 € |
| Underground | 100 000 | 65-75 | 450 000 | ~8 000 € | 18 000 à 36 000 € | 1 000 € + staff ~3 000 € |
| Respecté | 1 000 000 | 70-80 | 4 000 000 | ~80 000 € | 90 000 à 180 000 € | 5 000 € + staff ~20 000 € |
| Mainstream | 10 000 000 | 75-88 | 40 000 000 | ~900 000 € | 0,5 à 1 M€ | 20 000 € + staff ~80 000 € |
| Empire | 80 000 000 | 85-95 | 400 000 000 | ~8 M€ | 2 à 4 M€ | 80 000 € + staff ~250 000 € |

Lecture : au début, **le streaming ne paie pas** (exprès : il faut des millions de streams). Le petit label vit de la débrouille et des concerts dans les bars, et investit pour **gagner des fans**. Le streaming devient rentable vers 300 000 fans.

## 4.17 Exemple complet : une sortie

> **« Rue Glacée »**, single de Nova Kalé (qualité 68, fans 3 200, hype 12), sortie au tick 11.
> Marketing : campagne réseaux à 500 € (20 000) + affiches à 1 500 € (40 000). Total 2 000 €.
> Adéquation : affinité rap FR 1,05 → 94 ; lovetrap en tendance (80) ; thème Rupture neutre (50) ; cohérence 95. `A = 0,5 + (28 + 24 + 10 + 19) / 100 = 1,31`.
> q = 0,971. Portée = (60 000 + 1 600) × 1,24 = 76 400.
> Streams des fans = 3 200 × 3 × 0,943 = 9 060. Découverte = 76 400 × 0,6 × 1,31 × 0,971 = 58 310. Chance tirée : 1,08.
> **S1 = 72 800 streams** → 291 € bruts.
> Score de hit : R = 1 + 0,15 × log10(72 800 / 9 600) = 1,13 → `50 × 0,971 × 1,31 × 1,08 × 1,13 = 78` → **Hit**. r = 0,82 → total attendu ≈ 400 000 streams ≈ **1 600 €**.
> Nouveaux fans : 58 310 × 3 % × 0,971 × 1,31 = **+2 225 fans** (3 200 → 5 425). Hype : +7 → 19.
> Entrée 38e du chart Rap FR. Moral +6, réputation +0,5.
> Bilan : coût total 5 670 € (production 3 670 + marketing 2 000) pour 1 600 € de streams — **une perte assumée** qui fait passer l'artiste de 3 200 à 5 425 fans et remplit mieux ses prochains concerts.
