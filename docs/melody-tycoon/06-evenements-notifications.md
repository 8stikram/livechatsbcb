# 06 — Événements, scandales, saisons, notifications

## 6.1 Familles d'événements

| Famille | Quand | Portée | Exemple |
|---|---|---|---|
| Événements de studio | Entre chaque étape de la création (03) | Personnel | « Le producteur ne répond plus » |
| Événements de label | Au tick, 0 à 3 par label | Personnel | « Tension salariale », « Un artiste veut un clip » |
| Opportunités | Au tick, ~1 tous les 3 ticks | Personnel | Sync, sponsor, invitation en première partie |
| Scandales | Rares (6.3) | Personnel, mais **visible** par la party si l'artiste a plus de 100 000 fans | Bad buzz, procès |
| Événements de monde | Calendrier ou tirage | Toute la party | Festival, tendance, Nuit des Charts, faillite d'un label |
| Événements saisonniers | Calendrier de jeu (6.4) | Toute la party | Été, Noël |

**Règles communes** :
- Une carte = un titre, 2 lignes de contexte, 2 à 4 réponses avec leurs effets **annoncés en clair** (les montants sont exacts, les jets affichent leur pourcentage).
- Une carte non traitée expire après 2 ticks : la réponse « ignorer » s'applique.
- Jamais plus de 3 cartes en attente par label (le surplus est reporté).
- Chaque label a un « budget de malchance » : après un événement négatif subi, la chance d'en tirer un autre est divisée par 2 pendant 3 ticks.

## 6.2 Événements de label (extraits ; liste complète dans 08)

| Événement | Déclencheur | Réponses |
|---|---|---|
| Tension salariale | Injustice dans la hiérarchie (02) | Augmenter l'allocation ; promettre une prime ; expliquer (jet sur le professionnalisme) ; ignorer (moral −4 par tick) |
| « Je veux un clip » | Artiste Établi ou plus, 2 sorties sans clip | Payer un clip sur la prochaine sortie ; promettre (promesse à tenir sous 8 ticks) ; refuser (moral −6) |
| Demande de transfert | Moral < 30 | Promettre un rôle ; augmenter ; mettre sur la liste des transferts ; refuser (moral −5, clause de sortie possible) |
| Offre d'un rival | Artiste de GEN ≥ 70 dont le contrat finit dans moins de 8 ticks | Renégocier maintenant ; laisser venir |
| Artiste recoupé | L'avance est remboursée | Fêter ça (500 €, moral +8) ; rien (moral +5) |
| Envie de changer de genre | Artiste à forte créativité, 6 sorties dans le même genre | Accepter (changement de genre à moitié prix, moral +10) ; refuser (moral −5) |
| Nuit blanche productive | Bourreau de travail, moral > 70 | Un son bonus démarre avec 2 choix « fluides » garantis |
| Fuite d'un son | 2 % par son dans le coffre depuis plus de 6 ticks | Sortir en urgence (sans marketing, hype +5) ; ignorer (le son perd 20 % de sa découverte) |
| Un artiste du label propose un featuring interne | Deux artistes avec relation +2 | Accepter (featuring gratuit, qualité +2) ; refuser |
| Première partie | Artiste < 100 000 fans, label de réputation ≥ 20 | Accepter (15 d'énergie, fans +5 à +15 %) ; refuser |

## 6.3 Scandales

**Rares mais marquants.** Chance par artiste et par tick :

`chance = 0,3 % × risque (0,5 à 3, tiré par monde) × traits (Fêtard ×2 ; Provocateur ×1,5 ; Discret ×0,5) × (1 + hype/100) × (1,3 si moral < 30)`

→ pour un label de 10 artistes « normaux » : environ 1 scandale par saison.

**Règle de protection (H3)** : les types marqués ★ ne peuvent toucher que des **artistes inventés**. Un vrai artiste ne peut avoir que « Bad buzz », « Clash » et « Départ ».

| Type | Effet immédiat | Durée |
|---|---|---|
| Bad buzz (une phrase, une vidéo) | Hype −10 à −20, fans −2 % | 2 ticks |
| Clash non voulu (un autre artiste l'attaque) | Voir guerres (05), sans l'avoir choisi | 2 ticks |
| Départ (il veut quitter le label publiquement) | Moral du label −5, réputation −2 | Jusqu'à résolution |
| ★ Procès (contrat, sample) | Risque d'amende : 5 à 30 % des revenus du son concerné, ou 1 à 4 ticks de revenus de l'artiste | 3 à 6 ticks |
| ★ Plagiat | Le son peut être retiré : ses revenus tombent à 0 ; réputation −3 | 3 ticks |
| ★ Problème de santé | Artiste indisponible 2 à 6 ticks | — |
| ★ Addiction (« excès ») | Discipline −15, énergie −30 %, risque de rechute | 6 à 12 ticks |

**Réponses possibles** (toutes ne sont pas proposées pour chaque type) :

| Réponse | Coût | Effet typique |
|---|---|---|
| **Communiquer** (excuses, explication) | Gratuit ; jet sur la gestion médiatique + attaché de presse | Réussite : dégâts ÷ 2. Échec : dégâts inchangés, hype −3 |
| **Payer** (arrangement, cure, avocat) | 5 à 30 % de la valeur de l'artiste | Dégâts ÷ 3, pas de jet. Santé et addiction : durée ÷ 2 |
| **Nier** | Gratuit | 50 % : le scandale s'éteint (aucun dégât). 50 % : il enfle (dégâts ×2, réputation −3) |
| **Licencier / suspendre** | Indemnité = allocation restante + avance non recoupée perdue | Réputation +1 (« label ferme ») ou −2 si l'artiste était très aimé (fans > 1 M) ; moral du label −5 ; l'artiste devient libre et garde une rancune |
| **Soutenir publiquement** | Gratuit | Moral de l'artiste +15, superfans +0,2 point ; dégâts de hype inchangés |

**Exemple de crise**
> Tick 19. **Sixto Vega** (inventé, Fêtard, 240 000 fans, hype 55, tête d'affiche du label) : **bad buzz** — une vidéo de soirée tourne. Hype −15, fans −2 % annoncés. Toute la party est notifiée.
> Choix : Communiquer (jet à 52 % : médias 45 + attaché de presse niveau 2) ; Payer une agence (18 000 €) ; Nier (50/50) ; Soutenir.
> Le joueur a une sortie d'album dans 2 ticks. Il **paie** : hype −5, fans −0,7 %. Coût : 18 000 €. L'album sort avec une hype de 50 au lieu de 40 : environ +8 % de portée, soit ~15 000 € de revenus en plus sur la durée — le pari est à peu près neutre en cash, mais il protège la place dans les charts.

## 6.4 Saisonnalité (calendrier de jeu, année de 52 ticks)

| Période | Semaines | Effets |
|---|---|---|
| Rentrée de janvier | 1-4 | Marketing −20 % (peu de concurrence), démos reçues +1 |
| Saint-Valentin | 6-7 | Thèmes Amour, Rupture, Love toxique : adéquation +0,15 ; beat lovetrap : tendance +20 |
| Trophées de mi-année | 14 | Voir Festival du Serveur |
| Printemps des festivals | 18-23 | Demande live +15 % |
| **Été** | 24-35 | Thèmes Fête, Danse, Voyage, Soleil : +0,15 ; beats afro, dancehall, jersey club, amapiano : tendance +15 ; live +30 % ; streams des thèmes Mélancolie −10 % |
| **Rentrée** | 36-40 | Albums : streams des fans +15 % ; radio ×1,2 ; concurrence des labels du jeu +50 % (ils sortent beaucoup) |
| Automne | 41-47 | Thèmes Mélancolie, Nostalgie, Santé mentale : +0,10 |
| **Noël / fin d'année** | 48-52 | Merch ×2, vente directe ×1,5, sponsors +20 % ; rétrospective de l'année (classement spécial) |

Comme une saison (28 ticks) est plus courte qu'une année de jeu (52), chaque saison traverse des périodes différentes : la saison 1 va de janvier à mi-juillet, la saison 2 de mi-juillet à janvier, etc. Deux saisons ne se ressemblent donc pas.

**Événements de tendance** (tirage, ~2 par saison, toute la party) : « Un beat explose sur les réseaux » (tendance +30 pendant 4 ticks), « Le public sature » (un beat −25), « Nouvelle scène » (une région double ses démos de qualité pendant 6 ticks).

## 6.5 Notifications

**Où** : (1) une pastille sur la carte Melody Tycoon dans l'onglet Jeux ; (2) un centre de notifications dans le jeu (cloche) ; (3) un résumé « Pendant ton absence » à l'ouverture. Pas de notification Discord et rien par-dessus les autres jeux dans le MVP.

| Type | Exemple | Qui la reçoit | Priorité |
|---|---|---|---|
| Événement de label | « Liha veut un clip » | Le joueur concerné | Normale |
| Carte qui expire | « Plus que 1 tick pour répondre » | Le joueur concerné | Haute |
| Résultat de sortie | « Rue Glacée : 72 800 streams, 38e Rap FR » | Le joueur concerné | Normale |
| Entrée dans un top 100 | « Rue Glacée entre dans le top 100 global ! » | Le joueur concerné (toute la party si top 10) | Haute |
| Offre de contrat, de transfert, de featuring, de prêt | « Le label de Tom propose 40 000 € pour Liha » | Les deux joueurs concernés | Haute |
| Contrat qui se termine | « Le contrat de Nova finit dans 4 semaines » | Le joueur concerné | Haute |
| Finances | Prêt d'urgence, compteur de faillite, mensualité | Le joueur concerné | Critique |
| Scandale | « Bad buzz pour Sixto Vega » | Le joueur ; toute la party si l'artiste a plus de 100 000 fans | Haute |
| Guerre | Conférence de presse, clash, défi de charts | Les deux joueurs ; toute la party pour le résultat | Haute |
| Événement de monde | Festival, Nuit des Charts, tendance, trophées | **Toute la party** | Normale |
| Vie de la party | Montée de palier d'un joueur, n°1 global, faillite, nouveau joueur | **Toute la party** | Normale |
| Tick | « La semaine 12 est tombée » | Toute la party (silencieuse : pastille seulement) | Basse |

**Règle** : un événement qui touche plusieurs labels ou qui change le classement → toute la party. Un événement sans effet sur les autres → seulement le joueur concerné.

- Les notifications de plus de 14 ticks sont supprimées (sauf le palmarès).
- Réglages par joueur (onglet Paramètres) : couper une catégorie, ne garder que « haute et critique ».
