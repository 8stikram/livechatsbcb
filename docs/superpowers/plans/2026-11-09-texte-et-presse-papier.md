# Movable text and clipboard history Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the text of an advanced LiveChat be dragged (with a reset button), and add a « Presse-papier » Library category that keeps the last copied images.

**Architecture:** A new optional `textPlace` travels with the LiveChat from the editor to the service queue and the overlay; when it is null the overlay uses the viewer's usual text zone. A small main-process module polls the clipboard, stores images in the user data folder and exposes them as Library-like entries through IPC.

**Tech Stack:** Electron 45, React 19, zod 4 (`packages/protocol`), Cloudflare Durable Object service (`services/party`), vitest, Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-11-09-jeux-persos-texte-presse-papier-design.md` (sections 1 and 2)

## Global Constraints

- French UI text with « tu ». Labels: « Remettre à sa place », « Presse-papier », « Vider », « Pause », « Reprendre ».
- Old apps must keep working: every new protocol field is optional with a null default.
- The clipboard history never leaves the PC: no IPC call sends it to the service.
- Keep 50 unstarred images; starred ones are kept forever and do not count.
- Poll the clipboard every 1000 ms, only while the app runs.
- Typecheck: `npx tsc -p tsconfig.json` in `apps/desktop`; service: `npx tsc --noEmit -p .` and `npx vitest run` in `services/party`; e2e: `npm run test:e2e` (run in the background, the e2e tests depend on each other).

## Review Focus

- A LiveChat whose text was never moved must look exactly as before on every screen (textPlace null, not a default value).
- Text dragged partly off the stage: clamp to the schema limits so the send is never refused.
- A saved LiveChat with moved text, reopened from the Library, keeps the moved text.
- The same image copied twice in a row adds one entry; copied again later, it moves back to the top.
- Clipboard with text only, or marked by a password manager: nothing is added.

---

### Task 1: `textPlace` in the protocol and the service

**Files:**
- Modify: `packages/protocol/src/index.ts` (MediaDraftSchema, QueueItemSchema)
- Modify: `services/party/src/party.ts` (where the queue item is built from the draft, around the `caption: draft.caption` lines)
- Test: `services/party/test/party.test.ts`

**Interfaces:**
- Produces: `TextPlaceSchema = z.object({ x: z.number().min(-50).max(150), y: z.number().min(-50).max(150), width: z.number().min(5).max(100) })`, `type TextPlace`; `MediaDraft.textPlace: TextPlace | null` (default null); `QueueItem.textPlace: TextPlace | null` (default null), so `HistoryItem` has it too. Units: percent of the screen, like scene layers; `x`,`y` are the top-left corner.

- [ ] **Step 1: Write the failing test** `it('keeps where the text was placed, and nothing when it was not moved')`: create a media with `caption: 'salut'` and `textPlace: { x: 10, y: 70, width: 50 }`; the queue item has that `textPlace`. A second media without the field has `textPlace: null`. A third with `width: 2` is refused with 400.
- [ ] **Step 2: Run** `npx vitest run -t "keeps where the text"` in `services/party`. Expected: FAIL (`textPlace` undefined).
- [ ] **Step 3: Implement** the schema fields and copy `textPlace: draft.textPlace` into the stored item.
- [ ] **Step 4: Run** the same test, then the whole service suite and `npx tsc --noEmit -p .`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** « Text place travels with a LiveChat ».

### Task 2: The overlay shows the text where it was placed

**Files:**
- Modify: `apps/desktop/src/renderer/src/scene.tsx` (`Caption`, and the `Playing` render at the `item.caption && <Caption …>` line)
- Modify: `apps/desktop/src/renderer/src/styles.css` (a `.zone-text.is-placed` rule if the placed box needs its own alignment)
- Test: `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Consumes: `TextPlace` from Task 1.
- Produces: `Caption({ text, zone, place }: { text: string; zone: Zone; place?: TextPlace | null })`. With a place: absolute box at `left: x%`, `top: y%`, `width: width%`, same text sizing rules as today; without: unchanged.

- [ ] **Step 1: Write the failing test** inside `it('shows in small what the others will see, and places things freely in the advanced mode')`: after the existing scene send, send one more advanced LiveChat with moved text (Task 3 makes this possible from the UI; until then send it through `window.liveChat.sendScene` with `textPlace: { x: 5, y: 10, width: 40 }`), then expect the overlay's `[data-testid="overlay-text"]` bounding box left edge within 2% of 5% of the overlay width.
- [ ] **Step 2: Run** the e2e suite in the background. Expected: that step fails.
- [ ] **Step 3: Implement** `place` in `Caption` and pass `item.textPlace` from `Playing`.
- [ ] **Step 4: Run** the e2e suite. Expected: PASS.
- [ ] **Step 5: Commit** « The overlay shows the text where it was placed ».

### Task 3: Drag the text in LiveChat avancé, with « Remettre à sa place »

**Files:**
- Modify: `apps/desktop/src/renderer/src/control/use-scene.ts` (`Stage` gains `textPlace: TextPlace | null`, undoable like layers; `setTextPlace(place: TextPlace | null)`)
- Modify: `apps/desktop/src/renderer/src/control/AdvancedEditor.tsx` (`EditingStage` renders the caption draggable; toolbar button)
- Modify: `apps/desktop/src/main/index.ts` (`SceneInputSchema` gains `textPlace: TextPlaceSchema.nullable().default(null)`; `sceneRecipe` and the send pass it on; saving and reloading a saved scene keeps it)
- Modify: `apps/desktop/src/main/library.ts` (saved LiveChat recipe keeps `textPlace`)
- Modify: `apps/desktop/src/shared/ipc.ts` (scene input and loaded draft types)
- Test: `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Consumes: Task 1 schema, Task 2 overlay.
- Produces: the draggable box has `data-testid="scene-text"`; the button `data-testid="text-reset"` with label « Remettre à sa place », shown only when `textPlace !== null`. Dragging starts from the zone the viewer would use, converted to percent of the stage, and clamps to the schema limits.

- [ ] **Step 1: Write the failing test** in the advanced-mode e2e test: type a text, drag `scene-text` by (120, -60) px, expect `text-reset` visible; send; expect the overlay text moved (as in Task 2); reopen the editor, click `text-reset`, expect it hidden and the next send to have the text in the usual zone. Also save it to the Library before the reset and reload it: the moved place comes back.
- [ ] **Step 2: Run** e2e in the background. Expected: FAIL (no `scene-text`).
- [ ] **Step 3: Implement** the stage state, the pointer drag on the caption (same pointer-capture pattern as layer dragging in `AdvancedEditor.tsx`), the button, and the main-process plumbing.
- [ ] **Step 4: Run** typecheck and e2e. Expected: PASS.
- [ ] **Step 5: Commit** « Move the text in LiveChat avancé, and put it back ».

### Task 4: Clipboard history module

**Files:**
- Create: `apps/desktop/src/main/clipboard-history.ts`
- Modify: `apps/desktop/src/main/index.ts` (start it after the app is ready; stop on quit)
- Modify: `apps/desktop/src/main/settings-store.ts` (persist `clipboardPaused: boolean`, default false)
- Test: covered end to end in Task 5 (the desktop app has no unit-test runner; do not add one for this).

**Interfaces:**
- Produces:
  - `type ClipView = { id: string; path: string; thumbnailUrl: string; starred: boolean; copiedAt: number; width: number; height: number }`
  - `createClipboardHistory(dir: string, read: ClipboardReader, onChange: () => void): ClipboardHistory`
  - `type ClipboardReader = { formats(): string[]; image(): Electron.NativeImage; buffer(format: string): Buffer }` (production passes Electron's `clipboard`)
  - `interface ClipboardHistory { start(): void; stop(): void; poll(): void; list(): ClipView[]; star(id: string, on: boolean): void; remove(id: string): void; clear(): void; setPaused(on: boolean): void; paused(): boolean }`
- Rules (from the spec): images only; skip when `formats()` contains `ExcludeClipboardContentFromMonitorProcessing`, or contains `CanIncludeInClipboardHistory` whose first byte is 0; identical to the latest entry (SHA-1 of the PNG bytes) → ignore; identical to an older entry → move it to the top; keep 50 unstarred; `clear()` removes unstarred only **(builder's call: starred means kept forever)**. Files: `<dir>/<id>.png` plus `<dir>/index.json`, `dir = app.getPath('userData')/clipboard`.

- [ ] **Step 1: Implement** the module and wire it (poll every 1000 ms; paused → `poll()` returns at once).
- [ ] **Step 2: Typecheck.** Expected: no errors.
- [ ] **Step 3: Commit** « Keep the last copied images ».

### Task 5: « Presse-papier » in the Library

**Files:**
- Modify: `apps/desktop/src/shared/ipc.ts` (channels `ClipboardList`, `ClipboardUse`, `ClipboardStar`, `ClipboardRemove`, `ClipboardClear`, `ClipboardPause`, event `ClipboardChanged`; API methods `listClipboard(): Promise<{ items: ClipView[]; paused: boolean }>`, `useClipboardImage(id): Promise<{ ok: true; draft: DraftMedia } | { ok: false }>`, `starClipboardImage(id, on)`, `removeClipboardImage(id)`, `clearClipboard()`, `pauseClipboard(on)`, `onClipboardChanged(cb)`)
- Modify: `apps/desktop/src/preload/index.ts`
- Modify: `apps/desktop/src/main/index.ts` (handlers; `useClipboardImage` uses the existing `putInDraft` with `contentType: 'image/png'`)
- Modify: `apps/desktop/src/renderer/src/control/LibraryScreen.tsx` (`Category` gains `'clipboard'`, label « Presse-papier », grid of thumbnails with star and remove, « Vider » and « Pause »/« Reprendre » buttons, empty state « Copie une image (Ctrl+C) : elle arrive ici. »)
- Test: `apps/desktop/test/party.e2e.ts`

**Interfaces:**
- Consumes: Task 4 `ClipboardHistory`.
- Produces: test ids `clipboard-item`, `clipboard-star`, `clipboard-clear`, `clipboard-pause`.

- [ ] **Step 1: Write the failing test** `it('keeps copied images in the library, and puts one in the LiveChat on a click')`: from the main process (`electronApp.evaluate`) write a PNG to the clipboard twice, then another; open Bibliothèque › Presse-papier; expect 2 items. Write text to the clipboard: still 2. Write an image with the `ExcludeClipboardContentFromMonitorProcessing` format set: still 2. Star one, click « Vider »: 1 left. Click it: the LiveChat tab shows the picture ready to send. Pause, copy a new image: still 1.
- [ ] **Step 2: Run** e2e in the background. Expected: FAIL.
- [ ] **Step 3: Implement** IPC, preload and the category.
- [ ] **Step 4: Run** typecheck and e2e. Expected: PASS.
- [ ] **Step 5: Commit** « Presse-papier in the Library ».

### Task 6: Patch notes and roadmap

**Files:**
- Modify: `apps/desktop/src/shared/patch-notes.ts` (next version entry, French, two lines: text moved in LiveChat avancé; Presse-papier in the Library)
- Modify: `docs/FEUILLE-DE-ROUTE.md` (« Ensuite »: this version prepared, not published)

- [ ] **Step 1: Write the entries.**
- [ ] **Step 2: Run** the full e2e suite once more. Expected: all pass.
- [ ] **Step 3: Commit and push** « Movable text and clipboard history » (standing approval to push; do not publish).
