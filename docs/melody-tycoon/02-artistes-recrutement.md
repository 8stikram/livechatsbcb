# 02 — Artistes, recrutement, staff, moral

## 2.1 Attributs (notés de 1 à 99)

| Famille | Attribut | Sert à |
|---|---|---|
| Technique | Voix | Qualité des sons chantés, R&B, pop |
| Technique | Écriture | Qualité (surtout rap), thème « libre » |
| Technique | Instrument | Qualité pop/rock, live |
| Technique | Production | Qualité électro/hyperpop, bonus si l'artiste produit lui-même |
| Technique | Performance scénique | Live, festivals |
| Mental | Créativité | Qualité, chance de son « viral », résistance à la page blanche |
| Mental | Discipline | Moins d'embrouilles en studio, moins de retards |
| Mental | Résilience | Moral qui baisse moins après un flop ou un clash |
| Mental | Charisme | Hype gagnée, clashs, négociation de sponsors |
| Mental | Professionnalisme | Respect du contrat, moins de scandales |
| Mental | Gestion médiatique | Conférences de presse, réponse aux scandales |
| Énergie | Endurance | Énergie récupérée par tick |
| Énergie | Santé vocale | Risque de blessure vocale en tournée ou en enchaînant les sons |
| Énergie | Résistance à la tournée | Énergie perdue par date de concert |
| Énergie | Fatigue créative | Jauge 0-100 qui monte à chaque son (voir 2.3) |
| Commercial | Fanbase | Nombre de fans (ressource) |
| Commercial | Superfans | Part des fans très engagés (1 à 5 %) |
| Commercial | Hype | 0-100 (ressource) |
| Commercial | Potentiel de sync | Chance de placer un son dans une pub, une série, un jeu |
| Commercial | Attrait merchandising | Ventes de merch |

**Note générale (GEN)** = moyenne pondérée des attributs techniques et mentaux, selon la famille de genre :

| Famille de genre | Voix | Écriture | Instrument | Production | Scène | Créativité |
|---|---|---|---|---|---|---|
| Rap (rap FR/US, drill, trap) | 20 % | 35 % | 0 % | 10 % | 15 % | 20 % |
| Chant (R&B, pop, afro, variété) | 40 % | 15 % | 10 % | 5 % | 15 % | 15 % |
| Machines (électro, hyperpop, club) | 15 % | 10 % | 10 % | 35 % | 10 % | 20 % |
| Groupe (rock, alternatif) | 25 % | 20 % | 25 % | 5 % | 15 % | 10 % |

Cette même pondération donne la **compétence artistique** (C_art) utilisée dans la formule de qualité (03).

## 2.2 Potentiel dynamique

- **Note actuelle** : GEN, visible.
- **Potentiel** : caché. Affiché comme une **fourchette** (ex. 70-85), plus ou moins large selon la qualité du scouting (voir 2.6).
- **Profil de croissance** (caché au départ, révélé par un coach de niveau 3 ou plus, ou après 8 ticks sous contrat) :

| Profil | Comportement |
|---|---|
| Précoce | +50 % de progression les 20 premiers ticks, puis −50 % |
| Tardif | −30 % les 20 premiers ticks, puis +40 % |
| Régulier | Progression constante |
| Explosif | Progression tirée entre 0 et ×3 chaque tick, très variable |
| Fragile | Progression ×1,3, mais régression deux fois plus rapide (inactivité, flop) |
| Late bloomer | Presque rien, puis un bond de +4 à +8 après son 6e son noté 65 ou plus |

**Progression par tick** (appliquée aux attributs techniques et mentaux, un attribut tiré au hasard à la fois) :

`points = 0,25 × profil × (activité + scène + coaching) × facteur_moral × marge`

- activité : 1 si un son a été créé ce tick, sinon 0 ; +0,5 si le dernier son sorti a un score de hit de 60 ou plus.
- scène : +0,5 par concert joué ce tick (max 1).
- coaching : +0,3 par niveau du coach affecté (max 1,5).
- facteur_moral : moral / 60 (entre 0,2 et 1,5).
- marge : `(potentiel − GEN) / 20`, borné entre 0,1 et 1. Plus l'artiste est près de son plafond, plus il ralentit.

Quand les points cumulés atteignent 1, un attribut gagne +1.

**Dépasser son plafond** : 3 sons d'affilée avec une qualité finale ≥ GEN + 5 → le potentiel monte de +1 (max +6 par saison).

**Régression** : 6 ticks sans son créé ni concert → −1 sur un attribut technique tous les 3 ticks (tous les 1,5 tick pour un Fragile). Un coach affecté stoppe la régression.

## 2.3 Énergie, fatigue créative, page blanche

- **Énergie** 0-100. Récupération par tick : `25 × endurance / 70`. Dépenses : son (10 à 35, voir 03), concert (8 × (1,5 − résistance_tournée/100)), tournage de clip (5), clash (5).
- **Fatigue créative** 0-100 : +12 par son créé, −8 par tick. Au-dessus de 70 : qualité −3 et chance de **page blanche** 25 % à chaque tentative de création.
- **Page blanche** : l'artiste ne peut plus créer pendant 1 à 3 ticks. Raccourcis : coach (−1 tick), « voyage d'inspiration » (2 000 €, fin immédiate, +5 de moral), changer de thème avec un co-auteur.

Profils d'énergie (un par artiste) :

| Profil | Effet |
|---|---|
| Normal | Rien |
| Bourreau de travail | Récupération +30 %, fatigue créative +20 % |
| Lazy | Coût en énergie +5 par son, récupération −20 % |
| Par à-coups | Un tick sur trois, récupération ×2 ; sinon ×0,6 |
| Oiseau de nuit | Coût −5 en Home Studio, +5 en studio pro et prestige |

## 2.4 Compétences signature et traits

- **Compétence signature** = une capacité. 0 à 3 par artiste. Deux niveaux : base et **« + »**. Le « + » se débloque après 10 sons sortis qui utilisent la compétence, ou quand la GEN atteint 80.
- **Trait** = un comportement. 1 à 3 par artiste. Il ne monte pas de niveau. Il peut changer via un événement.

Listes complètes dans 08. Exemples :

| Type | Nom | Effet base | Effet « + » |
|---|---|---|---|
| Compétence | Refrain contagieux | +10 % de streams de découverte | +20 %, et décroissance plus lente (+0,03) |
| Compétence | Plume acérée | Thème « libre » compte comme une séance d'écriture | Compte comme un co-auteur ; +10 en clash |
| Compétence | Bête de scène | Remplissage des salles +15 % | +30 %, fans gagnés en concert ×2 |
| Compétence | Perfectionniste | Fourchette de qualité resserrée de 3 | Resserrée de 5, mais le son coûte +5 d'énergie |
| Trait | Fêtard | Risque de scandale ×2, hype +1 par tick | — |
| Trait | Anxieux | Moral −3 de plus après un flop, pas de clash possible | — |
| Trait | Leader | Moral du label +3, accepte mal un rôle de remplaçant | — |
| Trait | Provocateur | Clashs possibles et +10 au score de clash, bad buzz ×1,5 | — |
| Trait | Discret | Risque de scandale ×0,5, hype gagnée −15 % | — |

## 2.5 Genres, affinités, changement de genre

- Chaque artiste a un **genre principal**, 0 à 2 **genres secondaires** et une **affinité** par genre (de 0,60 à 1,10).
- L'affinité multiplie C_art dans la formule de qualité quand le beat appartient à ce genre.
- Genre principal : 1,00 à 1,10. Secondaire : 0,85 à 0,95. Genre voisin : 0,75. Genre éloigné : 0,60.
- **Presets compatibles** : chaque genre liste ses beats (08). Hors liste, le beat reste possible, mais l'affinité est celle d'un genre éloigné.

**Changer de genre principal** (inspiré du changement de poste) :

| Règle | Valeur |
|---|---|
| Durée de transition | 4 ticks avec un producteur maison ou un coach qui a ce genre ; 8 ticks sinon |
| Coût | 3 000 € × palier du label (Maison = 1 … Divin = 6) |
| Pendant la transition | C_art −15 % sur tous les genres |
| Affinité de départ dans le nouveau genre | 0,80, puis +0,03 par son sorti (max 1,10) |
| Ancien genre | Devient secondaire (0,90) |
| Réaction des fans | Genre voisin : −3 % de fans. Genre éloigné : −8 à −20 % (tirage), réduit de moitié par un community manager de niveau 3 ou plus |
| Nouvelle audience | Les sons du nouveau genre ont +25 % de portée de découverte pendant 8 ticks |
| Limite | 1 changement par artiste et par saison, 3 par label et par saison |
| Moral | −10 si l'artiste ne l'a pas demandé ; +10 s'il l'a demandé (événement) |

## 2.6 Scouting (A&R)

- Un **scout** est un membre du staff (niveau 1 à 5). Un scout = une mission à la fois.
- **Mission** : région (France, Belgique-Suisse, US, UK, Afrique, Amérique latine, Europe du Nord) + genre (ou « tous ») + durée (2, 4 ou 6 ticks) + budget (500 à 10 000 €).
- À la fin, un **rapport** de 3 à 8 profils, vrais ou inventés selon la région et le budget.

Précision du rapport :

| Donnée | Formule |
|---|---|
| Nombre de profils | 3 + niveau du scout (max 8) |
| Erreur sur la note actuelle | ± (12 − 2 × niveau) points |
| Largeur de la fourchette de potentiel | 30 − 4 × niveau − 2 × (durée/2) points, minimum 6 |
| Traits révélés | 20 % × niveau de chances par trait |
| Chance d'une « pépite » (potentiel ≥ 85) | 2 % + 1 % × niveau + 1 % par tranche de 2 500 € de budget |

- **Observer encore** un profil : 2 ticks et 500 € de plus → erreur et largeur réduites de moitié.
- Les rapports des autres joueurs ne sont pas visibles. Deux joueurs peuvent donc repérer la même pépite : le premier qui signe gagne.
- Accès : les artistes de GEN ≥ 80 n'apparaissent dans les rapports que si le label est au palier Respecté ou plus.

## 2.7 Soumissions et feedback

À chaque tick, le label reçoit **2 à 5 démos** d'artistes inventés non signés (plus le label est réputé, plus elles sont bonnes). Pour chaque démo, 3 actions :

| Action | Effet |
|---|---|
| Ignorer | Rien. La démo disparaît au bout de 3 ticks |
| Donner un feedback (3 par tick max) | Tirage : 30 % le potentiel est révélé précisément ; 40 % l'artiste progresse (+2) et la réputation du label monte de +0,5 ; 20 % rien ; 10 % l'artiste le prend mal → **rivalité** (il signe chez un autre label du monde et gagne +10 en clash contre toi) |
| Signer | Ouvre la négociation (05) |

Feedback « encourageant » ou « cash » : le feedback cash double la chance de révéler le potentiel, mais triple le risque de rivalité si l'artiste a le trait Fier.

## 2.8 Centre de formation

- Disponible dès le début avec **1 place**. Places par palier : 1 / 2 / 4 / 6 / 10 / 20.
- **Créer un artiste** : 2 000 €. Le joueur choisit **seulement le pseudo**. Tout le reste est tiré au hasard : GEN 35-50, potentiel 55-92, genre, attributs, 1 trait, profil de croissance.
- **Orienter** (gratuit dans les 2 premiers ticks, puis même règle que le changement de genre) : genre principal, style (2 tags), rôle (rappeur, chanteur, artiste-producteur, auteur).
- **Formation** : 300 € par tick. Progression ×1,5 pendant la formation. Pas de son commercial, mais 1 freestyle possible tous les 4 ticks (pour tester).
- **Promotion** dans l'effectif après 6 ticks minimum : contrat « maison » automatique (12 mois de jeu, royalties 15 %, pas d'avance), moral +15. Si on le promeut avant 6 ticks : moral −10 et profil « Fragile » pendant 10 ticks.
- Un artiste formé au label a +10 de moral permanent tant qu'il y reste (« enfant du label »).

## 2.9 Staff

Places de staff par palier : 2 / 4 / 8 / 12 / 20 / 40. Salaire par tick selon le niveau : 300 / 800 / 2 000 / 5 000 / 12 000 €.

| Poste | Effet par niveau |
|---|---|
| Scout A&R | Missions de scouting (2.6) |
| Directeur artistique | Fourchette de qualité resserrée (−1 par niveau), chance d'embrouille −3 % par niveau |
| Coach (voix et scène) | Progression (2.2), stoppe la régression, raccourcit la page blanche |
| Producteur maison | Un producteur toujours disponible et gratuit, de niveau 40 + 10 × niveau, avec 2 beats en affinité A |
| Community manager | Portée des réseaux sociaux +15 % par niveau, bad buzz −10 % par niveau |
| Attaché de presse | Réussite des conférences de presse +5 % par niveau, dégâts des scandales −10 % par niveau |
| Booker | Remplissage des salles +5 % par niveau, énergie des concerts −5 % par niveau |
| Juriste | Montre 1 attente de l'agent par niveau en négociation ; coût des procès −15 % par niveau |
| Directeur financier | Taux des prêts −0,1 point par niveau ; prévisions de trésorerie à 4 ticks |
| Agent sync | Chance de sync +40 % par niveau |

Le staff se recrute dans l'onglet Staff : 6 candidats renouvelés tous les 4 ticks. Licencier coûte 2 ticks de salaire.

## 2.10 Moral et hiérarchie

**Moral** de chaque artiste : 0-100, départ à 60. **Moral du label** = moyenne pondérée par le statut.

| Cause (par tick, sauf indication) | Effet |
|---|---|
| Son sorti avec un score de hit ≥ 60 | +6 (une fois) |
| Flop (score de hit < 25) | −5 (−8 si Anxieux) |
| Pas de sortie depuis plus longtemps que promis au contrat | −2 par tick |
| Promesse de rôle non tenue | −5 par tick |
| Injustice salariale (voir ci-dessous) | −4 par tick |
| Énergie < 20 | −3 |
| Avance non recoupée depuis plus de 12 ticks | −1 |
| Coach affecté | +1 |
| Concert réussi (salle remplie à 80 % ou plus) | +3 |
| Un Leader dans le label | +3 pour tous (non cumulable) |

| Seuil | Conséquence |
|---|---|
| Moral < 40 | Chance d'embrouille en studio +15 % |
| Moral < 30 | 30 % de refus de créer ; demande de transfert (événement) |
| Moral < 15 | Grève : aucun son ; l'artiste peut activer sa clause de sortie |
| Moral > 80 | Qualité +2 à +5, progression accélérée |

**Statuts** (calculés chaque tick selon GEN + fans, mais le contrat peut en *promettre* un) :

| Statut | Part de l'effectif | Attente |
|---|---|---|
| Tête d'affiche | Les 10 % du haut (au moins 1) | 1 sortie toutes les 4 semaines, le plus gros budget marketing |
| Établi | 30 % suivants | 1 sortie toutes les 6 semaines |
| Espoir | 40 % suivants | 1 sortie toutes les 8 semaines |
| Développement | Le reste | Du coaching, 1 freestyle de temps en temps |

**Hiérarchie salariale** : pour chaque artiste, le jeu calcule sa **rémunération garantie par tick** = allocation hebdomadaire + avance ÷ durée du contrat en ticks.

- Si un artiste de statut inférieur a une rémunération garantie supérieure de plus de 10 % à celle d'un artiste de statut supérieur → **injustice** pour ce dernier : moral −4 par tick et carte événement « Tension salariale » (augmenter, promettre une prime, expliquer, ignorer).
- **Pépite surpayée trop tôt** : un Espoir ou Développement dont la rémunération dépasse 2 fois la médiane du label prend le trait temporaire « Grosse tête » (discipline −10, progression −30 %) pendant 8 ticks.
- L'écran Dynamique du label (10) montre la grille des rémunérations triée par statut, avec les anomalies en rouge.

## 2.11 Exemple d'artiste

> **Nova Kalé** — inventée, Lyon (France). Rap FR, secondaire R&B.
> GEN 54 (voix 58, écriture 61, instrument 20, production 35, scène 44, créativité 60). Potentiel affiché 72-84 (réel : 79). Profil : Tardif.
> Discipline 66, résilience 48, charisme 57, professionnalisme 70, médias 40.
> Endurance 72 (récupère 26 par tick), santé vocale 65, tournée 50. Profil d'énergie : Oiseau de nuit.
> Fans 3 200, superfans 1 % (32), hype 12, sync 30, merch 45.
> Compétence : Refrain contagieux (base). Traits : Anxieuse, Discrète.
> Valeur marchande : 9 200 €. Demande : avance 1 500 €, royalties 22 %, 18 mois de jeu, statut Espoir.
