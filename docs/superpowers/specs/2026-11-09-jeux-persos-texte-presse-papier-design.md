# Update after 0.23.0: games redo, mascots, word game, movable text, clipboard history

Owner: the product owner (French, does not code). Decisions below are theirs unless marked
**(builder's call)**. Collected on 2026-11-09 through question dialogs.

## Why

They played the games with friends. Undercover is spoiled (with 3 rounds and one picture each,
everyone already knows the pictures), votes are too fast to even vote, reveals happen all at once,
Meilleure blague lacks the duel tension of the party games they love, and the games look flat.
They want the games to feel like a real party-game night: tense votes, one-by-one reveals,
characters with personality, a cartoon look full of motion. They also want to test everything
alone, hence bots. Two smaller asks ride along: moving the text of a LiveChat, and a clipboard
history in the Library.

## Global constraints (unchanged project rules)

- Free tier only (Cloudflare Workers, Durable Objects, R2). Nothing that can cost money.
- French UI text, « tu ».
- Old apps keep working: new protocol fields are optional; zod strips unknown keys.
- Never download videos from the sites.
- Publish only when the owner says « lance ».

## 1. Movable text (LiveChat avancé only)

- In the advanced editor the text can be dragged like a picture.
- Untouched, it stays exactly where it is today (the viewer's text zone).
- A « Remettre à sa place » button puts it back. No resize, no rotation.
- An app that does not know the new field shows the text at its usual place.

## 2. Clipboard history (Library category « Presse-papier »)

- Images only (copied from the web, screenshots).
- The last 50, and only what is copied while the app runs.
- A click puts the image in « mon LiveChat », ready to send (like a Library file).
- Ignore content a password manager marks as private.
- « Vider » button, pause button, a star keeps an item forever (starred items do not count in
  the 50).
- Stays on the PC, never sent anywhere.

## 3. Games: rules

### All games
- Vote: the timer starts at the first vote and then lasts 30 s. Before the first vote it waits
  at most 2 min **(builder's call for the 2 min)**. Applies to every vote **(builder's call: they
  asked for Undercover and Question débile; one rule everywhere is simpler to learn)**.
- When the timer ends, what a player has typed is sent even without pressing Enter.
- Ctrl+V of an image copied from the web works wherever a game asks for a picture.
- Bots: a « + Bot » button in the lobby, visible to everyone. Bots send, write silly answers and
  vote at random so one person can test every game alone.

### Undercover
- Pictures come from today's party history first (pictures and videos received today), then
  from what players send if the history is not enough.
- A video from the history plays when you press play, sound low by default and adjustable.
- The impostor gets no picture, only a big red « Tu es l'imposteur ».
- Players write their word one after the other; everyone sees each word arrive.
- No bonus for the impostor guessing the picture.
- Reveal one by one, with suspense.

### Question débile
- Each answer is made like in LiveChat avancé; the question is placed as the LiveChat's text,
  as if typed in a LiveChat.
- Vote 30 s from the first vote. Reveal one by one, with suspense.

### Meilleure blague
- Duels: two players write on the same picture; the others vote; the two authors do not vote,
  not even for each other.
- A player who writes nothing gets a ready-made joke from the app, without saying so.
- Up to 5 pictures each, and a player can validate from 2.

### Qui est l'image ?
- Rules unchanged; new look only.

## 4. New word game (Time's Up-like mechanics, own name and look)

- Everyone plays for themselves (no teams).
- Words: each player writes 3, the app completes from its own list.
- A turn lasts 30 s: the speaker sees the word and clicks « Trouvé » or « Passer ».
- Same words across 3 rounds: describe freely, then one single word, then by sending a
  LiveChat (picture, GIF or sound, no writing the word).
- Mascot: Coach Chrono (see 5). Name of the game **(builder's call: « Devine Vite » unless the
  owner names it)**.

## 5. Look of the games and mascots

- Very cartoon, full of motion-design animation, inspired by their reference party-game screens:
  answer cards as tilted speech balloons with name tags, big round timer, mood faces above
  players, sticky notes. Each game's frames, words and buttons dressed in its own world.
- One mascot per game, drawn like the casino devil mixed with a painted adult animated series:
  carved faces with real shading, bust with both arms behind furniture, props held properly,
  each game its own scene and ambiance. Mimics only (no speech bubbles), always moving, aims at
  players, present in the lobby and on the podium.
  - Undercover: Inspecteur Loupe, noir rainy police station.
  - Meilleure blague: Monsieur Micro, comedy club stage.
  - Question débile: Professeur Boum, underground lab.
  - Qui est l'image ?: Madame Boule, fortune teller's tent.
  - Word game: Coach Chrono, night arena.
- Animations: cartoon gags, effects on top (rain, smoke, sparks, confetti, lightning, dust),
  screen shake and flashes at big moments, speed lines.
- The exact drawings come from the editable mock-up the owner approves first
  (scratchpad `persos/`, published as an Artifact). Building them into the app waits for that
  approval.

## Non-goals

- No sound effects (never chosen).
- No change to the in-game overlay outside games.
- No teams in the word game.

## Order

1. Movable text + clipboard history (plan 1).
2. Game rules, bots, paste, auto-send (plan 2).
3. Word game (plan 3, written after plan 2 lands, since it builds on the same game code).
4. Look and mascots (plan 4, written after the owner approves the mock-up).
