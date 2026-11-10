# Persos et look des jeux — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the five approved mascots into the games screen (lobby, a banner during play, podium, game cards, invite banner), and dress each game in its own world, as in the approved mock-up.

**Architecture:** The five persona files from `docs/persos/` become TypeScript modules in the renderer. One `<Mascot>` React component draws a persona's SVG scene and applies the owner's settings, the variants, moods, eye direction and a canvas of effects, all ported from `docs/persos/engine.html`. The games screen picks the persona from the game kind, drives its mood from what happens in the game, and wraps the game in a `world-<id>` class whose CSS (one file per world) restyles the existing game markup after that persona's mock-up screen (`ui.css` in each persona file).

**Tech Stack:** Electron 45, React 19, TypeScript, electron-vite, CSS, `@fontsource` packages for fonts, Playwright e2e (`apps/desktop/test/party.e2e.ts`).

**Spec:** `docs/superpowers/specs/2026-11-09-jeux-persos-texte-presse-papier-design.md` section 5. Owner's settings: `docs/persos/REGLAGES.md`. Reference pictures and behaviour: `docs/persos/engine.html` + the five `docs/persos/*.js` files (open `engine.html` with the files injected at `<!--PERSOS-->` to see them).

## Global Constraints

- Free only: no paid service, no online font or asset at run time. Fonts come from `@fontsource/*` npm packages, bundled.
- The in-game overlay (stage window) changes only for the game invite banner.
- No sound effects.
- Mimics only: no speech bubbles on the mascots.
- The persona drawings are kept exactly as approved; only the owner's settings are applied on top. Do not redraw.
- User-facing text in French, short, « tu ».
- Reduced motion (`prefers-reduced-motion` or the app's existing `calm` class on `<html>`) stops the mascots' animations and effects.
- Commit after each task: `git add` the task's files, message in English, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push; the controller pushes.
- Commands: first `export PATH="/c/Program Files/nodejs:$PATH"`. Typecheck: `npx tsc -p tsconfig.json` in `apps/desktop`. E2E: `npm run test:e2e` in `apps/desktop` (about 8 minutes; the YouTube and TikTok link tests fail without network, ignore them; never click in the test windows).

## Game ↔ persona

| Game kind | Persona id | Name |
|---|---|---|
| `undercover` | `insp` | Inspecteur Loupe |
| `joke` | `micro` | Monsieur Micro |
| `question` | `boum` | Professeur Boum |
| `who` | `boule` | Madame Boule |
| `guess` | `chrono` | Coach Chrono |

## Review Focus

- The same persona drawn twice at once (game card + banner, or banner while another view is `hidden`): its SVG gradient and clip ids must stay unique per instance, or the second copy loses its colours. Task 2 test.
- Effects switched off in Settings: no canvas particles, no flash, no shake, but the mascot still moves. Task 3 test.
- The five cards of the game picker must not animate five full scenes at once: cards show a still head, animated only on hover. Task 6 test.
- A hidden view or a window in the background must not keep the effects loop running (`requestAnimationFrame` stops when the component is not visible / document hidden). Task 2.
- Long names, many players (8) and bots in the world layouts: nothing overflows the window at 900 px wide. Task 5 screenshots.

---

### Task 1: Personas and the owner's settings in the app

**Files:**
- Create: `apps/desktop/src/renderer/src/control/mascots/persona.ts` (types)
- Create: `apps/desktop/src/renderer/src/control/mascots/personas/{insp,micro,boum,boule,chrono}.ts`
- Create: `apps/desktop/src/renderer/src/control/mascots/settings.ts`
- Create: `apps/desktop/src/renderer/src/control/mascots/fonts.ts`
- Modify: `apps/desktop/package.json` (font packages)

**Interfaces:**
- Produces:
  - `type PersonaId = 'insp' | 'micro' | 'boum' | 'boule' | 'chrono'`
  - `type Mood = 'repos' | 'louche' | 'rire' | 'victoire' | 'decu' | 'surprise'`
  - `type FxSpec = { type: string; [key: string]: unknown }` (the bursts/ambient objects as they are in the files)
  - `type Persona = { id: PersonaId; name: string; svg: string; css: string; worldCss: string; variants: { famille: string; nom: string; choix: [string, string][] }[]; moodLabels: Partial<Record<Mood, string>>; react: Mood; moments: [string, Mood, FxSpec[]?][]; ambient: FxSpec[]; bursts: Partial<Record<Mood, FxSpec[]>>; moodMs: number }`
  - `PERSONAS: Record<PersonaId, Persona>` and `personaOf(kind: GameKind): Persona` (table above), exported from `mascots/persona.ts`.
  - `PIECE_SETTINGS: Record<PersonaId, { vars: Record<string, string>; pieces: Record<string, { dx: number; dy: number; echX: number; echY: number }>; head: { x: number; y: number; w: number; h: number } }>` in `settings.ts`. `pieces` is keyed by the piece's `data-nom` (the names in `REGLAGES.md`), `vars` by `famille` with the variant id (look the label up in that persona's `variants[].choix`). `head` is a viewBox crop (scene units, 640×400 scene) framing the face and shoulders, used for cards and the invite.

- [ ] **Step 1:** Convert each `docs/persos/<id>.js` into `personas/<id>.ts`: keep every drawing and CSS string byte for byte; remove the IIFE wrapper; replace `PERSOS.register({ ... })` by `export const <id>: Persona = { ... }`; keep `ui.css` as `worldCss`; drop `ui.html` (mock content) and `blurb`/`game`. Add `// @ts-nocheck`-free typing: the files are template strings, so only the final object needs the type. The Coach Chrono `game` label « 30 secondes » is not used.
- [ ] **Step 2:** Write `settings.ts` from `docs/persos/REGLAGES.md` exactly (percentages → factors: `168%` → `1.68`; a line without largeur/hauteur → `1`). Choose `head` per persona by looking at the scene in `engine.html` (`?p=<id>`).
- [ ] **Step 3:** Add `@fontsource/archivo-black`, `@fontsource/barlow` (500, 700, 800), `@fontsource/bebas-neue`, `@fontsource/cinzel-decorative` (700, 900), `@fontsource/courier-prime` (400, 700), `@fontsource/permanent-marker`, `@fontsource/shrikhand`, `@fontsource/special-elite` as devDependencies with exact versions (like the existing `@fontsource-variable/geist`), imported once in `fonts.ts`.
- [ ] **Step 4:** Run the typecheck. Expected: no error.
- [ ] **Step 5:** Commit.

### Task 2: The `<Mascot>` component and its effects

**Files:**
- Create: `apps/desktop/src/renderer/src/control/mascots/Mascot.tsx`
- Create: `apps/desktop/src/renderer/src/control/mascots/fx.ts`
- Create: `apps/desktop/src/renderer/src/control/mascots/mascot.css`

**Interfaces:**
- Consumes: Task 1.
- Produces: `<Mascot persona={PersonaId} mood={Mood} pulse={number} look={number} effects={boolean} frame={'scene' | 'banner' | 'head'} still?={boolean} burst?={FxSpec[]} />`
  - `mood`: shown until it changes; any mood but `repos` falls back to `repos` after `persona.moodMs`, unless `mood` changes again.
  - `pulse`: a counter; each increment replays the current mood (same mood twice in a row still reacts) and fires `persona.bursts[mood]` plus `burst` if given.
  - `look`: −1 (left) … 1 (right); eased toward like the engine (`--look` CSS variable on the svg).
  - `effects`: off → no canvas, no `flash`, no `shake`.
  - `frame`: `scene` = full 640×400 (`xMidYMid slice`); `banner` = same scene, wide and short (container aspect ≈ 16:5, `xMidYMid slice` keeps the head and arms; pick the vertical anchor so the face shows); `head` = viewBox set to `PIECE_SETTINGS[id].head`.
  - `still`: animations paused (`paused` class) and no effects loop; used by cards until hover.
  - Root element: `<div data-testid="mascot" data-persona={id} data-mood={current mood}>`.
- `fx.ts`: `createFx(canvas: HTMLCanvasElement, svg: SVGSVGElement, stage: HTMLElement) => { burst(specs: FxSpec[]): void; setAmbient(specs: FxSpec[]): void; enable(on: boolean): void; destroy(): void }` — a port of the `fx` block of `engine.html` (all particle types it draws, `flash` and `shake` included), unchanged maths.

- [ ] **Step 1:** Port the engine's piece placement (`appliquer`, `recalculer`, variants `appliquerVariantes`) into the component: after the SVG is in the DOM, set each `[data-var]` display from `vars`, measure each `[data-el]` bbox, then apply `PIECE_SETTINGS.pieces[data-nom]` with the same transform formula. No dragging, frames or handles.
- [ ] **Step 2:** Make ids unique per instance: before injecting, rewrite every `id="X"` and every `url(#X)` / `href="#X"` in the persona SVG with an instance prefix (`useId`-based). Persona CSS that targets ids (if any) must get the same prefix; check each file with `grep -n "#<id>-" ` in its CSS.
- [ ] **Step 3:** Inject the persona CSS once per persona (a `<style data-persona>` in `document.head`, reference-counted), plus `mascot.css` (stage box, canvas over it, `flash` and `shake` keyframes copied from `engine.html`).
- [ ] **Step 4:** Moods as the engine does: `p-<id>` and `mood-<mood>` classes on the svg, restart by forcing a reflow when `pulse` changes.
- [ ] **Step 5:** Effects loop runs only while the element is on screen (`IntersectionObserver`) and `document.visibilityState === 'visible'`; reduced motion or `html.calm` → `effects` off and `#scene.no-anim`-like class stopping CSS animation.
- [ ] **Step 6:** Temporary check page is not wanted; instead add to `apps/desktop/test/party.e2e.ts`, at the start of the games test, after opening the games tab: a mascot is drawn, its gradients resolve (`getComputedStyle` of one filled element in the second visible copy is not `none`/black when two copies of the same persona are on screen — the card head and the lobby banner of the opened game), and `data-mood` turns from `repos` to another mood when a player joins (Task 4 makes it react; leave this assertion for Task 4 if it lands first).
- [ ] **Step 7:** Typecheck, commit.

### Task 3: « Effets des jeux » setting

**Files:**
- Modify: settings schema and defaults where `showGame` lives (`apps/desktop/src/shared/ipc.ts`, `DEFAULT_SETTINGS`), `apps/desktop/src/renderer/src/control/SettingsScreen.tsx`

**Interfaces:**
- Produces: `settings.gameEffects: boolean`, default `true`. Label « Effets dans les jeux », hint « Pluie, fumée, éclairs et secousses autour des persos ». A `role="switch"` like the other switches, `aria-label="Effets dans les jeux"`.

- [ ] **Step 1:** Add the setting, the switch, and pass `state.settings.gameEffects` to every `<Mascot effects>`.
- [ ] **Step 2:** E2E: in the settings test, turn it off, open the games tab, check the lobby mascot has no `<canvas>`; turn it back on.
- [ ] **Step 3:** Typecheck, commit.

### Task 4: Mascots in the games screen

**Files:**
- Modify: `apps/desktop/src/renderer/src/control/GamesScreen.tsx`
- Create: `apps/desktop/src/renderer/src/control/mascots/use-game-mood.ts`
- Modify: `apps/desktop/src/renderer/src/styles.css` (layout only: banner and lobby stage boxes)

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `useGameMood(game: GameView, me: string): { mood: Mood; pulse: number; look: number; burst?: FxSpec[] }`.

Where:
- Lobby: the scene (`frame="scene"`) beside the title, replacing `lobby-art`, about 360×225.
- During a game (collect, write, vote, reveal): a `frame="banner"` across the top of `game-main`, under the title row, full width, about 160 px high.
- Podium: `frame="scene"` above the podium, mood `victoire` with that persona's victory moment bursts (the `moments` entry whose mood is `victoire`), held (no fallback) while the podium shows; `decu` when the game ended `few` or `stopped`.

Mood rules (`useGameMood`, comparing the previous `GameView` with the new one):
- a player joins the lobby, an entry or word arrives, `acted` grows → `persona.react`, `look` toward that player;
- phase becomes `vote` → `surprise`; first vote (`voteStarted` turns true) → `louche`;
- phase becomes `reveal` → `victoire` if the reveal has a winner (an entry with the most votes > 0, or `answer` set), else `decu`;
- Devine Vite: `secret` changes while the same player speaks (a word found) → `victoire`; a new speaker → `surprise`;
- a reaction emoji `😂` → `rire`.
- `look` = the acting player's index among `game.players` mapped to −1…1; back to 0 after 3 s.

- [ ] **Step 1:** Write `useGameMood` and wire the three places.
- [ ] **Step 2:** E2E (games test): lobby shows `[data-testid="mascot"][data-persona="micro"]`; after the guest joins, its `data-mood` is not `repos` within 2 s; during the write phase the banner mascot is there; the podium mascot has `data-mood="victoire"` or `decu`. Same three checks for `chrono` in the Devine Vite test.
- [ ] **Step 3:** Typecheck, e2e, commit.

### Task 5: The five worlds

**Files:**
- Create: `apps/desktop/src/renderer/src/control/mascots/worlds/{insp,micro,boum,boule,chrono}.css`
- Modify: `GamesScreen.tsx` (add `world-<id>` on the lobby and `game-main` sections)

Each world restyles the existing game markup (`.game-main`, `.game-lobby`, `.game-step`, `.game-ask`, `.game-entry`, `.game-choice`, `.game-duel`, `.game-vs`, `.game-words`, `.game-task`, `.game-impostor`, `.guess-card`, `.game-timer`, `.game-clock`, `.toy-button`, `.toy-face`, `.podium`, `.lobby-faces`, `.game-scene`) in the visual language of that persona's mock-up screen (`worldCss` and the `ui.html` structure in `docs/persos/<id>.js`; view it in `engine.html`). Copy the look, not the mock-up's markup: fonts, colours, textures (CSS gradients only), frames, tilted name tags, speech-balloon answer cards, big round timer, stamps. Keep every `data-testid`, every button label and the layout working at 900–1400 px wide. One file per world, all rules scoped under `.world-<id>`.

- Undercover (`insp`): police folder, typed labels (Courier Prime / Special Elite), polaroids for the pictures, red stamp for « Tu es l'imposteur », words as evidence tags.
- Meilleure blague (`micro`): comedy club stage, chasing bulb frame, speech-balloon jokes with name tags, « Applaudimètre » style vote counts, ON AIR timer.
- Question débile (`boum`): underground lab, Archivo Black, lab labels, answers as specimen cards, VS as a spark.
- Qui l'a envoyé (`boule`): fortune teller's tent, Cinzel Decorative, tarot-card choices, gold on violet velvet.
- Devine Vite (`chrono`): night arena, Bebas Neue scoreboard, the word as a referee card, « Trouvé ! » green and « Passer » yellow-card.

- [ ] **Step 1 (per world):** Write the world file, run the e2e games tests, look at the screenshots in `apps/desktop/test/.artifacts/` (`game-lobby.png`, `game-write.png`, `game-reveal.png`, `game-ranking.png`, `guess-turn.png`), fix what overflows or reads badly. For worlds the e2e doesn't reach (Undercover, Question débile, Qui l'a envoyé), add a short e2e per game that opens it with two bots and takes `world-<id>-lobby.png` and one in-game picture, then stops the game.
- [ ] **Step 2:** Typecheck, commit per world.

### Task 6: Mascots on the game cards and the invite banner

**Files:**
- Modify: `GamesScreen.tsx` (`Picker`), `apps/desktop/src/renderer/src/stage/GameInvite.tsx` and the stage entry (fonts and mascot css must be importable there), `styles.css`

- [ ] **Step 1:** Each card shows `<Mascot frame="head" still={!hovered} effects={false}>` instead of `GameArt`; the card title in its world's display font. Keep `game-art.tsx` (used nowhere else? remove it if unused).
- [ ] **Step 2:** The invite banner on the stage shows the persona head (`frame="head"`, `still`, no effects) left of the text, about 64 px.
- [ ] **Step 3:** E2E: the picker has 5 `[data-testid="mascot"]` and none of them runs effects (no canvas); the invite (`game-invite`) contains a mascot.
- [ ] **Step 4:** Typecheck, commit.

### Task 7: Notes and check

**Files:** `apps/desktop/src/shared/patch-notes.ts` (0.24.0), `docs/FEUILLE-DE-ROUTE.md`

- [ ] **Step 1:** Patch note lines (French): the five persos and where they appear; each game in its own world; the setting « Effets dans les jeux ».
- [ ] **Step 2:** Full e2e; all tests pass except the network link tests.
- [ ] **Step 3:** Commit.
