# 07 — Données, stockage, intégration technique

## 7.1 Ce qui existe déjà (on ne le refait pas)

| Brique | Où | Réutilisée pour |
|---|---|---|
| Connexion Discord, sessions, accès aux serveurs | `services/party` — objet `Directory` | Savoir qui est le joueur et de quel serveur il est membre |
| Party par serveur Discord | objet `Party` (identifiant dérivé du serveur) | Liste des membres, présence |
| Stockage SQLite dans les Durable Objects | `ctx.storage.sql` | Même technique pour le monde Melody |
| Bucket R2 `MEDIA` | `livechatsbcb-media` | Pochettes (dossier séparé, voir 7.5) |
| Types partagés | `packages/protocol` | Messages Melody (nouveau fichier) |
| Onglet Jeux | application de bureau (`apps/desktop`) | Carte Melody Tycoon au-dessus des jeux de party |

## 7.2 Architecture proposée

- **Un nouvel objet Durable `MelodyWorld`**, un par serveur Discord (même identifiant que la party du serveur). Il contient **toute** la partie de ce serveur dans sa propre base SQLite. Il est séparé de `Party` : les jeux de party restent légers.
- **Le serveur fait autorité** : le client envoie des *intentions* (« je choisis ce producteur »), le serveur vérifie (cash, énergie, règles), tire les dés, enregistre et renvoie le résultat. Ce n'est pas de l'anti-triche avancé : c'est juste que les tirages et l'argent vivent au même endroit.
- **Le tick** : une **alarme** de l'objet, programmée pour 06:00 Europe/Paris. Un tick = un seul traitement, qui écrit le moins de lignes possible (7.6).
- **Communication** : requêtes HTTP simples (`/v1/melody/<serveur>/…`) pour lire et agir. Pas de connexion permanente : ce jeu n'a pas besoin de temps réel. Si la party est ouverte, un petit message « quelque chose a changé » passe par la connexion existante de la party, pour rafraîchir l'écran.
- **Données fixes** (catalogue d'artistes, labels, beats, thèmes, cartes, réglages) : fichiers JSON dans un nouveau paquet `packages/melody-data`, embarqués à la fois dans le serveur et dans l'application. Ils ne sont **pas** recopiés dans chaque monde : un monde ne stocke que ce qui a **changé** par rapport au catalogue.
- **Hasard reproductible** : chaque monde a une graine. Les sorties des labels du jeu et la dérive des tendances sont **recalculées** à partir de la graine et du numéro du tick, sans être stockées.

## 7.3 Schéma de base de données (par monde)

Types : `id` = texte court ; `€` = entier en centimes ; `tick` = entier ; `json` = texte JSON.

### world (la « Party » côté jeu) — 1 ligne
| Champ | Type | Note |
|---|---|---|
| guild_id | texte, clé | Serveur Discord |
| seed | entier | Graine du hasard |
| tick | entier | Semaine de jeu en cours |
| season | entier | Saison en cours |
| next_tick_at | date | Prochaine alarme |
| last_active_at | date | Pour la mise en veille (30 jours) |
| data_version | texte | Version du catalogue utilisée |
| trends | json | Tendances du mois (beats, thèmes, par région) |
| config_overrides | json | Réglages propres au monde |

### label
| Champ | Type | Note |
|---|---|---|
| id | id, clé | |
| owner_user_id | texte, nul si label du jeu | Compte Discord du joueur |
| name, color, logo_key | texte | Identité (logo optionnel dans R2) |
| kind | `player` / `npc_real` / `npc_fictional` | |
| tier | 1-6 | Palier |
| cash | € | |
| reputation | réel 0-100 | |
| distress_counter | entier | Compteur de faillite |
| protected_until_tick | tick | Protection des nouveaux |
| season_stats | json | Streams, revenus, objectifs de la saison |
| lifetime_stats | json | Revenus cumulés, n°1, pour les paliers |
| created_tick, reset_count | entier | |
| settings | json | Notifications, tutoriel terminé |

### artist (seulement les artistes « touchés » dans ce monde)
Un artiste du catalogue jamais signé, jamais scouté, jamais modifié **n'a pas de ligne** : on lit le catalogue.

| Champ | Type | Note |
|---|---|---|
| id | id, clé | Identifiant du catalogue, ou `gen_…` pour un artiste créé dans ce monde |
| origin | `catalog` / `generated` / `academy` | |
| name | texte | Seulement pour les artistes créés |
| label_id | id, nul si libre | |
| attrs | json | Les attributs (02) |
| potential, growth_profile | entier, texte | Valeurs réelles (cachées) |
| traits, skills | json | Tirés par monde (H4) |
| genres | json | Principal, secondaires, affinités |
| fans, fans_regions | entier, json | |
| superfan_rate, hype | réel | |
| energy, creative_fatigue, morale | entier | |
| status, promised_status | texte | Hiérarchie |
| scandal_risk, energy_profile | réel, texte | |
| state | json | Blessure, page blanche, transition de genre, rancunes, relations |
| stats | json | Compteurs (sons sortis, progression en cours) |

### scout_knowledge (ce que chaque label sait d'un artiste)
| Champ | Type |
|---|---|
| label_id, artist_id | clé double |
| rating_error, potential_min, potential_max | entier |
| traits_known | json |
| source, tick | texte, tick |

### contract
| Champ | Type | Note |
|---|---|---|
| id | id, clé | |
| artist_id, label_id | id | |
| start_tick, end_tick | tick | |
| advance, unrecouped | € | Solde restant à recouper |
| weekly_allowance | € | |
| royalty_rate | réel | |
| masters_owner | `label` / `artist` | |
| publishing | booléen | |
| marketing_guarantee | € par 8 ticks | |
| min_releases_per_season | entier | |
| exit_clause, buyout_clause | texte, € | |
| renewal_option | entier (mois) | |
| live_share, merch_share | réel | |
| promised_status | texte | |
| bonuses | json | Primes |
| status | `active` / `ended` / `bought_out` / `loan` | |
| loan_from_label_id, loan_terms | id, json | Pour les prêts d'artiste |

### negotiation
| Champ | Type |
|---|---|
| id, kind (`contract` / `transfer` / `featuring` / `loan`) | id, texte |
| from_label_id, to_label_id (nul si agent), artist_id | id |
| expectations (cachées), blockers, patience, round | json, json, entier, entier |
| last_offer, last_reply | json |
| expires_tick, status | tick, texte |

### song
| Champ | Type | Note |
|---|---|---|
| id | id, clé | |
| label_id, artist_id, feat_artist_id | id | |
| title | texte | |
| theme_id, beat_id | texte | |
| choices | json | Les 5 choix et leurs niveaux, producteur, studio |
| events | json | Événements vécus et réactions |
| cost | € | |
| quality_min, quality_max, quality | entier | Fourchette puis note finale |
| quality_cap | entier | Plafond de débrouille |
| available_tick | tick | Délai de mixage |
| masters_owner_label_id | id, nul | |
| royalty_splits | json | Points cédés (producteur, invité) |
| state | `draft` / `vault` / `released` / `withdrawn` | `draft` = création en cours |
| created_tick | tick | |
| streams_last, streams_total, decay | entier, entier, réel | Mis à jour au tick |
| peak_global, weeks_in_chart, hit_score | entier, entier, entier | |

### release (une sortie) et release_track
| Champ (release) | Type |
|---|---|
| id, label_id, artist_id | id |
| format | `single` / `ep` / `album` / `mixtape` / `freestyle` / `deluxe` |
| title, cover_key | texte (clé R2) |
| release_tick | tick |
| marketing | json (options, coûts, portée) |
| project_score | entier |
| parent_release_id | id (pour un deluxe) |
| duel_id | id (guerre de charts) |
| status | `scheduled` / `released` / `cancelled` |

`release_track` : `release_id`, `song_id`, `position`.

### chart (une ligne par classement et par tick)
| Champ | Type | Note |
|---|---|---|
| tick, chart_id | clé double | `global`, `genre:rap_fr`, `region:fr`, `projects`, `artists`, `labels` |
| entries | json | Tableau compact : place, id (son du joueur ou sortie du jeu), titre, artiste, label, streams, évolution |

On garde les **8 derniers ticks** ; le reste est supprimé. L'historique long d'un son tient dans sa ligne `song` (meilleure place, semaines).

### event (cartes en attente et journal)
| Champ | Type |
|---|---|
| id, label_id (nul = monde) | id |
| card_id | texte (référence au catalogue de cartes) |
| context | json (artiste, son, montants calculés) |
| created_tick, expires_tick | tick |
| choice, outcome | texte, json |
| status | `pending` / `resolved` / `expired` |

### staff
| Champ | Type |
|---|---|
| id, label_id | id |
| role, level, name | texte, entier, texte |
| salary | € |
| assignment | json (artiste coaché, mission de scouting : région, genre, budget, fin) |
| hired_tick | tick |

### loan
| Champ | Type |
|---|---|
| id, label_id | id |
| kind | `classic` / `asset` / `emergency` / `player` |
| lender_label_id | id (prêt entre joueurs) |
| principal, remaining | € |
| rate_per_tick | réel |
| start_tick, end_tick | tick |

### notification
| Champ | Type |
|---|---|
| id | id |
| label_id (nul = toute la party) | id |
| type, priority | texte |
| text_key, params | texte, json (le texte est construit par l'application) |
| tick, created_at | tick, date |
| read_by | json (liste des joueurs qui l'ont lue, pour les notifications de party) |

### Autres tables
| Table | Rôle | Champs principaux |
|---|---|---|
| market_listing | Mises en vente, enchères, prêts proposés | artist_id, seller_label_id, kind, price, bids (json), end_tick |
| producer | Vivier de producteurs du monde | id, name, level, affinities (json), reliability, price ; `relations` (json par label) |
| tour / tour_date | Tournées et concerts | artist_id, label_id, dates (json : tick, région, salle, résultat) |
| merch_batch | Lots de merch | artist_id, units, unit_cost, price, sold |
| academy_slot | Centre de formation | label_id, artist_id, start_tick |
| war | Conférences, clashs, duels | kind, from_label_id, to_label_id, artists, state, stake, tick |
| coop | Coopérations | kind, labels, terms (json), state |
| festival | Festival du Serveur | tick, registrations (json), lineup (json), results (json) |
| season_result | Classement final par saison | season, ranking (json), trophies (json) |
| palmares | Historique d'un joueur (survit à la faillite) | owner_user_id, entries (json) |
| ledger | Journal comptable résumé | label_id, tick, category, amount — **1 ligne par catégorie et par tick**, pas par opération |

### Relations
```
world 1─N label 1─N contract N─1 artist
label 1─N song N─1 artist          song N─N release (release_track)
label 1─N staff, loan, event, notification, merch_batch, tour
artist 1─N scout_knowledge (par label)
world 1─N chart, producer, festival, season_result, war, coop, market_listing
```

## 7.4 Messages (dans `packages/protocol`)

Nouveau fichier de types, sans toucher aux messages des jeux de party. Familles de requêtes :

| Famille | Exemples |
|---|---|
| Lecture | `GET home`, `GET roster`, `GET artist/:id`, `GET charts/:id`, `GET finances`, `GET market`, `GET calendar` |
| Studio | `POST song/start`, `POST song/:id/choose`, `POST song/:id/react`, `POST song/:id/feat-offer`, `POST song/:id/finish` |
| Sorties | `POST release`, `POST release/:id/move`, `POST release/:id/cancel`, `PUT release/:id/cover` |
| Contrats, marché | `POST negotiation`, `POST negotiation/:id/offer`, `POST listing`, `POST bid` |
| Gestion | `POST staff/hire`, `POST scout/mission`, `POST loan`, `POST tour`, `POST merch` |
| Entre joueurs | `POST war`, `POST coop`, `POST festival/register` |
| Événements | `POST event/:id/answer`, `POST notifications/read` |

Chaque réponse renvoie l'état utile mis à jour (cash, énergie, carte suivante), pour éviter une deuxième requête.

## 7.5 Pochettes

- L'application **réduit l'image avant l'envoi** : carré de 512 px, format WebP, **150 Ko maximum**.
- Stockage : R2, dossier `melody/<serveur>/<sortie>.webp`. **Ce dossier doit être exclu du nettoyage automatique des médias** (aujourd'hui les médias de LiveChat sont effacés après 24 h).
- Limites : 1 pochette par sortie ; 200 sorties avec pochette par label (au-delà, la plus ancienne revient à une pochette générée).
- Pochette par défaut : dessinée par l'application (initiales + couleur du label), rien à stocker.
- Suppression : quand un label fait faillite ou qu'un monde est supprimé, ses pochettes sont effacées.

## 7.6 Budget « gratuit pour toujours »

Limites de l'offre gratuite Cloudflare **à revérifier au moment du développement** (elles changent) : environ 100 000 requêtes par jour, 100 000 lignes écrites par jour et 5 Go pour SQLite dans les Durable Objects ; 10 Go pour R2.

| Poste | Estimation | Garde-fou dans le code |
|---|---|---|
| Écritures d'un tick, par monde | ~17 classements + ~60 sons actifs + ~20 labels + ~80 artistes + ~40 lignes diverses ≈ **220 lignes** | Classements en 1 ligne chacun ; sons au fond de catalogue mis à jour 1 tick sur 4 ; rien d'écrit pour les artistes non touchés |
| Écritures d'un joueur actif | ~150 lignes par jour (sons, événements, journal) | Création de son : 1 seule ligne `song` mise à jour à chaque étape |
| **Capacité** | Un monde de 4 joueurs actifs ≈ 220 + 4 × 150 = **~820 lignes par jour** → 100 000 ÷ 820 ≈ 120 mondes. **Viser 100 mondes actifs** pour garder de la marge | Compteur global dans `Directory` ; au-delà du seuil, les nouveaux mondes sont en liste d'attente (message clair) |
| Requêtes | ~200 par joueur actif et par jour | Réponses « tout-en-un », cache local dans l'application |
| Taille d'un monde | ~2 à 5 Mo après plusieurs saisons | Classements : 8 ticks ; notifications : 14 ticks ; journal : 2 saisons |
| Pochettes | 150 Ko × 200 × 20 labels = 600 Mo au pire par monde ; réaliste : ~10 Mo | Limites de 7.5 ; plafond global de 6 Go dédié à Melody dans R2 |
| Mondes endormis | 0 écriture | Veille après 30 jours sans connexion ; suppression proposée après 180 jours |
| Tick | 1 alarme par monde et par jour | Les mondes en veille n'ont pas d'alarme |

Si une limite approche, le jeu **ralentit** (liste d'attente, pochettes par défaut) ; il ne passe jamais en payant.

## 7.7 Ce qui se passe quand…

| Cas | Comportement |
|---|---|
| Le serveur rate un tick (panne) | Au réveil, il rejoue **au plus 3 ticks** de retard d'un coup, puis reprend le rythme normal |
| Deux joueurs agissent en même temps (enchère, signature) | L'objet traite les requêtes une par une : le premier arrivé gagne, l'autre reçoit un message clair |
| Un joueur quitte le serveur Discord | Son label est gelé (plus de tick pour lui, artistes intouchables) pendant 14 ticks, puis géré comme une faillite |
| Mise à jour du catalogue d'artistes | Nouvelle `data_version` : les nouveaux artistes apparaissent ; les artistes déjà « touchés » gardent leur état |
| Changement des réglages d'équilibre | Appliqué au tick suivant, annoncé dans une note de version |
| Création de son abandonnée en route | Le son reste en `draft` 2 ticks, puis il est fini automatiquement en débrouille (pas d'annulation gratuite) |
