# Game rules and bots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the owner's new rules to the four party games (votes timed from the first vote, auto-send, pasted images, Undercover redo, LiveChat answers in Question débile, duels in Meilleure blague) and add bots so one person can test every game alone.

**Architecture:** The rules live in the party service (`services/party/src/games.ts`, driven by the Party Durable Object), the shapes in `packages/protocol`, the screens in `apps/desktop/src/renderer/src/control/GamesScreen.tsx`. Bots are game players with ids `bot:<n>` that the service plays itself on its alarm. This plan keeps the current look; the new cartoon look and the mascots come in plan 4.

**Tech Stack:** Cloudflare Durable Objects (TypeScript), zod 4, React 19, Electron 45, vitest (service tests through real sockets), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-09-jeux-persos-texte-presse-papier-design.md` (section 3)

## Global Constraints

- Vote: 30 s after the first vote; at most 2 min before it (`VOTE_WAIT_MS = 120_000`, `VOTE_AFTER_FIRST_MS = 30_000`), all games, all times multiplied by `GAME_SCALE`.
- Meilleure blague: up to 5 pictures per player (`GAME_ENTRIES_PER_PLAYER.joke = 5`), validate from 2 (`GAME_MIN_ENTRIES.joke = 2`).
- Undercover: 3 rounds, one picture per round, the impostor gets no picture.
- Missing joke: filled from `HOUSE_JOKES` (French, at least 40 lines) and shown as the player's own, never labelled.
- Bots: ids `bot:1`…, French names from `BOT_NAMES` (« Bot Gaston », « Bot Josiane », « Bot Kevin », « Bot Mamie Lulu », « Bot Fernand », « Bot Jessica »), act 1.5-5 s (× `GAME_SCALE`) after each phase starts, never block a phase.
- Apps older than this version cannot join games any more: raise the minimum game version (the constant next to the « Offered by apps that know the game lobby (0.22.0 and later) » comment) to the version this ships in **(builder's call: the rules change underneath them)**.
- French UI text, « tu ». Typecheck and tests as in plan 1. Service tests run with the scaled timers the suite already uses.

## Review Focus

- A player leaves in the middle of their Undercover turn: the turn moves on at once, the round does not hang.
- Only bots and one human in Meilleure blague: every duel still has at least one voter (minimum 3 players, bots count).
- Today's history holds videos and sounds: only pictures and videos are taken, sounds never.
- Someone pastes text, not an image, while a game asks for a picture: nothing is sent, the game is untouched.
- Nobody votes at all: the vote still ends after 2 min and the reveal shows zero votes.

---

### Task 1: Vote timed from the first vote

**Files:**
- Modify: `services/party/src/games.ts` (`enter` for `vote`, `vote`)
- Modify: `packages/protocol/src/index.ts` (`GameSchema.voteStarted: z.boolean().default(false)`)
- Test: `services/party/test/party.test.ts`

**Interfaces:**
- Produces: `StoredGame.firstVoteAt: number | null`; in `vote` phase `endsAt = enteredAt + VOTE_WAIT_MS·scale` until the first valid vote, then `min(endsAt, now + VOTE_AFTER_FIRST_MS·scale)`; `gameView` sets `voteStarted`.

- [ ] **Step 1: Write the failing test** `it('waits for the first vote, then gives 30 seconds')`: in a `who` game, at the vote phase expect `endsAt - now` close to `VOTE_WAIT_MS × scale`; after one vote, close to `VOTE_AFTER_FIRST_MS × scale` and `voteStarted` true. A second game where nobody votes still reaches `reveal` after the wait, every entry with 0 votes.
- [ ] **Step 2: Run** `npx vitest run -t "first vote"`. Expected: FAIL.
- [ ] **Step 3: Implement.** Remove the per-kind `vote` seconds from `SECONDS`.
- [ ] **Step 4: Run** the service suite and typecheck. Expected: PASS.
- [ ] **Step 5: Commit** « Votes last 30 s from the first vote ».

### Task 2: Bots

**Files:**
- Modify: `packages/protocol/src/index.ts` (client messages `game-bot-add {gameId}`, `game-bot-remove {gameId, botId}`; `GameSchema.bots: z.array(z.object({ id: z.string(), name: z.string() })).default([])`)
- Modify: `services/party/src/games.ts` (`addBot(game): string | null`, `removeBot(game, botId)`, `botActions(game, now, rng): Array<{ at: number; act: () => void }>`, `BOT_NAMES`, `BOT_LINES: Record<GameKind, string[]>`)
- Modify: `services/party/src/party.ts` (handle the two messages in the lobby only; schedule bot actions on the alarm; bots are ready at once in the lobby)
- Modify: `apps/desktop/src/renderer/src/control/GamesScreen.tsx` (« + Bot » in the lobby, `data-testid="game-add-bot"`; a × on a bot's avatar; names through a `nameOf(game, party, id)` helper used everywhere `memberOf(...).name` is used today)
- Modify: `apps/desktop/src/shared/ipc.ts`, `apps/desktop/src/preload/index.ts`, `apps/desktop/src/main/index.ts` (`gameAction(gameId, 'add-bot')`, `removeGameBot(gameId, botId)`)
- Test: `services/party/test/party.test.ts`, `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Produces: bots count as players for the minimum; anyone in the lobby can add one; at most the lobby's player cap. What bots do: collect in picture games → send one picture from today's history if any, otherwise nothing and they do not hold the phase; collect in `who` → nothing; write → a line from `BOT_LINES[kind]`; vote → a random valid choice; Undercover turn → a line from `BOT_LINES.undercover`.

- [ ] **Step 1: Write the failing service test** `it('lets one person play with bots: they get ready, write and vote')`: one human opens Meilleure blague, adds two bots, launches; plays to the reveal; the bots' jokes and votes are there; `bots` lists two names from `BOT_NAMES`.
- [ ] **Step 2: Write the failing e2e test** `it('plays a game alone with bots')`: in the Jeux tab open Undercover, click `game-add-bot` twice, launch, play the round through to the podium.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** service suite, typecheck, e2e. Expected: PASS.
- [ ] **Step 6: Commit** « Bots to play the games alone ».

### Task 3: Typed text leaves when time is up, and pasted images reach the game

**Files:**
- Modify: `apps/desktop/src/renderer/src/control/GamesScreen.tsx` (`Write`: send the field's text when 1 s is left if not sent yet)
- Modify: `apps/desktop/src/renderer/src/control/App.tsx` (`onPaste`: when the Jeux tab shows a game asking for a picture, send pasted images to the game with the existing game-file IPC instead of preparing a LiveChat; text is ignored there)
- Test: `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Consumes: bots (Task 2) so the test can play alone.

- [ ] **Step 1: Write the failing e2e test** `it('sends what was typed when time is up, and takes pasted pictures in a game')`: alone with two bots in Meilleure blague, paste a PNG twice (clipboard written from the main process, Ctrl+V in the window): `mySent` reaches 2; text pasted there leaves `mySent` and the LiveChat draft untouched; in the write phase type a joke without Enter; when the vote starts the joke is among the entries.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** typecheck and e2e. Expected: PASS.
- [ ] **Step 5: Commit** « Games take pasted pictures and send typed text in time ».

### Task 4: Undercover redo

**Files:**
- Modify: `services/party/src/games.ts` (`startUndercoverRound`, `say`, `acted`, `advance`, `gameView`, `SECONDS.write.undercover` replaced by a per-turn `WORD_TURN_MS = 20_000` **(builder's call)**)
- Modify: `services/party/src/party.ts` (give the game today's history pictures: `todayPictures(): GameFile[]`, items played since midnight Europe/Paris, image or video files only, still stored)
- Modify: `packages/protocol/src/index.ts` (`GameSchema.turn: z.string().nullable().default(null)`, `GameSchema.iAmImpostor: z.boolean().default(false)`)
- Modify: `apps/desktop/src/renderer/src/control/GamesScreen.tsx` (impostor card « Tu es l'imposteur » in big red; « À <nom> d'écrire »; words appear as they arrive; a history video plays on press with `volume = 0.3` and a volume slider; reveal one vote at a time, 700 ms apart **(builder's call)**)
- Test: `services/party/test/party.test.ts`, `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Produces: when today's history has at least 3 pictures the game skips `collect` and goes straight to `write`; otherwise players send one each as today and the pool is history + sends. Each round: one picture for everyone but the impostor (`myPicture: []`, `iAmImpostor: true`); `turnOrder` shuffled per round; `say` only from `turn`; after a say or `WORD_TURN_MS·scale`, the next player; a player who left is skipped at once; after the last word, `vote`. Words are public with their author during `write` and `vote`. The reveal phase lasts `4 s + 1.5 s × votes` (× scale) so the client can reveal one by one.

- [ ] **Step 1: Write the failing service test** `it('plays Undercover with today's pictures: no picture for the impostor, one word at a time')`: fill today's history with 3 pictures and 1 sound the same way the replay test does (the sound is never dealt); start Undercover with 3 players; expect `write` without `collect`; exactly one player has `iAmImpostor` and an empty `myPicture`; a say from someone whose turn it is not is ignored; words arrive in `turn` order; a player leaving on their turn moves it on.
- [ ] **Step 2: Write the failing e2e test** `it('shows the impostor card and the words one by one')` alone with bots.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** service suite, typecheck, e2e. Expected: PASS.
- [ ] **Step 6: Commit** « Undercover: today's pictures, the impostor in the dark, one word at a time ».

### Task 5: Question débile answered with LiveChat avancé

**Files:**
- Modify: `packages/protocol/src/index.ts` (`MediaDraftSchema` refine: a game send may carry a `scene`; `GameEntrySchema.scene: SceneSchema.default(null)`; also `textPlace` when plan 1 has landed)
- Modify: `services/party/src/games.ts` (`acceptsEntry`: `question` takes a scene; `joke` and `undercover` keep pictures only)
- Modify: `services/party/src/party.ts` (store the entry's scene with its files)
- Modify: `apps/desktop/src/main/index.ts` (`SendScene` with a `game` id sends to the game)
- Modify: `apps/desktop/src/renderer/src/control/GamesScreen.tsx` and `AdvancedEditor.tsx` (« Répondre en LiveChat avancé » opens the editor with the question as the LiveChat's text and a « Envoyer au jeu » send; answers render with the scene renderer in the vote; reveal one by one)
- Test: `services/party/test/party.test.ts`, `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Consumes: Task 1 vote timing, Task 2 bots (bot answers stay text lines).

- [ ] **Step 1: Write the failing service test** `it('takes a LiveChat avancé as an answer to the question')`: a scene with two layers is accepted for `question`, refused (409) for `joke`; the vote entries carry the scene.
- [ ] **Step 2: Write the failing e2e test**: alone with bots, answer through the editor; the vote shows the answer with the question as its text.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** service suite, typecheck, e2e. Expected: PASS.
- [ ] **Step 6: Commit** « Question débile answers are LiveChats ».

### Task 6: Meilleure blague in duels

**Files:**
- Modify: `packages/protocol/src/index.ts` (`GAME_MIN_PLAYERS.joke = 3` **(builder's call: a duel needs a voter; bots count)**; `GAME_MIN_ENTRIES: Record<GameKind, number>` with `joke: 2`, others 1; client message `game-done {gameId}`; `game-say` gains `entryId: z.string().optional()`; `GameSchema.myTasks: z.array(z.object({ entryId: z.string(), files: z.array(GameFileSchema) })).default([])`; `GameSchema.duel: z.object({ entryId: z.string(), files: z.array(GameFileSchema) }).nullable().default(null)`)
- Modify: `services/party/src/games.ts` (`startJokeRound`, `say`, `vote`, `score`, `advance`, `HOUSE_JOKES`)
- Modify: `apps/desktop/src/renderer/src/control/GamesScreen.tsx` (« Valider » once 2 pictures are sent; two writing cards per round; the duel vote screen: picture + two jokes; authors see « Tu ne votes pas sur ton duel »)
- Test: `services/party/test/party.test.ts`, `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Produces: collect ends when every player sent 5 or clicked `game-done` after 2, or on time. Each round takes `n` unused pictures for `n` players; picture `i` goes to players `i` and `i+1` (circular), so everyone writes two jokes and every picture has two authors; nobody gets their own picture when it can be avoided. Missing jokes at the end of `write` are filled from `HOUSE_JOKES` under the player's name. Vote: one duel at a time (`duel`), choices are the two author ids, authors cannot vote. Score: 1 point per vote, +1 to the duel's winner, nothing on a tie. Rounds: up to 3 while unused pictures remain.

- [ ] **Step 1: Write the failing service test** `it('plays jokes in duels: two authors per picture, they cannot vote, a missing joke is filled in')`: 3 players, 2 pictures each with `game-done`; each player has two `myTasks`; one player writes nothing and their duel entries still hold a line from `HOUSE_JOKES`; an author's vote on their own duel is ignored; scores follow the rule above.
- [ ] **Step 2: Write the failing e2e test**: alone with two bots, send 2 pictures, click « Valider », write both jokes, vote in the duels you are not in, reach the podium.
- [ ] **Step 3: Run both.** Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** service suite, typecheck, e2e. Expected: PASS.
- [ ] **Step 6: Commit** « Meilleure blague in duels ».

### Task 7: Patch notes, roadmap, deploy readiness

**Files:**
- Modify: `apps/desktop/src/shared/patch-notes.ts` (French lines for each rule change and the bots)
- Modify: `docs/FEUILLE-DE-ROUTE.md`

- [ ] **Step 1: Write the entries.**
- [ ] **Step 2: Run** the whole service suite, typecheck both packages, the full e2e suite. Expected: all pass.
- [ ] **Step 3: Commit and push** (standing approval). The service must be deployed together with the app release when the owner says « lance »: the publish steps deploy first.
