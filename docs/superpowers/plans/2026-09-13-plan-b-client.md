# QuizClash Plan B — Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React client — a mobile-first, neobrutalist UI for every phase of a QuizClash game — and the two small engine additions it depends on, completing modules 6–7 of the spec on top of Plan A's already-shipped, already-tested engine and Durable Object.

**Architecture:** A separate `web/` npm project (its own `package.json`, own Vite build, deployed to Vercel) sits beside the existing root Worker project. It imports `src/shared/types.ts` and `src/shared/constants.ts` directly by relative path — one source of truth for the wire protocol, no code duplication, no workspace tooling. A thin `RealtimeClient` class owns the one WebSocket connection and exposes typed events; a `useGameConnection` hook adapts it to React; every screen is a pure function of `PublicState.phase` plus the fields that phase carries. No screen computes a score, chooses when a phase ends, or decides who is host — that discipline, enforced structurally in the engine, is preserved by never letting a component reach for anything but what the server sent.

**Tech Stack:** React 19.3, Vite 8.3, TypeScript 5.7 (pinned to match the existing root project, not the newly-released TS 7 — see Global Constraints), Tailwind CSS 4.3 + the neobrutalism.dev component registry (shadcn-based), `motion` 13.2, `canvas-confetti` 1.9, DiceBear via its public HTTP API (no npm dependency), Vitest + `@testing-library/react` for component tests, Playwright for E2E.

**Spec:** `docs/superpowers/specs/2026-09-12-trivia-game-design.md` — read in full before starting, especially §6 (state machine, reconnect-token wire contract, the two engine gaps this plan opens with), §7 (setup wizard), §9 (visual design), §10 (testing strategy).

**Prior work:** `docs/superpowers/plan-a-outcomes.md` — records why the engine is shaped the way it is; read it if a design choice in the code looks surprising.

## Global Constraints

- **Immutability:** React state updates never mutate; every reducer/handler returns new objects. (spec §2, coding-style.md)
- **Files 200–400 lines typical, 800 max; functions under 50 lines; nesting max 4 levels.**
- **TypeScript is pinned to `^5.7.0` across the whole repo, not bumped to the newly-released TS 7.** The root Worker project already ships 207+ passing tests against TS 5.7; a major-version jump for Plan B's sake would risk destabilizing already-shipped code for no benefit this plan needs. Verified 2026-09-13: `npm view typescript version` → `7.0.2` is latest, but this project stays on 5.7 deliberately.
- **Verified package versions (2026-09-13), not guessed:** `react@19.3.0`, `react-dom@19.3.0`, `vite@8.3.0`, `@vitejs/plugin-react@6.1.1` (peer-requires `vite@^8.0.0` — satisfied), `@tailwindcss/vite@4.3.3`, `tailwindcss@4.3.3`, `motion@13.2.0`, `canvas-confetti@1.9.4`, `@testing-library/react@16.3.3` (peer-supports React 19), `@testing-library/jest-dom@7.0.1`, `@testing-library/user-event@14.6.7`, `jsdom@30.0.1`, `@playwright/test@1.63.0`, `shadcn@4.21.0`. Node engine check: `vite@8.3.0` requires `node ^20.19.0 || >=22.12.0`; this machine runs `v24.18.0` — satisfied.
- **Neobrutalism uses Tailwind v4 CSS-first syntax**, verified by reading the actual source at `github.com/ekmas/neobrutalism-components` (`src/styling/globals.css`) rather than guessing: `@import "tailwindcss";`, an `@theme inline` block, `oklch()` color values, no `tailwind.config.js` theme extension needed. The exact file to reproduce is in Task 4.
- **Components install via the shadcn CLI against neobrutalism's registry**, one at a time: `npx shadcn@latest add https://neobrutalism.dev/r/<name>.json`. Verified component names that exist in the registry and this plan uses: `button`, `card`, `input`, `label`, `progress`, `avatar`, `badge`, `sheet`.
- **DiceBear needs no npm package.** Confirmed: a plain `<img src="https://api.dicebear.com/10.x/<style>/svg?seed=...">` is the documented, supported usage. No upload, no hosting, no moderation surface — matches spec decision #1.
- **Mobile-first, portrait primary** (spec §9): question screen top ~35% text / bottom ~55% 2×2 grid; timer is a shrinking bar, never a number; the page never scrolls horizontally at any breakpoint; safe-area insets respected.
- **Color is never the only signal.** Each answer slot carries a distinct shape *and* hue (spec §9 table) — color-blind players must be able to tell slots apart by shape alone.
- **The client renders state and sends intent. It never computes a score, decides when a question ends, or advances a phase.** Every screen's local state is UI-only (which tab is open, an input's current text) — never game state.
- **Testing:** TDD, RED → GREEN → REFACTOR. Component tests via `@testing-library/react` assert on rendered output and user interaction, never on implementation details. One E2E happy-path flow via Playwright, two browser contexts, mobile viewport (spec §10).
- **Commits:** `<type>: <description>`.
- **No secrets in the client.** The Gemini key never leaves the Worker; nothing in `web/` reads or references it.

## File Structure

```
web/                                  # separate npm project, own package.json
  package.json
  vite.config.ts
  vitest.config.ts
  playwright.config.ts
  tsconfig.json
  index.html
  .env.development                    # VITE_WS_HOST=localhost:8787
  .env.production                     # VITE_WS_HOST left for the user to set at deploy time
  src/
    main.tsx                          # ReactDOM root
    App.tsx                           # phase router, reconnect-on-mount
    globals.css                       # Tailwind v4 + neobrutalism theme (Task 4)
    components/
      ui/                             # shadcn/neobrutalism components (installed, not hand-written)
      AvatarPicker.tsx                # Task 5
      AnswerTile.tsx                  # Task 12 (shared by Question/Reveal)
    lib/
      realtimeClient.ts               # Task 6 — pure connection class
      session.ts                      # Task 6 — sessionStorage read/write for {lobbyCode, playerId, reconnectToken}
      colors.ts                       # Task 12 — the shape+hue table from spec §9
    hooks/
      useGameConnection.ts            # Task 7
    screens/
      IdentityScreen.tsx              # Task 8
      LobbyScreen.tsx                 # Task 9
      SetupScreen.tsx                 # Task 10
      CountdownScreen.tsx             # Task 11
      QuestionScreen.tsx              # Task 12
      RevealScreen.tsx                # Task 13
      PodiumScreen.tsx                # Task 14
  e2e/
    happy-path.spec.ts                # Task 16
```

Every `.tsx` above with a task number gets a co-located `.test.tsx`.

---

### Task 1: Engine — unicast replies

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/engine/gameEngine.ts`
- Modify: `src/worker/GameRoom.ts`
- Test: `src/engine/gameEngine.lobby.test.ts`, `src/engine/gameEngine.setup.test.ts`, `src/worker/GameRoom.test.ts` (extend existing files, don't create new ones)

**Interfaces:**
- Consumes: current `EngineResult { state, broadcasts, alarmAtMs, effect }` (see `src/shared/types.ts`, read in full before starting)
- Produces: `EngineResult` gains `readonly replies: readonly { readonly to: string; readonly message: ServerMessage }[]`. Every call site that currently does `rejected(state, reason)` and every `ERROR` emission changes to populate `replies`, not `broadcasts`. Realtime Client (Task 6) and every screen that shows a rejection consume this.

Today, `rejected()` in `gameEngine.ts` returns `{ broadcasts: [{ type: 'REJECTED', reason }], ... }`, and `GameRoom.broadcast()` fans every message in `broadcasts` out to every connected socket via `this.ctx.getWebSockets()`. So when one player taps a host-only control, all four players see the rejection. This task fixes that at the source.

- [ ] **Step 1: Write the failing test**

Add to `src/engine/gameEngine.lobby.test.ts`:

```ts
describe('REJECTED replies are unicast, not broadcast', () => {
  test('a fifth joiner\'s rejection is a reply addressed to them, not a broadcast to the room', () => {
    const full = joinAll(createInitialState('ABCD'), ['p1', 'p2', 'p3', 'p4']);
    const result = reduce(full, join('p5'), 10);

    expect(result.broadcasts).toHaveLength(0);
    expect(result.replies).toContainEqual({
      to: 'p5',
      message: { type: 'REJECTED', reason: 'LOBBY_FULL' },
    });
  });
});
```

Add to `src/engine/gameEngine.setup.test.ts`:

```ts
describe('NOT_HOST replies are unicast', () => {
  test('a non-host\'s OPEN_SETUP rejection is a reply addressed only to them', () => {
    const state = lobbyWith(['p1', 'p2']);
    const result = reduce(state, { type: 'OPEN_SETUP', playerId: 'p2' }, 100);

    expect(result.broadcasts).toHaveLength(0);
    expect(result.replies).toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/gameEngine.lobby.test.ts src/engine/gameEngine.setup.test.ts`
Expected: FAIL — `replies` is `undefined`, `toContainEqual` fails.

- [ ] **Step 3: Add `replies` to `EngineResult` and thread it through**

In `src/shared/types.ts`, change:

```ts
export interface EngineResult {
  readonly state: GameState;
  readonly broadcasts: readonly ServerMessage[];
  readonly alarmAtMs: number | null;
  readonly effect: EngineEffect | null;
}
```

to:

```ts
export interface EngineResult {
  readonly state: GameState;
  readonly broadcasts: readonly ServerMessage[];
  /** Messages addressed to exactly one player — never fanned out to the room. */
  readonly replies: readonly { readonly to: string; readonly message: ServerMessage }[];
  readonly alarmAtMs: number | null;
  readonly effect: EngineEffect | null;
}
```

In `src/engine/gameEngine.ts`, find the `result(...)` and `rejected(...)` helpers (near the top of the file, used by every phase handler). Update them:

```ts
function result(state: GameState, overrides: Partial<EngineResult> = {}): EngineResult {
  return {
    state,
    broadcasts: broadcastState(state),
    replies: [],
    alarmAtMs: null,
    effect: null,
    ...overrides,
  };
}

function rejected(
  state: GameState,
  playerId: string,
  reason: 'LOBBY_FULL' | 'NOT_HOST' | 'BAD_PHASE' | 'BAD_TOKEN',
): EngineResult {
  return {
    state,
    broadcasts: [],
    replies: [{ to: playerId, message: { type: 'REJECTED', reason } }],
    alarmAtMs: null,
    effect: null,
  };
}
```

**This changes `rejected`'s signature from two arguments to three.** Every call site in `gameEngine.ts` currently reads `rejected(state, 'LOBBY_FULL')` etc. — search the file for every `rejected(` call and add the player id who should receive it as the second argument. Each call site already has that id in scope (it is always the player whose action was rejected): `handleJoin`'s `LOBBY_FULL` case uses `event.playerId`; `handleOpenSetup`'s `NOT_HOST`/`BAD_PHASE` cases use the event's `playerId`; `handleSubmitSetup`, `handlePlayAgain`, and `handleReconnect`'s `BAD_TOKEN` case follow the same pattern. Read each call site before changing it — do not guess the variable name, use whatever is already in scope there.

Also find where `ERROR` messages are constructed (the alarm-scheduling-failure broadcast in `GameRoom.ts`, and any other `ERROR` emission in `gameEngine.ts` if one exists — search for `type: 'ERROR'`). Leave the alarm-failure one as a broadcast: nobody has a "current actor" to address it to, it is a room-wide infrastructure failure, and this plan's design does not require changing it. Only `REJECTED` messages move to `replies`.

- [ ] **Step 4: Update `GameRoom.ts` to deliver replies**

`GameRoom.apply()` currently returns `outcome` after broadcasting. Add reply delivery. Find the socket matching a reply's `to` field among `this.ctx.getWebSockets()` — each socket's attachment carries `{ playerId }` (see `SocketMeta` in the same file), so:

```ts
private deliverReplies(replies: EngineResult['replies']): void {
  if (replies.length === 0) return;

  for (const socket of this.ctx.getWebSockets()) {
    const meta = socket.deserializeAttachment() as SocketMeta | null;
    if (meta === null) continue;

    for (const reply of replies) {
      if (reply.to !== meta.playerId) continue;
      try {
        socket.send(JSON.stringify(reply.message));
      } catch {
        // Same reasoning as `broadcast`: a socket that died between
        // getWebSockets() and send() is handled by webSocketClose.
      }
    }
  }
}
```

Call it from `apply()`, right after the existing `this.broadcast(outcome.broadcasts);` line:

```ts
this.broadcast(outcome.broadcasts);
this.deliverReplies(outcome.replies);
```

Also update `fetch()`'s pre-upgrade rejection check, which currently reads `outcome.broadcasts.find((m) => m.type === 'REJECTED')`. A `BAD_TOKEN` or `LOBBY_FULL` rejection on `PLAYER_JOIN`/`PLAYER_RECONNECT` now arrives in `outcome.replies`, not `outcome.broadcasts` — but at that point in `fetch()` no socket exists yet for the rejected connection attempt, so there is nothing to *deliver* the reply to. Change the check to read the reply directly:

```ts
const rejection = outcome.replies.find((r) => r.message.type === 'REJECTED');
const reason = rejection?.message.type === 'REJECTED' ? rejection.message.reason : undefined;
const rejectedResponse = rejectionResponse(reason);
if (rejectedResponse !== null) return rejectedResponse;
```

- [ ] **Step 5: Run the two failing tests to verify they pass**

Run: `npx vitest run src/engine/gameEngine.lobby.test.ts src/engine/gameEngine.setup.test.ts`
Expected: PASS.

- [ ] **Step 6: Add a GameRoom-level test proving the unicast property end to end**

Add to `src/worker/GameRoom.test.ts`, following the file's existing pattern of using `runInDurableObject` and two connected sockets (the same pattern the reconnect-token work already established for proving the `IDENTITY` message is unicast — read that existing test first and match its shape):

```ts
test('a NOT_HOST rejection reaches only the rejected player, never the other seated players', async () => {
  const stub = room('WXYZ');
  const hostSocket = await connectAndAccept(stub, 'WXYZ', 'p1');
  const otherSocket = await connectAndAccept(stub, 'WXYZ', 'p2');

  const otherFrames = collectFrames(otherSocket);
  hostSocket.send(JSON.stringify({ type: 'noop-drain' })); // drains nothing, keeps timing simple
  otherSocket.send(JSON.stringify({ type: 'OPEN_SETUP' })); // p2 is not host

  const frames = await otherFrames;
  expect(frames).toContainEqual({ type: 'REJECTED', reason: 'NOT_HOST' });

  const hostFrames = await collectFrames(hostSocket);
  expect(hostFrames.some((f) => f.type === 'REJECTED')).toBe(false);
});
```

If `connectAndAccept`/`collectFrames` helpers do not already exist in the test file under those exact names, use whatever the file's existing tests actually call for "connect a socket, accept it client-side, collect the frames it receives" — read the file first and match its real helper names rather than inventing new ones. The test's *assertion* (one player gets `NOT_HOST`, the other gets no `REJECTED` at all) is what matters; adapt the mechanics to the file's established style.

- [ ] **Step 7: Run it, then the full suite**

Run: `npx vitest run src/worker/GameRoom.test.ts`
Expected: PASS.

Run: `npm test`
Expected: all tests pass (208 existing + new ones). Some pre-existing tests that assert on `result.broadcasts` containing a `REJECTED` message will now fail, because that message moved to `replies` — find every such assertion across the suite (search test files for `toContainEqual({ type: 'REJECTED'` and similar) and update them to check `result.replies` instead, following the shape `{ to: '<playerId>', message: { type: 'REJECTED', reason: '<reason>' } }`.

- [ ] **Step 8: Typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/shared/types.ts src/engine/gameEngine.ts src/worker/GameRoom.ts src/engine/gameEngine.lobby.test.ts src/engine/gameEngine.setup.test.ts src/engine/gameEngine.round.test.ts src/engine/gameEngine.resilience.test.ts src/worker/GameRoom.test.ts
git commit -m "fix: address REJECTED messages to one player instead of broadcasting them"
```

---

### Task 2: Engine — `answered` and `deltas` on `PublicState`

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/engine/gameEngine.ts`
- Test: `src/engine/gameEngine.round.test.ts`

**Interfaces:**
- Consumes: `GameState.answers: readonly Answer[]` (already exists — each has `playerId`, `choiceIndex`, `answeredAtMs`, `points`), `GameState.players`
- Produces: `PublicState` gains `answered: readonly string[]` (populated only during `QUESTION`) and `deltas: readonly { playerId: string; points: number; choiceIndex: ChoiceIndex }[]` (populated only during `REVEAL`). Both are `[]` in every other phase. Consumed by `QuestionScreen` (Task 12, an "n of 4 answered" indicator) and `RevealScreen` (Task 13, the per-question score delta the spec's REVEAL row promises).

- [ ] **Step 1: Write the failing test**

Add to `src/engine/gameEngine.round.test.ts`:

```ts
describe('answered and deltas projections', () => {
  test('answered lists player ids who have answered the live question, during QUESTION only', () => {
    let state = atFirstQuestion(['p1', 'p2', 'p3']);
    state = answer(state, 'p1', 0, 1000).state;

    const publicState = toPublicState(state);
    expect(publicState.answered).toEqual(['p1']);
  });

  test('answered is empty outside QUESTION', () => {
    const state = atFirstQuestion(['p1', 'p2'], 1);
    const publicState = toPublicState({ ...state, phase: 'LOBBY' });
    expect(publicState.answered).toEqual([]);
  });

  test('deltas carries each answer\'s points and choice, during REVEAL only', () => {
    let state = atFirstQuestion(['p1', 'p2'], 1);
    state = answer(state, 'p1', 0, 1000).state;
    const result = answer(state, 'p2', 1, 1200); // both have now answered -> REVEAL

    expect(result.state.phase).toBe('REVEAL');
    const publicState = toPublicState(result.state);
    expect(publicState.deltas).toContainEqual({ playerId: 'p1', points: 1000, choiceIndex: 0 });
    expect(publicState.deltas).toContainEqual({ playerId: 'p2', points: 0, choiceIndex: 1 });
  });

  test('deltas is empty outside REVEAL', () => {
    const state = atFirstQuestion(['p1'], 1);
    expect(toPublicState(state).deltas).toEqual([]);
  });
});
```

`atFirstQuestion` and `answer` already exist as helpers in this file (used throughout the existing round tests) — reuse them, do not redefine.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/engine/gameEngine.round.test.ts`
Expected: FAIL — `answered`/`deltas` are `undefined` on the returned object.

- [ ] **Step 3: Add the fields to `PublicState` and populate them in `toPublicState`**

In `src/shared/types.ts`, add to `PublicState`:

```ts
export interface PublicState {
  readonly phase: GamePhase;
  readonly lobbyCode: string;
  readonly hostId: string | null;
  readonly players: readonly PublicPlayer[];
  readonly questionIndex: number;
  readonly totalQuestions: number;
  readonly phaseEndsAtMs: number | null;
  readonly prompt: { readonly question: string; readonly choices: readonly string[] } | null;
  /** Player ids who have answered the live question. Empty outside QUESTION. */
  readonly answered: readonly string[];
  readonly reveal: {
    readonly correctIndex: number;
    readonly explanation: string;
    readonly sourceQuote: string;
  } | null;
  /** Each seated player's outcome on the question just revealed. Empty outside REVEAL. */
  readonly deltas: readonly { readonly playerId: string; readonly points: number; readonly choiceIndex: ChoiceIndex }[];
  readonly error: string | null;
}
```

In `src/engine/gameEngine.ts`, find `toPublicState` (near the top of the file) and add the two projections, both pure derivations of `state.answers` — no new state to track:

```ts
export function toPublicState(state: GameState): PublicState {
  const current = state.questions[state.questionIndex];
  const isLive = state.phase === 'QUESTION';
  const isReveal = state.phase === 'REVEAL';

  return {
    phase: state.phase,
    lobbyCode: state.lobbyCode,
    hostId: state.hostId,
    players: state.players.map(({ reconnectToken, ...rest }) => rest),
    questionIndex: state.questionIndex,
    totalQuestions: state.questions.length,
    phaseEndsAtMs: state.phaseEndsAtMs,
    prompt:
      (isLive || isReveal) && current !== undefined
        ? { question: current.question, choices: current.choices }
        : null,
    answered: isLive ? state.answers.map((a) => a.playerId) : [],
    reveal:
      isReveal && current !== undefined
        ? {
            correctIndex: current.correctIndex,
            explanation: current.explanation,
            sourceQuote: current.sourceQuote,
          }
        : null,
    deltas: isReveal
      ? state.answers.map((a) => ({ playerId: a.playerId, points: a.points, choiceIndex: a.choiceIndex }))
      : [],
    error: state.error,
  };
}
```

Read the actual current body of `toPublicState` before editing — the code above shows every field it must end up with, but match the file's existing formatting and confirm no field was missed or renamed from what is already there (particularly the exact player-stripping expression, which Task 1's reconnect-token work already added).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/engine/gameEngine.round.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm test`
Expected: all pass. (No other test should reference `PublicState` exhaustively enough to break — but if any test constructs a full `PublicState` object literal for comparison, e.g. a "toPublicState never exposes X" test, it will need `answered: []` and `deltas: []` added. Search for `toPublicState(` call sites in tests and check.)

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/engine/gameEngine.ts src/engine/gameEngine.round.test.ts
git commit -m "feat: add answered and deltas projections to PublicState"
```

---

### Task 3: Scaffold the `web/` React app

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/tsconfig.node.json`, `web/index.html`, `web/src/main.tsx`, `web/src/App.tsx`, `web/src/App.test.tsx`, `web/vitest.config.ts`, `web/src/vitest.setup.ts`

**Interfaces:**
- Consumes: `src/shared/types.ts` (imported by relative path from outside `web/`)
- Produces: a booting Vite dev server, a passing component test, and proof the cross-package import works — every later task depends on this.

This is the one task in the plan most likely to hit an unexpected tooling problem (Vite restricts serving files outside its project root by default), so it exists to surface that immediately rather than mid-build.

- [ ] **Step 1: Create `web/package.json`**

```json
{
  "name": "quizclash-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": {
    "react": "^19.3.0",
    "react-dom": "^19.3.0",
    "motion": "^13.2.0",
    "canvas-confetti": "^1.9.4"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^6.1.1",
    "@tailwindcss/vite": "^4.3.3",
    "tailwindcss": "^4.3.3",
    "tw-animate-css": "^1.2.0",
    "@types/react": "^19.3.0",
    "@types/react-dom": "^19.3.0",
    "@types/canvas-confetti": "^1.9.0",
    "typescript": "^5.7.0",
    "vite": "^8.3.0",
    "vitest": "^4.1.11",
    "jsdom": "^30.0.1",
    "@testing-library/react": "^16.3.3",
    "@testing-library/jest-dom": "^7.0.1",
    "@testing-library/user-event": "^14.6.7",
    "@playwright/test": "^1.63.0"
  }
}
```

> **Why TypeScript stays at `^5.7.0` here too, not the `web/` project's own choice of 7.x:** the Global Constraints section already covers this — one version across the repo, deliberately, even though `web/` is a separate npm project free to choose differently. Consistency here avoids two different sets of TS error messages/behavior between the two halves of one codebase.

- [ ] **Step 2: Create `web/tsconfig.json` and `web/tsconfig.node.json`**

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "noEmit": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "../src/shared/**/*.ts"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`web/tsconfig.node.json` (for `vite.config.ts` itself, which runs under Node, not the browser):

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

> `noUncheckedIndexedAccess: true` matches the root project's `tsconfig.json` — the same discipline that caught real bugs in Plan A applies here too.

- [ ] **Step 3: Create `web/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // The shared types live one directory up, outside this project's own
    // root. Vite refuses to serve files outside its detected root by
    // default; this is what lets `../src/shared/*` resolve in dev.
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  },
});
```

- [ ] **Step 4: Create `web/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>QuizClash</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `web/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './globals.css';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('#root element is missing from index.html');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`./globals.css` does not exist yet — Task 4 creates it. For this task, create a placeholder so the import resolves:

```bash
echo "/* Tailwind + neobrutalism theme — populated in Task 4 */" > web/src/globals.css
```

- [ ] **Step 6: Write the failing test for `App.tsx`**

Create `web/src/App.test.tsx`:

```tsx
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App.js';
import type { GamePhase } from '../../src/shared/types.js';

describe('App', () => {
  test('imports the shared GamePhase type across the package boundary without error', () => {
    const phase: GamePhase = 'LOBBY';
    expect(phase).toBe('LOBBY');
  });

  test('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText(/quizclash/i)).toBeInTheDocument();
  });
});
```

The first test exists specifically to prove the cross-package TypeScript import resolves at both typecheck time and test-run time — if `../../src/shared/types.js` cannot be found, this file fails to compile before either test body runs.

- [ ] **Step 7: Run test to verify it fails**

Run: `cd web && npx vitest run src/App.test.tsx`
Expected: FAIL — `Cannot find module './App.js'` (it doesn't exist yet).

- [ ] **Step 8: Create `web/src/App.tsx`**

```tsx
export default function App() {
  return <div>QuizClash</div>;
}
```

- [ ] **Step 9: Create `web/vitest.config.ts` and `web/src/vitest.setup.ts`**

`web/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    globals: false,
  },
});
```

`web/src/vitest.setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 10: Install dependencies and run the test to verify it passes**

Run: `cd web && npm install`
Run: `npx vitest run src/App.test.tsx`
Expected: PASS — both tests, including the cross-package import.

- [ ] **Step 11: Verify the dev server actually boots and can serve the shared-type-importing app**

Run: `cd web && npm run dev` (in the background — this is a long-running process, not a one-shot command; start it, then in a second terminal or after backgrounding it, continue)
Run: `curl -s http://localhost:5173/` and confirm it returns the HTML page (not an error)
Stop the dev server afterward.

If the `fs.allow` configuration in Step 3 is insufficient (a 403 or "not allowed" error appears in the dev server's own logs when the browser requests a file under `../src/shared/`), the fix is to broaden `fs.allow` to the actual monorepo root — confirm by checking what path the error names, then adjust. Do not guess; read the actual error.

- [ ] **Step 12: Typecheck both projects still pass**

Run: `cd web && npm run typecheck` → expect exit 0.
Run: `cd .. && npm run typecheck` (the root Worker project) → expect exit 0, unaffected by anything in `web/`.

- [ ] **Step 13: Commit**

```bash
git add web/package.json web/package-lock.json web/vite.config.ts web/vitest.config.ts web/tsconfig.json web/tsconfig.node.json web/index.html web/src/main.tsx web/src/App.tsx web/src/App.test.tsx web/src/globals.css web/src/vitest.setup.ts
git commit -m "chore: scaffold the web client with a verified cross-package shared-types import"
```

---

### Task 4: Tailwind v4 + neobrutalism installation

**Files:**
- Modify: `web/src/globals.css`
- Create: `web/components.json` (shadcn CLI config)
- Create (via CLI, not hand-written): `web/src/components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `progress.tsx`, `avatar.tsx`, `badge.tsx`, `sheet.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: every later screen task imports from `./components/ui/*`

- [ ] **Step 1: Replace the placeholder `globals.css`**

This is the actual, verified content of neobrutalism.dev's own `globals.css` (read directly from `github.com/ekmas/neobrutalism-components/src/styling/globals.css`, not reconstructed from memory), trimmed of the marketing-site-only rules (marquee keyframes, custom scrollbar styling, chart colors) this project doesn't use:

```css
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

:root {
  --border-radius: 5px;
  --box-shadow-x: 4px;
  --box-shadow-y: 4px;
  --reverse-box-shadow-x: -4px;
  --reverse-box-shadow-y: -4px;

  --heading-font-weight: 700;
  --base-font-weight: 500;

  --background: oklch(93.46% 0.0304 254.32);
  --secondary-background: oklch(100% 0 0);
  --foreground: oklch(0% 0 0);
  --main-foreground: oklch(0% 0 0);

  --main: oklch(67.47% 0.1725 259.61);
  --border: oklch(0% 0 0);
  --ring: oklch(0% 0 0);
  --overlay: oklch(0% 0 0 / 0.8);

  --shadow: var(--box-shadow-x) var(--box-shadow-y) 0px 0px var(--border);
}

.dark {
  --background: oklch(29.12% 0.0633 270.86);
  --secondary-background: oklch(23.93% 0 0);
  --foreground: oklch(92.49% 0 0);
  --main-foreground: oklch(0% 0 0);

  --border: oklch(0% 0 0);
  --ring: oklch(100% 0 0);

  --shadow: var(--box-shadow-x) var(--box-shadow-y) 0px 0px var(--border);
}

@theme inline {
  --color-main: var(--main);
  --color-background: var(--background);
  --color-secondary-background: var(--secondary-background);
  --color-foreground: var(--foreground);
  --color-main-foreground: var(--main-foreground);
  --color-border: var(--border);
  --color-overlay: var(--overlay);
  --color-ring: var(--ring);

  --spacing-boxShadowX: var(--box-shadow-x);
  --spacing-boxShadowY: var(--box-shadow-y);
  --spacing-reverseBoxShadowX: var(--reverse-box-shadow-x);
  --spacing-reverseBoxShadowY: var(--reverse-box-shadow-y);

  --radius-base: var(--border-radius);

  --shadow-shadow: var(--shadow);

  --font-weight-base: var(--base-font-weight);
  --font-weight-heading: var(--heading-font-weight);
}

@layer base {
  body {
    @apply text-foreground font-base;
  }

  h1, h2, h3, h4, h5, h6 {
    @apply font-heading;
  }
}

/*
 * Spec §9 mobile layout: the page must never scroll horizontally at any
 * breakpoint, and safe-area insets must be respected on notched phones.
 * Global, not per-screen, so no later task can accidentally reintroduce
 * horizontal overflow.
 */
html, body, #root {
  overflow-x: hidden;
  max-width: 100vw;
}

body {
  padding-left: env(safe-area-inset-left);
  padding-right: env(safe-area-inset-right);
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}
```

This gives every neobrutalism component access to Tailwind utility classes like `bg-main`, `text-foreground`, `border-border`, `shadow-shadow`, `rounded-base` — the CLI-installed components in the next steps already reference these class names, so nothing further is needed to wire them up.

- [ ] **Step 2: Initialize the shadcn CLI**

Run: `cd web && npx shadcn@latest init`

When prompted: base color doesn't matter (neobrutalism overrides it — per the neobrutalism docs, "the baseColor choice doesn't affect styling"), choose the default. Confirm it writes `web/components.json` and does not overwrite the `globals.css` from Step 1 — if it offers to overwrite, decline and keep the neobrutalism version; check the resulting file afterward and restore Step 1's content if the CLI touched it.

- [ ] **Step 3: Install each component from the neobrutalism registry**

Run each of these from `web/`:

```bash
npx shadcn@latest add https://neobrutalism.dev/r/button.json
npx shadcn@latest add https://neobrutalism.dev/r/card.json
npx shadcn@latest add https://neobrutalism.dev/r/input.json
npx shadcn@latest add https://neobrutalism.dev/r/label.json
npx shadcn@latest add https://neobrutalism.dev/r/progress.json
npx shadcn@latest add https://neobrutalism.dev/r/avatar.json
npx shadcn@latest add https://neobrutalism.dev/r/badge.json
npx shadcn@latest add https://neobrutalism.dev/r/sheet.json
```

Each writes one file to `web/src/components/ui/` and may pull in a `@radix-ui/react-*` peer dependency automatically — let the CLI manage those, do not hand-add them.

- [ ] **Step 4: Verify the build actually produces styled output**

This is a visual/structural check, not a unit test — component styling has no meaningful assertion beyond "did the CSS apply."

Temporarily replace `web/src/App.tsx` with:

```tsx
import { Button } from './components/ui/button.js';

export default function App() {
  return <Button>QuizClash</Button>;
}
```

Run: `cd web && npm run dev`, open it in a browser (or use the preview browser tooling), and confirm the button renders with a visible black border, an offset drop shadow, and a solid background color — the neobrutalism look, not an unstyled HTML button. Stop the dev server.

Revert `App.tsx` to its Task 3 content (`<div>QuizClash</div>`) — Task 8 is what actually builds the real app shell; this step was verification only.

- [ ] **Step 5: Confirm the existing test still passes and typecheck is clean**

Run: `cd web && npm test`
Expected: `App.test.tsx`'s two tests still pass (App.tsx is back to its Task 3 content).

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/globals.css web/components.json web/src/components/ui/ web/package.json web/package-lock.json
git commit -m "chore: install Tailwind v4 and the neobrutalism component set"
```

---

### Task 5: Avatar picker

**Files:**
- Create: `web/src/components/AvatarPicker.tsx`, `web/src/components/AvatarPicker.test.tsx`

**Interfaces:**
- Consumes: `Avatar`, `AvatarImage` from `./ui/avatar.js` (installed in Task 4)
- Produces: `interface AvatarPickerProps { readonly value: string; readonly onChange: (seed: string) => void }`, default export `AvatarPicker`. Consumed by `IdentityScreen` (Task 8).

A grid of 12 pre-seeded DiceBear avatars. Selecting one calls `onChange` with that seed — the component is otherwise stateless, matching the "client renders state, sends intent" discipline: which seed is *currently chosen* lives in the parent screen, not here.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AvatarPicker from './AvatarPicker.js';

describe('AvatarPicker', () => {
  test('renders 12 avatar options', () => {
    render(<AvatarPicker value="seed-1" onChange={() => {}} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(12);
  });

  test('every avatar image points at the DiceBear HTTP API with a distinct seed', () => {
    render(<AvatarPicker value="seed-1" onChange={() => {}} />);
    const sources = screen.getAllByRole('img').map((img) => img.getAttribute('src'));
    for (const src of sources) {
      expect(src).toMatch(/^https:\/\/api\.dicebear\.com\/10\.x\/[a-z-]+\/svg\?seed=/);
    }
    expect(new Set(sources).size).toBe(12);
  });

  test('calls onChange with the seed of the clicked avatar', async () => {
    const onChange = vi.fn();
    render(<AvatarPicker value="seed-1" onChange={onChange} />);
    const user = userEvent.setup();

    const images = screen.getAllByRole('img');
    const targetSeed = new URL(images[3]!.getAttribute('src')!).searchParams.get('seed');
    await user.click(images[3]!);

    expect(onChange).toHaveBeenCalledWith(targetSeed);
  });

  test('marks the currently selected avatar distinctly from the others', () => {
    render(<AvatarPicker value="seed-1" onChange={() => {}} />);
    const selected = screen.getByRole('img', { name: /selected/i });
    expect(selected).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/AvatarPicker.test.tsx`
Expected: FAIL — `Cannot find module './AvatarPicker.js'`.

- [ ] **Step 3: Create `web/src/components/AvatarPicker.tsx`**

```tsx
const AVATAR_STYLE = 'bottts';
const SEED_COUNT = 12;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => `quizclash-avatar-${i}`);

function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/10.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}

export interface AvatarPickerProps {
  readonly value: string;
  readonly onChange: (seed: string) => void;
}

export default function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-3" role="group" aria-label="Choose an avatar">
      {SEEDS.map((seed) => {
        const isSelected = seed === value;
        return (
          <button
            key={seed}
            type="button"
            onClick={() => onChange(seed)}
            className={`rounded-base border-2 border-border p-1 transition-transform ${
              isSelected ? 'bg-main scale-105' : 'bg-secondary-background'
            }`}
          >
            <img
              src={avatarUrl(seed)}
              alt={isSelected ? `${seed} (selected)` : seed}
              className="h-full w-full"
            />
          </button>
        );
      })}
    </div>
  );
}
```

`bottts` is one of the styles confirmed to exist in DiceBear's current catalog and reads as "playful robot" — fitting the game's tone without leaning toward a photorealistic style that would look out of place next to the neobrutalism component set.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/AvatarPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full test suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/AvatarPicker.tsx web/src/components/AvatarPicker.test.tsx
git commit -m "feat: add DiceBear avatar picker"
```

---

### Task 6: Realtime client and session storage

**Files:**
- Create: `web/src/lib/realtimeClient.ts`, `web/src/lib/realtimeClient.test.ts`
- Create: `web/src/lib/session.ts`, `web/src/lib/session.test.ts`

**Interfaces:**
- Consumes: `ServerMessage`, `PublicState` from `../../../src/shared/types.js`
- Produces:
  - `session.ts`: `interface StoredSession { readonly lobbyCode: string; readonly playerId: string; readonly reconnectToken: string }`; `function saveSession(session: StoredSession): void`; `function loadSession(): StoredSession | null`; `function clearSession(): void`.
  - `realtimeClient.ts`: `type ClientEvent = { type: 'state'; state: PublicState } | { type: 'identity'; playerId: string; reconnectToken: string } | { type: 'rejected'; reason: string } | { type: 'error'; message: string } | { type: 'connected' } | { type: 'disconnected' }`; `class RealtimeClient { connect(params: ConnectParams): void; send(message: ClientMessage): void; on(handler: (event: ClientEvent) => void): () => void; disconnect(): void }`. Consumed by `useGameConnection` (Task 7).

The connection URL and the exact query parameter names (`code`, `playerId`, `token`, `name`, `seed`) and every wire message shape are fixed by the already-shipped `src/worker/GameRoom.ts` and `src/worker/messages.ts` — read both in full before writing this task, and match them exactly. Do not invent a different parameter name or message shape.

- [ ] **Step 1: Write the failing test for `session.ts`**

```ts
import { describe, expect, test, beforeEach } from 'vitest';
import { saveSession, loadSession, clearSession } from './session.js';

describe('session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('round-trips a saved session', () => {
    saveSession({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token' });
    expect(loadSession()).toEqual({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token' });
  });

  test('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull();
  });

  test('returns null for malformed stored JSON rather than throwing', () => {
    sessionStorage.setItem('quizclash-session', 'not json');
    expect(loadSession()).toBeNull();
  });

  test('clearSession removes the stored session', () => {
    saveSession({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token' });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/lib/session.ts`**

```ts
const STORAGE_KEY = 'quizclash-session';

export interface StoredSession {
  readonly lobbyCode: string;
  readonly playerId: string;
  readonly reconnectToken: string;
}

export function saveSession(session: StoredSession): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'lobbyCode' in parsed &&
      'playerId' in parsed &&
      'reconnectToken' in parsed
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `realtimeClient.ts`**

This needs a fake WebSocket, since jsdom does not implement a real one that talks to a server. Vitest can substitute a minimal fake via `vi.stubGlobal`.

```ts
import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeClient } from './realtimeClient.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.onclose?.();
  }

  // Test helper, not part of the real WebSocket interface.
  simulateOpen(): void {
    this.onopen?.();
  }
  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('connect builds a URL with every required query parameter', () => {
    const client = new RealtimeClient();
    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: 'tok', name: 'Juan', avatarSeed: 'seed-1' });

    const socket = FakeWebSocket.instances[0]!;
    const url = new URL(socket.url);
    expect(url.searchParams.get('code')).toBe('ABCD');
    expect(url.searchParams.get('playerId')).toBe('p1');
    expect(url.searchParams.get('token')).toBe('tok');
    expect(url.searchParams.get('name')).toBe('Juan');
    expect(url.searchParams.get('seed')).toBe('seed-1');
  });

  test('emits a connected event once the socket opens', () => {
    const client = new RealtimeClient();
    const events: string[] = [];
    client.on((e) => events.push(e.type));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    FakeWebSocket.instances[0]!.simulateOpen();

    expect(events).toContain('connected');
  });

  test('translates an incoming STATE frame into a state event', () => {
    const client = new RealtimeClient();
    const events: unknown[] = [];
    client.on((e) => events.push(e));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    const fakeState = { phase: 'LOBBY', lobbyCode: 'ABCD' };
    FakeWebSocket.instances[0]!.simulateMessage({ type: 'STATE', state: fakeState });

    expect(events).toContainEqual({ type: 'state', state: fakeState });
  });

  test('translates an incoming IDENTITY frame into an identity event', () => {
    const client = new RealtimeClient();
    const events: unknown[] = [];
    client.on((e) => events.push(e));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    FakeWebSocket.instances[0]!.simulateMessage({ type: 'IDENTITY', playerId: 'p1', reconnectToken: 'minted-secret' });

    expect(events).toContainEqual({ type: 'identity', playerId: 'p1', reconnectToken: 'minted-secret' });
  });

  test('send serializes and forwards a message to the socket', () => {
    const client = new RealtimeClient();
    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });

    client.send({ type: 'SUBMIT_ANSWER', choiceIndex: 2 });

    const socket = FakeWebSocket.instances[0]!;
    expect(socket.sent).toContainEqual(JSON.stringify({ type: 'SUBMIT_ANSWER', choiceIndex: 2 }));
  });

  test('on returns an unsubscribe function', () => {
    const client = new RealtimeClient();
    const events: string[] = [];
    const unsubscribe = client.on((e) => events.push(e.type));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    unsubscribe();
    FakeWebSocket.instances[0]!.simulateOpen();

    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/lib/realtimeClient.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `web/src/lib/realtimeClient.ts`**

```ts
import type { ChoiceIndex, PublicState, SetupConfig } from '../../../src/shared/types.js';

export interface ConnectParams {
  readonly host: string;
  readonly code: string;
  readonly playerId: string;
  readonly token: string;
  readonly name: string;
  readonly avatarSeed: string;
}

/**
 * Messages this client can send. Shapes and names are fixed by the already-
 * shipped `src/worker/messages.ts` — do not add a field that file does not
 * parse, and do not rename one it does.
 */
export type ClientMessage =
  | { readonly type: 'OPEN_SETUP' }
  | { readonly type: 'PLAY_AGAIN' }
  | { readonly type: 'SUBMIT_ANSWER'; readonly choiceIndex: ChoiceIndex }
  | {
      readonly type: 'SUBMIT_SETUP';
      readonly config: SetupConfig;
      readonly source: { readonly kind: 'pdf'; readonly base64: string } | { readonly kind: 'text'; readonly text: string };
    };

export type ClientEvent =
  | { readonly type: 'connected' }
  | { readonly type: 'disconnected' }
  | { readonly type: 'state'; readonly state: PublicState }
  | { readonly type: 'identity'; readonly playerId: string; readonly reconnectToken: string }
  | { readonly type: 'rejected'; readonly reason: string }
  | { readonly type: 'error'; readonly message: string };

type Listener = (event: ClientEvent) => void;

/**
 * Owns the one WebSocket connection to a lobby's Durable Object. Translates
 * raw frames into typed events and back; React components never see a raw
 * WebSocket (spec §5, module 6).
 */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();

  connect(params: ConnectParams): void {
    const url = new URL(`wss://${params.host}/ws`);
    url.searchParams.set('code', params.code);
    url.searchParams.set('playerId', params.playerId);
    url.searchParams.set('token', params.token);
    url.searchParams.set('name', params.name);
    url.searchParams.set('seed', params.avatarSeed);

    // ws:// for local dev against a plain `wrangler dev` server; wss:// once
    // deployed. The host itself (with or without TLS) is supplied by the
    // caller via VITE_WS_HOST — this class does not decide that.
    const protocol = params.host.startsWith('localhost') ? 'ws' : 'wss';
    url.protocol = protocol;

    const socket = new WebSocket(url.toString());
    this.socket = socket;

    socket.onopen = () => this.emit({ type: 'connected' });
    socket.onclose = () => this.emit({ type: 'disconnected' });
    socket.onerror = () => this.emit({ type: 'disconnected' });
    socket.onmessage = (event: { data: string }) => this.handleMessage(event.data);
  }

  send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return;

    const message = parsed as Record<string, unknown>;
    switch (message.type) {
      case 'STATE':
        this.emit({ type: 'state', state: message.state as PublicState });
        return;
      case 'IDENTITY':
        this.emit({
          type: 'identity',
          playerId: message.playerId as string,
          reconnectToken: message.reconnectToken as string,
        });
        return;
      case 'REJECTED':
        this.emit({ type: 'rejected', reason: message.reason as string });
        return;
      case 'ERROR':
        this.emit({ type: 'error', message: message.message as string });
        return;
      default:
        return;
    }
  }

  private emit(event: ClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/lib/realtimeClient.test.ts`
Expected: PASS.

- [ ] **Step 9: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 10: Commit**

```bash
git add web/src/lib/session.ts web/src/lib/session.test.ts web/src/lib/realtimeClient.ts web/src/lib/realtimeClient.test.ts
git commit -m "feat: add the realtime client and session storage"
```

---

### Task 7: `useGameConnection` hook

**Files:**
- Create: `web/src/hooks/useGameConnection.ts`, `web/src/hooks/useGameConnection.test.ts`

**Interfaces:**
- Consumes: `RealtimeClient` (Task 6), `loadSession`/`saveSession` (Task 6)
- Produces: `function useGameConnection(): { state: PublicState | null; connectionStatus: 'connecting' | 'connected' | 'disconnected'; rejection: string | null; join: (params: { code: string; name: string; avatarSeed: string }) => void; send: (message: ClientMessage) => void }`. Consumed by every screen task (8–14) and `App.tsx` (Task 15).

The one place reconnect-on-mount logic lives: if a session is already stored, connect using it automatically; a fresh `join()` call is what `IdentityScreen` uses for a brand-new player.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useGameConnection } from './useGameConnection.js';
import { RealtimeClient } from '../lib/realtimeClient.js';
import { saveSession, clearSession } from '../lib/session.js';

vi.mock('../lib/realtimeClient.js');

describe('useGameConnection', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  test('starts in a connecting-or-idle state with no PublicState yet', () => {
    const { result } = renderHook(() => useGameConnection());
    expect(result.current.state).toBeNull();
  });

  test('join() calls RealtimeClient.connect with the supplied params and an empty token', () => {
    const { result } = renderHook(() => useGameConnection());

    act(() => {
      result.current.join({ code: 'ABCD', name: 'Juan', avatarSeed: 'seed-1' });
    });

    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    expect(instance.connect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABCD', name: 'Juan', avatarSeed: 'seed-1', token: '' }),
    );
  });

  test('an incoming identity event is persisted to session storage', () => {
    const { result } = renderHook(() => useGameConnection());
    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    const onHandler = vi.mocked(instance.on).mock.calls[0]![0];

    act(() => {
      result.current.join({ code: 'ABCD', name: 'Juan', avatarSeed: 'seed-1' });
      onHandler({ type: 'identity', playerId: 'p1', reconnectToken: 'minted-secret' });
    });

    expect(sessionStorage.getItem('quizclash-session')).toContain('minted-secret');
  });

  test('an incoming state event updates the returned state', () => {
    const { result } = renderHook(() => useGameConnection());
    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    const onHandler = vi.mocked(instance.on).mock.calls[0]![0];
    const fakeState = { phase: 'LOBBY' };

    act(() => {
      onHandler({ type: 'state', state: fakeState });
    });

    expect(result.current.state).toEqual(fakeState);
  });

  test('a rejected event surfaces its reason and clears on the next successful state update', () => {
    const { result } = renderHook(() => useGameConnection());
    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    const onHandler = vi.mocked(instance.on).mock.calls[0]![0];

    act(() => {
      onHandler({ type: 'rejected', reason: 'NOT_HOST' });
    });
    expect(result.current.rejection).toBe('NOT_HOST');

    act(() => {
      onHandler({ type: 'state', state: { phase: 'LOBBY' } });
    });
    expect(result.current.rejection).toBeNull();
  });

  test('mounting with an existing stored session auto-connects using it, including its token', () => {
    saveSession({ lobbyCode: 'WXYZ', playerId: 'p1', reconnectToken: 'stored-secret' });

    renderHook(() => useGameConnection());

    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    expect(instance.connect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WXYZ', playerId: 'p1', token: 'stored-secret' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/hooks/useGameConnection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/hooks/useGameConnection.ts`**

```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { RealtimeClient, type ClientEvent, type ClientMessage } from '../lib/realtimeClient.js';
import { loadSession, saveSession } from '../lib/session.js';
import type { PublicState } from '../../../src/shared/types.js';

const WS_HOST = import.meta.env.VITE_WS_HOST as string;

export interface JoinParams {
  readonly code: string;
  readonly name: string;
  readonly avatarSeed: string;
}

export interface UseGameConnection {
  readonly state: PublicState | null;
  readonly connectionStatus: 'connecting' | 'connected' | 'disconnected';
  readonly rejection: string | null;
  readonly join: (params: JoinParams) => void;
  readonly send: (message: ClientMessage) => void;
}

export function useGameConnection(): UseGameConnection {
  const clientRef = useRef<RealtimeClient>(new RealtimeClient());
  const [state, setState] = useState<PublicState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [rejection, setRejection] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [lobbyCode, setLobbyCode] = useState<string | null>(null);

  const handleEvent = useCallback(
    (event: ClientEvent) => {
      switch (event.type) {
        case 'connected':
          setConnectionStatus('connected');
          return;
        case 'disconnected':
          setConnectionStatus('disconnected');
          return;
        case 'state':
          setState(event.state);
          setRejection(null);
          return;
        case 'identity':
          setPlayerId(event.playerId);
          if (lobbyCode !== null) {
            saveSession({ lobbyCode, playerId: event.playerId, reconnectToken: event.reconnectToken });
          }
          return;
        case 'rejected':
          setRejection(event.reason);
          return;
        case 'error':
          setRejection(event.message);
          return;
      }
    },
    [lobbyCode],
  );

  useEffect(() => {
    const client = clientRef.current;
    const unsubscribe = client.on(handleEvent);
    return unsubscribe;
  }, [handleEvent]);

  useEffect(() => {
    const existing = loadSession();
    if (existing === null) return;

    setLobbyCode(existing.lobbyCode);
    setPlayerId(existing.playerId);
    setConnectionStatus('connecting');
    clientRef.current.connect({
      host: WS_HOST,
      code: existing.lobbyCode,
      playerId: existing.playerId,
      token: existing.reconnectToken,
      name: '',
      avatarSeed: '',
    });
    // Runs once on mount only — a fresh join() call is a distinct, explicit
    // user action and must not be triggered by this effect re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback((params: JoinParams) => {
    setLobbyCode(params.code);
    setConnectionStatus('connecting');
    clientRef.current.connect({
      host: WS_HOST,
      code: params.code,
      playerId: crypto.randomUUID(),
      token: '',
      name: params.name,
      avatarSeed: params.avatarSeed,
    });
  }, []);

  const send = useCallback((message: ClientMessage) => {
    clientRef.current.send(message);
  }, []);

  return { state, connectionStatus, rejection, join, send };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/hooks/useGameConnection.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `web/.env.development`**

```
VITE_WS_HOST=localhost:8787
```

This is Task 3's `.env.development` placeholder — create it now that a value is actually needed. `web/.env.production` is intentionally left uncommitted (add `.env.production` to `web/.gitignore` if it doesn't already match the root `.gitignore`'s `.env*` pattern) — the deployed Worker's real host is an operational detail set at Vercel deploy time, not a value to hardcode into the repo.

- [ ] **Step 6: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 7: Commit**

```bash
git add web/src/hooks/useGameConnection.ts web/src/hooks/useGameConnection.test.ts web/.env.development
git commit -m "feat: add useGameConnection with reconnect-on-mount"
```

---

### Task 8: Identity screen

**Files:**
- Create: `web/src/screens/IdentityScreen.tsx`, `web/src/screens/IdentityScreen.test.tsx`

**Interfaces:**
- Consumes: `AvatarPicker` (Task 5), `useGameConnection`'s `join` (Task 7), `Button`/`Input`/`Label`/`Card` from `./ui/*`
- Produces: `interface IdentityScreenProps { readonly onJoin: (params: { code: string; name: string; avatarSeed: string }) => void }`. Rendered by `App.tsx` (Task 15) before a session exists.

Name entry, avatar selection, and either creating a new lobby (`POST /api/lobby`) or joining an existing one by typing a code. `MAX_NAME_CHARS` (16) caps the input client-side too — a courtesy matching the server's own enforcement, not a replacement for it (the server validates independently; see Task 6/1's boundary discipline).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import IdentityScreen from './IdentityScreen.js';

describe('IdentityScreen', () => {
  test('name input is capped at 16 characters', async () => {
    render(<IdentityScreen onJoin={() => {}} />);
    const user = userEvent.setup();
    const nameInput = screen.getByLabelText(/name/i);

    await user.type(nameInput, 'a'.repeat(30));
    expect((nameInput as HTMLInputElement).value).toHaveLength(16);
  });

  test('calls onJoin with the typed code when "Join" is submitted', async () => {
    const onJoin = vi.fn();
    render(<IdentityScreen onJoin={onJoin} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[0]!); // pick the first avatar
    await user.type(screen.getByLabelText(/lobby code/i), 'abcd');
    await user.click(screen.getByRole('button', { name: /join/i }));

    expect(onJoin).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABCD', name: 'Juan' }),
    );
  });

  test('the Join button is disabled until a name and a code are both present', () => {
    render(<IdentityScreen onJoin={() => {}} />);
    expect(screen.getByRole('button', { name: /join/i })).toBeDisabled();
  });

  test('calls onJoin with an empty code when "Create Lobby" is clicked, signalling a fresh lobby', async () => {
    const onJoin = vi.fn();
    render(<IdentityScreen onJoin={onJoin} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[2]!);
    await user.click(screen.getByRole('button', { name: /create lobby/i }));

    expect(onJoin).toHaveBeenCalledWith(expect.objectContaining({ code: '' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/IdentityScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/screens/IdentityScreen.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Card } from '../components/ui/card.js';
import AvatarPicker from '../components/AvatarPicker.js';

const MAX_NAME_CHARS = 16;

export interface IdentityScreenProps {
  readonly onJoin: (params: { code: string; name: string; avatarSeed: string }) => void;
}

export default function IdentityScreen({ onJoin }: IdentityScreenProps) {
  const [name, setName] = useState('');
  const [avatarSeed, setAvatarSeed] = useState('quizclash-avatar-0');
  const [code, setCode] = useState('');

  const canJoinExisting = name.trim().length > 0 && code.trim().length > 0;
  const canCreate = name.trim().length > 0;

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div>
        <Label htmlFor="player-name">Name</Label>
        <Input
          id="player-name"
          value={name}
          maxLength={MAX_NAME_CHARS}
          onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_CHARS))}
          placeholder="Your name"
        />
      </div>

      <AvatarPicker value={avatarSeed} onChange={setAvatarSeed} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="lobby-code">Lobby code</Label>
        <Input
          id="lobby-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD"
        />
        <Button
          disabled={!canJoinExisting}
          onClick={() => onJoin({ code: code.trim().toUpperCase(), name: name.trim(), avatarSeed })}
        >
          Join
        </Button>
      </div>

      <div className="text-center text-sm text-foreground/70">or</div>

      <Button
        variant="neutral"
        disabled={!canCreate}
        onClick={() => onJoin({ code: '', name: name.trim(), avatarSeed })}
      >
        Create Lobby
      </Button>
    </Card>
  );
}
```

`variant="neutral"` assumes the installed neobrutalism `Button` exposes that variant name — check the actual installed `web/src/components/ui/button.tsx` (from Task 4) for its real variant prop values before using this, and substitute whatever the component actually exports if `neutral` isn't one of them.

An empty-string `code` signals "create a fresh lobby" to `App.tsx` (Task 15), which is the one place that knows to call `POST /api/lobby` first and obtain a real code before connecting — `IdentityScreen` itself makes no network call beyond what `onJoin` triggers upstream.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/IdentityScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/IdentityScreen.tsx web/src/screens/IdentityScreen.test.tsx
git commit -m "feat: add identity screen with name, avatar, and join/create"
```

---

### Task 9: Lobby screen

**Files:**
- Create: `web/src/screens/LobbyScreen.tsx`, `web/src/screens/LobbyScreen.test.tsx`

**Interfaces:**
- Consumes: `PublicState` (specifically `.players`, `.hostId`, `.lobbyCode`), `motion` from the `motion` package
- Produces: `interface LobbyScreenProps { readonly state: PublicState; readonly selfId: string; readonly onOpenSetup: () => void }`. Rendered by `App.tsx` when `state.phase === 'LOBBY'`.

2×2 avatar slots (spec §9), a bubbly spring-in animation on join, the lobby code and a copyable invite link, and a host-only "Start" button that fires `OPEN_SETUP`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LobbyScreen from './LobbyScreen.js';
import type { PublicState } from '../../../src/shared/types.js';

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'LOBBY',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 0, joinedAtMs: 0, connected: true },
      { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 0, joinedAtMs: 1, connected: true },
    ],
    questionIndex: 0,
    totalQuestions: 0,
    phaseEndsAtMs: null,
    prompt: null,
    answered: [],
    reveal: null,
    deltas: [],
    error: null,
    ...overrides,
  };
}

describe('LobbyScreen', () => {
  test('shows the lobby code', () => {
    render(<LobbyScreen state={makeState()} selfId="p1" onOpenSetup={() => {}} />);
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  test('shows two filled avatar slots and two empty placeholders for a 2-player lobby', () => {
    render(<LobbyScreen state={makeState()} selfId="p1" onOpenSetup={() => {}} />);
    expect(screen.getByText('Juan')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getAllByText(/waiting/i)).toHaveLength(2);
  });

  test('shows a Start button only to the host', () => {
    render(<LobbyScreen state={makeState({ hostId: 'p1' })} selfId="p1" onOpenSetup={() => {}} />);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  test('does not show a Start button to a non-host', () => {
    render(<LobbyScreen state={makeState({ hostId: 'p1' })} selfId="p2" onOpenSetup={() => {}} />);
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
  });

  test('clicking Start calls onOpenSetup', async () => {
    const onOpenSetup = vi.fn();
    render(<LobbyScreen state={makeState({ hostId: 'p1' })} selfId="p1" onOpenSetup={onOpenSetup} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /start/i }));
    expect(onOpenSetup).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/LobbyScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/screens/LobbyScreen.tsx`**

```tsx
import { motion } from 'motion/react';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import type { PublicState } from '../../../src/shared/types.js';

const LOBBY_SLOTS = 4;

export interface LobbyScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
  readonly onOpenSetup: () => void;
}

export default function LobbyScreen({ state, selfId, onOpenSetup }: LobbyScreenProps) {
  const isHost = state.hostId === selfId;
  const slots = Array.from({ length: LOBBY_SLOTS }, (_, i) => state.players[i] ?? null);

  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-6 p-6">
      <div className="text-center">
        <div className="text-sm text-foreground/70">Lobby code</div>
        <div className="text-3xl font-heading tracking-widest">{state.lobbyCode}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {slots.map((player, i) =>
          player === null ? (
            <div
              key={`empty-${i}`}
              className="flex h-24 w-24 items-center justify-center rounded-base border-2 border-dashed border-border text-xs text-foreground/50"
            >
              Waiting…
            </div>
          ) : (
            <motion.div
              key={player.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-base border-2 border-border bg-secondary-background"
            >
              <img
                src={`https://api.dicebear.com/10.x/bottts/svg?seed=${encodeURIComponent(player.avatarSeed)}`}
                alt={player.name}
                className="h-12 w-12"
              />
              <span className="text-xs font-bold">{player.name}</span>
            </motion.div>
          ),
        )}
      </div>

      {isHost && (
        <Button onClick={onOpenSetup} className="w-full">
          Start
        </Button>
      )}
    </Card>
  );
}
```

The spring parameters (`stiffness: 300, damping: 15`) produce a visible overshoot-then-settle — the "bubbly" effect the spec calls for (§9: "a spring with overshoot so avatars pop past final size and settle").

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/LobbyScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/LobbyScreen.tsx web/src/screens/LobbyScreen.test.tsx
git commit -m "feat: add lobby screen with bubbly join animation"
```

---

### Task 10: Setup wizard

**Files:**
- Create: `web/src/screens/SetupScreen.tsx`, `web/src/screens/SetupScreen.test.tsx`

**Interfaces:**
- Consumes: `Sheet`/`SheetContent` from `./ui/sheet.js`, `PublicState`, `SetupConfig` from shared types, `send` from `useGameConnection`
- Produces: `interface SetupScreenProps { readonly state: PublicState; readonly selfId: string; readonly onSubmit: (config: SetupConfig, source: { kind: 'pdf'; base64: string } | { kind: 'text'; text: string }) => void }`. Rendered when `state.phase === 'SETUP'` or `'GENERATING'`.

One scrollable bottom sheet (spec §7), not four popups: source (PDF drop or paste-text tab), count (5/10/15/20 pills), difficulty, optional focus text, then Generate. Non-host players see a read-only waiting state instead of the form.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupScreen from './SetupScreen.js';
import type { PublicState } from '../../../src/shared/types.js';

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'SETUP',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [],
    questionIndex: 0,
    totalQuestions: 0,
    phaseEndsAtMs: null,
    prompt: null,
    answered: [],
    reveal: null,
    deltas: [],
    error: null,
    ...overrides,
  };
}

describe('SetupScreen', () => {
  test('non-host players see a waiting message, not the form', () => {
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p2" onSubmit={() => {}} />);
    expect(screen.getByText(/host is building/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
  });

  test('Generate is disabled until a source is provided', () => {
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
  });

  test('typing pasted text enables Generate and submits a text source', async () => {
    const onSubmit = vi.fn();
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /paste text/i }));
    await user.type(screen.getByLabelText(/paste your material/i), 'Mitochondria are the powerhouse of the cell.');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ count: 10, difficulty: 'medium', sourceKind: 'text' }),
      { kind: 'text', text: 'Mitochondria are the powerhouse of the cell.' },
    );
  });

  test('selecting a question count pill changes the submitted config', async () => {
    const onSubmit = vi.fn();
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /paste text/i }));
    await user.type(screen.getByLabelText(/paste your material/i), 'Some material.');
    await user.click(screen.getByRole('button', { name: '20' }));
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ count: 20 }), expect.anything());
  });

  test('shows a building-the-quiz state during GENERATING for every player, host included', () => {
    render(<SetupScreen state={makeState({ phase: 'GENERATING', hostId: 'p1' })} selfId="p1" onSubmit={() => {}} />);
    expect(screen.getByText(/building your quiz/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/SetupScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/screens/SetupScreen.tsx`**

```tsx
import { useState } from 'react';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Label } from '../components/ui/label.js';
import type { PublicState, QuestionCount, Difficulty, SetupConfig } from '../../../src/shared/types.js';

const COUNTS: readonly QuestionCount[] = [5, 10, 15, 20];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export interface SetupScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
  readonly onSubmit: (
    config: SetupConfig,
    source: { kind: 'pdf'; base64: string } | { kind: 'text'; text: string },
  ) => void;
}

export default function SetupScreen({ state, selfId, onSubmit }: SetupScreenProps) {
  const [sourceTab, setSourceTab] = useState<'pdf' | 'text'>('text');
  const [pastedText, setPastedText] = useState('');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [count, setCount] = useState<QuestionCount>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [focus, setFocus] = useState('');

  if (state.phase === 'GENERATING') {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="font-heading text-lg">Building your quiz…</p>
      </Card>
    );
  }

  const isHost = state.hostId === selfId;
  if (!isHost) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="font-heading text-lg">Host is building the quiz…</p>
      </Card>
    );
  }

  const hasSource = sourceTab === 'text' ? pastedText.trim().length > 0 : pdfBase64 !== null;

  function handleGenerate() {
    const config: SetupConfig = { count, difficulty, focus: focus.trim(), sourceKind: sourceTab };
    const source =
      sourceTab === 'text'
        ? ({ kind: 'text', text: pastedText.trim() } as const)
        : ({ kind: 'pdf', base64: pdfBase64! } as const);
    onSubmit(config, source);
  }

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-5 p-6">
      <div role="tablist" className="flex gap-2">
        <button
          role="tab"
          aria-selected={sourceTab === 'pdf'}
          onClick={() => setSourceTab('pdf')}
          className={`rounded-base border-2 border-border px-4 py-2 font-bold ${sourceTab === 'pdf' ? 'bg-main' : 'bg-secondary-background'}`}
        >
          Upload PDF
        </button>
        <button
          role="tab"
          aria-selected={sourceTab === 'text'}
          onClick={() => setSourceTab('text')}
          className={`rounded-base border-2 border-border px-4 py-2 font-bold ${sourceTab === 'text' ? 'bg-main' : 'bg-secondary-background'}`}
        >
          Paste Text
        </button>
      </div>

      {sourceTab === 'pdf' ? (
        <div>
          <Label htmlFor="pdf-upload">Drop a PDF</Label>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file === undefined) return;
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                setPdfBase64(result.split(',')[1] ?? '');
              };
              reader.readAsDataURL(file);
            }}
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="paste-text">Paste your material</Label>
          <textarea
            id="paste-text"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            className="w-full rounded-base border-2 border-border bg-secondary-background p-2"
            rows={5}
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-2" disabled={!hasSource}>
        <Label>How many questions?</Label>
        <div className="flex gap-2">
          {COUNTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCount(c)}
              className={`rounded-base border-2 border-border px-3 py-2 font-bold ${count === c ? 'bg-main' : 'bg-secondary-background'}`}
            >
              {c}
            </button>
          ))}
        </div>

        <Label>Difficulty</Label>
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`rounded-base border-2 border-border px-3 py-2 font-bold capitalize ${difficulty === d ? 'bg-main' : 'bg-secondary-background'}`}
            >
              {d}
            </button>
          ))}
        </div>

        <Label htmlFor="focus">Focus (optional)</Label>
        <input
          id="focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. photosynthesis, cell division"
          className="rounded-base border-2 border-border bg-secondary-background p-2"
        />
      </fieldset>

      <Button disabled={!hasSource} onClick={handleGenerate} className="w-full">
        Generate
      </Button>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/SetupScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/SetupScreen.tsx web/src/screens/SetupScreen.test.tsx
git commit -m "feat: add setup wizard as one scrollable sheet"
```

---

### Task 11: Countdown screen

**Files:**
- Create: `web/src/screens/CountdownScreen.tsx`, `web/src/screens/CountdownScreen.test.tsx`

**Interfaces:**
- Consumes: `PublicState.phaseEndsAtMs`
- Produces: `interface CountdownScreenProps { readonly phaseEndsAtMs: number | null }`. Rendered when `state.phase === 'COUNTDOWN'`.

The synced 3-2-1 (spec §6). `phaseEndsAtMs` is a server absolute timestamp (spec §6's timing note) — the displayed number is derived by comparing it against the local clock every animation frame, not by counting down independently, so all four players' screens agree even if one client's JS thread stalls briefly.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CountdownScreen from './CountdownScreen.js';

describe('CountdownScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('shows 3 when just over 2000ms remain', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<CountdownScreen phaseEndsAtMs={now + 2500} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  test('shows 1 when under 1000ms remain', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    render(<CountdownScreen phaseEndsAtMs={now + 500} />);
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  test('renders nothing distinguishable when phaseEndsAtMs is null rather than crashing', () => {
    expect(() => render(<CountdownScreen phaseEndsAtMs={null} />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/CountdownScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/screens/CountdownScreen.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export interface CountdownScreenProps {
  readonly phaseEndsAtMs: number | null;
}

function secondsRemaining(phaseEndsAtMs: number, now: number): number {
  const msLeft = Math.max(phaseEndsAtMs - now, 0);
  return Math.ceil(msLeft / 1000);
}

export default function CountdownScreen({ phaseEndsAtMs }: CountdownScreenProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (phaseEndsAtMs === null) return;
    let frame: number;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [phaseEndsAtMs]);

  if (phaseEndsAtMs === null) return <div className="flex h-full items-center justify-center" />;

  const count = secondsRemaining(phaseEndsAtMs, now);

  return (
    <div className="flex h-full items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={count}
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.5, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="font-heading text-9xl"
        >
          {count}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/CountdownScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/CountdownScreen.tsx web/src/screens/CountdownScreen.test.tsx
git commit -m "feat: add synced countdown screen"
```

---

### Task 12: Answer color/shape table, AnswerTile, and Question screen

**Files:**
- Create: `web/src/lib/colors.ts`, `web/src/lib/colors.test.ts`
- Create: `web/src/components/AnswerTile.tsx`, `web/src/components/AnswerTile.test.tsx`
- Create: `web/src/screens/QuestionScreen.tsx`, `web/src/screens/QuestionScreen.test.tsx`

**Interfaces:**
- Consumes: `PublicState.prompt`, `.answered`, `.phaseEndsAtMs`; `Progress` from `./ui/progress.js`
- Produces: `const ANSWER_STYLES: readonly { shape: 'circle' | 'triangle' | 'square' | 'diamond'; hue: string }[]` (exactly 4 entries, spec §9's table); `AnswerTile` component; `interface QuestionScreenProps { readonly state: PublicState; readonly players: readonly PublicPlayer[]; readonly onAnswer: (choiceIndex: ChoiceIndex) => void }`.

The question screen: text in the top ~35%, a 2×2 answer grid in the bottom ~55% (spec §9), each tile carrying a distinct shape *and* hue so color-blind players aren't disadvantaged, a shrinking timer bar (never a number), and an "n of 4 answered" indicator using the `answered` field Task 2 added.

- [ ] **Step 1: Write the failing test for `colors.ts`**

```ts
import { describe, expect, test } from 'vitest';
import { ANSWER_STYLES } from './colors.js';

describe('ANSWER_STYLES', () => {
  test('has exactly four entries, one per answer slot', () => {
    expect(ANSWER_STYLES).toHaveLength(4);
  });

  test('every entry has a distinct shape', () => {
    const shapes = ANSWER_STYLES.map((s) => s.shape);
    expect(new Set(shapes).size).toBe(4);
  });

  test('every entry has a distinct hue', () => {
    const hues = ANSWER_STYLES.map((s) => s.hue);
    expect(new Set(hues).size).toBe(4);
  });

  test('matches the spec table order: circle, triangle, square, diamond', () => {
    expect(ANSWER_STYLES.map((s) => s.shape)).toEqual(['circle', 'triangle', 'square', 'diamond']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/colors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/lib/colors.ts`**

```ts
export type AnswerShape = 'circle' | 'triangle' | 'square' | 'diamond';

export interface AnswerStyle {
  readonly shape: AnswerShape;
  /** A Tailwind background-color utility class, not a raw hex value — keeps every hue theme-consistent with the neobrutalism palette's saturation. */
  readonly hue: string;
}

/**
 * Spec §9: color is never the only signal an answer choice carries. Roughly
 * 1 in 12 men has some color vision deficiency — pairing each hue with a
 * distinct shape means the tiles are still distinguishable without color.
 */
export const ANSWER_STYLES: readonly AnswerStyle[] = [
  { shape: 'circle', hue: 'bg-red-400' },
  { shape: 'triangle', hue: 'bg-blue-400' },
  { shape: 'square', hue: 'bg-yellow-400' },
  { shape: 'diamond', hue: 'bg-green-400' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/colors.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for `AnswerTile`**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AnswerTile from './AnswerTile.js';

describe('AnswerTile', () => {
  test('renders the choice text', () => {
    render(<AnswerTile choiceIndex={0} text="Mitochondria" isCorrect={null} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
  });

  test('calls onSelect with its own choiceIndex when clicked', async () => {
    const onSelect = vi.fn();
    render(<AnswerTile choiceIndex={2} text="Nucleus" isCorrect={null} isSelected={false} onSelect={onSelect} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  test('shows a correct-answer state distinctly when isCorrect is true', () => {
    render(<AnswerTile choiceIndex={0} text="Right" isCorrect={true} isSelected={false} onSelect={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-correct', 'true');
  });

  test('shows an incorrect-selected state distinctly when isCorrect is false and isSelected is true', () => {
    render(<AnswerTile choiceIndex={1} text="Wrong" isCorrect={false} isSelected={true} onSelect={() => {}} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-wrong-selection', 'true');
  });

  test('is disabled when the disabled prop is true, and clicking it does not call onSelect', async () => {
    const onSelect = vi.fn();
    render(<AnswerTile choiceIndex={0} text="Right" isCorrect={null} isSelected={false} onSelect={onSelect} disabled />);
    const user = userEvent.setup();

    expect(screen.getByRole('button')).toBeDisabled();
    await user.click(screen.getByRole('button'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run src/components/AnswerTile.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Create `web/src/components/AnswerTile.tsx`**

```tsx
import { ANSWER_STYLES } from '../lib/colors.js';
import type { ChoiceIndex } from '../../../src/shared/types.js';

export interface AnswerTileProps {
  readonly choiceIndex: ChoiceIndex;
  readonly text: string;
  /** null while the question is live and no answer key is known yet — the client never has this before REVEAL. */
  readonly isCorrect: boolean | null;
  readonly isSelected: boolean;
  readonly onSelect: (choiceIndex: ChoiceIndex) => void;
  /** True once this player has already answered (QUESTION) or on REVEAL, where selection is read-only. */
  readonly disabled?: boolean;
}

const SHAPE_GLYPH: Record<string, string> = {
  circle: '●',
  triangle: '▲',
  square: '■',
  diamond: '◆',
};

export default function AnswerTile({ choiceIndex, text, isCorrect, isSelected, onSelect, disabled = false }: AnswerTileProps) {
  const style = ANSWER_STYLES[choiceIndex]!;
  const isWrongSelection = isSelected && isCorrect === false;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(choiceIndex)}
      data-correct={isCorrect === true ? 'true' : undefined}
      data-wrong-selection={isWrongSelection ? 'true' : undefined}
      className={`flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-base border-2 border-border p-4 font-bold text-black disabled:opacity-70 ${style.hue} ${
        isCorrect === true ? 'ring-4 ring-green-600' : ''
      } ${isWrongSelection ? 'ring-4 ring-red-600' : ''}`}
    >
      <span className="text-2xl">{SHAPE_GLYPH[style.shape]}</span>
      <span>{text}</span>
    </button>
  );
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run src/components/AnswerTile.test.tsx`
Expected: PASS.

- [ ] **Step 9: Write the failing test for `QuestionScreen`**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionScreen from './QuestionScreen.js';
import type { PublicState, PublicPlayer } from '../../../src/shared/types.js';

const players: readonly PublicPlayer[] = [
  { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 0, joinedAtMs: 0, connected: true },
  { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 0, joinedAtMs: 1, connected: true },
];

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'QUESTION',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players,
    questionIndex: 0,
    totalQuestions: 5,
    phaseEndsAtMs: Date.now() + 20000,
    prompt: { question: 'What powers the cell?', choices: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'] },
    answered: [],
    reveal: null,
    deltas: [],
    error: null,
    ...overrides,
  };
}

describe('QuestionScreen', () => {
  test('renders the question text and all four choices', () => {
    render(<QuestionScreen state={makeState()} players={players} selfId="p1" onAnswer={() => {}} />);
    expect(screen.getByText('What powers the cell?')).toBeInTheDocument();
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
  });

  test('calls onAnswer with the clicked choice index', async () => {
    const onAnswer = vi.fn();
    render(<QuestionScreen state={makeState()} players={players} selfId="p1" onAnswer={onAnswer} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Mitochondria'));
    expect(onAnswer).toHaveBeenCalledWith(1);
  });

  test('shows how many of the seated players have answered', () => {
    render(<QuestionScreen state={makeState({ answered: ['p1'] })} players={players} selfId="p1" onAnswer={() => {}} />);
    expect(screen.getByText(/1.*2/)).toBeInTheDocument();
  });

  test('disables further selection once this player has already answered', () => {
    render(<QuestionScreen state={makeState({ answered: ['p1'] })} players={players} onAnswer={() => {}} selfId="p1" />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  test('does not disable tiles for a player who has not yet answered', () => {
    render(<QuestionScreen state={makeState({ answered: ['p2'] })} players={players} onAnswer={() => {}} selfId="p1" />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toBeDisabled();
    }
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `npx vitest run src/screens/QuestionScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 11: Create `web/src/screens/QuestionScreen.tsx`**

```tsx
import { Progress } from '../components/ui/progress.js';
import AnswerTile from '../components/AnswerTile.js';
import type { ChoiceIndex, PublicPlayer, PublicState } from '../../../src/shared/types.js';

export interface QuestionScreenProps {
  readonly state: PublicState;
  readonly players: readonly PublicPlayer[];
  readonly selfId: string;
  readonly onAnswer: (choiceIndex: ChoiceIndex) => void;
}

export default function QuestionScreen({ state, players, selfId, onAnswer }: QuestionScreenProps) {
  if (state.prompt === null) return null;

  const hasAnswered = state.answered.includes(selfId);
  const timeFraction =
    state.phaseEndsAtMs === null ? 1 : Math.max(0, (state.phaseEndsAtMs - Date.now()) / 20000);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-4" style={{ flexBasis: '35%' }}>
        <Progress value={timeFraction * 100} />
        <p className="text-center text-sm text-foreground/70">
          {state.answered.length} of {players.length} answered
        </p>
        <h2 className="text-center font-heading text-xl">{state.prompt.question}</h2>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3 p-4" style={{ flexBasis: '55%' }}>
        {state.prompt.choices.map((choice, i) => (
          <AnswerTile
            key={i}
            choiceIndex={i as ChoiceIndex}
            text={choice}
            isCorrect={null}
            isSelected={false}
            onSelect={onAnswer}
            disabled={hasAnswered}
          />
        ))}
      </div>
    </div>
  );
}
```

`selfId` is required here, matching every other screen's props (`LobbyScreen`, `SetupScreen`, `RevealScreen`, `PodiumScreen` all require it too) — `App.tsx` (Task 15) always has it in scope by the time any of these render, so there is no case where it would genuinely be absent.

- [ ] **Step 12: Run test to verify it passes**

Run: `npx vitest run src/screens/QuestionScreen.test.tsx src/components/AnswerTile.test.tsx`
Expected: PASS.

- [ ] **Step 13: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 14: Commit**

```bash
git add web/src/lib/colors.ts web/src/lib/colors.test.ts web/src/components/AnswerTile.tsx web/src/components/AnswerTile.test.tsx web/src/screens/QuestionScreen.tsx web/src/screens/QuestionScreen.test.tsx
git commit -m "feat: add question screen with shape+color answer tiles and live answered count"
```

---

### Task 13: Reveal screen

**Files:**
- Create: `web/src/screens/RevealScreen.tsx`, `web/src/screens/RevealScreen.test.tsx`

**Interfaces:**
- Consumes: `AnswerTile` (Task 12), `PublicState.reveal`, `.deltas` (Task 2), `.players`
- Produces: `interface RevealScreenProps { readonly state: PublicState; readonly selfId: string }`. Rendered when `state.phase === 'REVEAL'`.

Correct answer, explanation, source quote, this player's own delta, and a running scoreboard sorted by score (spec §6's REVEAL row).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import RevealScreen from './RevealScreen.js';
import type { PublicState } from '../../../src/shared/types.js';

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'REVEAL',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 1000, joinedAtMs: 0, connected: true },
      { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 500, joinedAtMs: 1, connected: true },
    ],
    questionIndex: 0,
    totalQuestions: 5,
    phaseEndsAtMs: Date.now() + 5000,
    prompt: { question: 'What powers the cell?', choices: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'] },
    answered: [],
    reveal: { correctIndex: 1, explanation: 'Mitochondria produce ATP.', sourceQuote: 'The mitochondrion is the powerhouse of the cell.' },
    deltas: [
      { playerId: 'p1', points: 1000, choiceIndex: 1 },
      { playerId: 'p2', points: 0, choiceIndex: 0 },
    ],
    error: null,
    ...overrides,
  };
}

describe('RevealScreen', () => {
  test('shows the explanation and source quote', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    expect(screen.getByText('Mitochondria produce ATP.')).toBeInTheDocument();
    expect(screen.getByText('The mitochondrion is the powerhouse of the cell.')).toBeInTheDocument();
  });

  test('marks the correct choice distinctly', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    const correctTile = screen.getByText('Mitochondria').closest('button');
    expect(correctTile).toHaveAttribute('data-correct', 'true');
  });

  test('shows this player\'s own delta', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    expect(screen.getByText(/\+1000/)).toBeInTheDocument();
  });

  test('shows a zero delta plainly for a wrong answer, not as an error', () => {
    render(<RevealScreen state={makeState()} selfId="p2" />);
    expect(screen.getByText(/\+0/)).toBeInTheDocument();
  });

  test('shows a scoreboard sorted by score descending', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    const names = screen.getAllByTestId('scoreboard-row').map((row) => row.textContent);
    expect(names[0]).toContain('Juan');
    expect(names[1]).toContain('Maria');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/RevealScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/screens/RevealScreen.tsx`**

```tsx
import AnswerTile from '../components/AnswerTile.js';
import type { ChoiceIndex, PublicState } from '../../../src/shared/types.js';

export interface RevealScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
}

export default function RevealScreen({ state, selfId }: RevealScreenProps) {
  if (state.prompt === null || state.reveal === null) return null;

  const myDelta = state.deltas.find((d) => d.playerId === selfId);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        {state.prompt.choices.map((choice, i) => (
          <AnswerTile
            key={i}
            choiceIndex={i as ChoiceIndex}
            text={choice}
            isCorrect={i === state.reveal!.correctIndex}
            isSelected={myDelta?.choiceIndex === i}
            onSelect={() => {}}
            disabled
          />
        ))}
      </div>

      <div className="rounded-base border-2 border-border bg-secondary-background p-3">
        <p className="font-bold">{state.reveal.explanation}</p>
        <p className="mt-1 text-sm italic text-foreground/70">"{state.reveal.sourceQuote}"</p>
      </div>

      {myDelta !== undefined && (
        <p className="text-center font-heading text-2xl">
          {myDelta.points > 0 ? `+${myDelta.points}` : '+0'}
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {ranked.map((player) => (
          <li
            key={player.id}
            data-testid="scoreboard-row"
            className="flex justify-between rounded-base border-2 border-border bg-secondary-background px-3 py-2"
          >
            <span>{player.name}</span>
            <span className="font-bold">{player.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/RevealScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/RevealScreen.tsx web/src/screens/RevealScreen.test.tsx
git commit -m "feat: add reveal screen with delta and running scoreboard"
```

---

### Task 14: Podium screen

**Files:**
- Create: `web/src/screens/PodiumScreen.tsx`, `web/src/screens/PodiumScreen.test.tsx`

**Interfaces:**
- Consumes: `canvas-confetti`, `PublicState.players`, `.hostId`
- Produces: `interface PodiumScreenProps { readonly state: PublicState; readonly selfId: string; readonly onPlayAgain: () => void }`. Rendered when `state.phase === 'PODIUM'`.

Final 1–4 ranking with confetti (spec §6). "Play again" is host-only, exactly like the Lobby's "Start" — the same rule, spec §6's ambiguity-closing bullet.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PodiumScreen from './PodiumScreen.js';
import type { PublicState } from '../../../src/shared/types.js';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'PODIUM',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 3000, joinedAtMs: 0, connected: true },
      { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 4500, joinedAtMs: 1, connected: true },
    ],
    questionIndex: 4,
    totalQuestions: 5,
    phaseEndsAtMs: null,
    prompt: null,
    answered: [],
    reveal: null,
    deltas: [],
    error: null,
    ...overrides,
  };
}

describe('PodiumScreen', () => {
  test('ranks players by score, highest first', () => {
    render(<PodiumScreen state={makeState()} selfId="p1" onPlayAgain={() => {}} />);
    const rows = screen.getAllByTestId('podium-row').map((r) => r.textContent);
    expect(rows[0]).toContain('Maria');
    expect(rows[1]).toContain('Juan');
  });

  test('fires confetti on mount', async () => {
    const confetti = (await import('canvas-confetti')).default;
    render(<PodiumScreen state={makeState()} selfId="p1" onPlayAgain={() => {}} />);
    expect(confetti).toHaveBeenCalled();
  });

  test('shows Play Again only to the host', () => {
    render(<PodiumScreen state={makeState({ hostId: 'p1' })} selfId="p1" onPlayAgain={() => {}} />);
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });

  test('does not show Play Again to a non-host', () => {
    render(<PodiumScreen state={makeState({ hostId: 'p1' })} selfId="p2" onPlayAgain={() => {}} />);
    expect(screen.queryByRole('button', { name: /play again/i })).not.toBeInTheDocument();
  });

  test('clicking Play Again calls onPlayAgain', async () => {
    const onPlayAgain = vi.fn();
    render(<PodiumScreen state={makeState({ hostId: 'p1' })} selfId="p1" onPlayAgain={onPlayAgain} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /play again/i }));
    expect(onPlayAgain).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/screens/PodiumScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `web/src/screens/PodiumScreen.tsx`**

```tsx
import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '../components/ui/button.js';
import type { PublicState } from '../../../src/shared/types.js';

export interface PodiumScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
  readonly onPlayAgain: () => void;
}

export default function PodiumScreen({ state, selfId, onPlayAgain }: PodiumScreenProps) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const isHost = state.hostId === selfId;

  useEffect(() => {
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6">
      <h1 className="font-heading text-2xl">Final Ranking</h1>
      <ol className="flex w-full flex-col gap-2">
        {ranked.map((player, i) => (
          <li
            key={player.id}
            data-testid="podium-row"
            className="flex items-center justify-between rounded-base border-2 border-border bg-secondary-background px-4 py-3"
          >
            <span className="font-heading">
              #{i + 1} {player.name}
            </span>
            <span className="font-bold">{player.score}</span>
          </li>
        ))}
      </ol>
      {isHost && (
        <Button onClick={onPlayAgain} className="w-full">
          Play Again
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/screens/PodiumScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/screens/PodiumScreen.tsx web/src/screens/PodiumScreen.test.tsx
git commit -m "feat: add podium screen with confetti and host-only replay"
```

---

### Task 15: App shell — phase router and lobby creation

**Files:**
- Modify: `web/src/App.tsx`, `web/src/App.test.tsx`

**Interfaces:**
- Consumes: every screen (Tasks 8–14), `useGameConnection` (Task 7)
- Produces: the wired application. This is the last task before E2E.

Renders `IdentityScreen` until a `PublicState` exists, then the screen matching `state.phase`. Handles the one thing no lower-level module can: turning an empty-string `code` from `IdentityScreen` (Task 8's "Create Lobby" signal) into a real code via `POST /api/lobby` before connecting.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.js';
import { useGameConnection } from './hooks/useGameConnection.js';

vi.mock('./hooks/useGameConnection.js');

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows IdentityScreen when there is no state yet', () => {
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: vi.fn(),
      send: vi.fn(),
    });

    render(<App />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  test('renders LobbyScreen when phase is LOBBY', () => {
    vi.mocked(useGameConnection).mockReturnValue({
      state: {
        phase: 'LOBBY',
        lobbyCode: 'ABCD',
        hostId: 'p1',
        players: [{ id: 'p1', name: 'Juan', avatarSeed: 's1', score: 0, joinedAtMs: 0, connected: true }],
        questionIndex: 0,
        totalQuestions: 0,
        phaseEndsAtMs: null,
        prompt: null,
        answered: [],
        reveal: null,
        deltas: [],
        error: null,
      },
      connectionStatus: 'connected',
      rejection: null,
      join: vi.fn(),
      send: vi.fn(),
    });

    render(<App />);
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  test('calling join with an empty code fetches a fresh lobby code before connecting', async () => {
    const joinSpy = vi.fn();
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: joinSpy,
      send: vi.fn(),
    });
    global.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ code: 'NEWC' }) });

    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[0]!);
    await user.click(screen.getByRole('button', { name: /create lobby/i }));

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/lobby'), expect.objectContaining({ method: 'POST' }));
    expect(joinSpy).toHaveBeenCalledWith(expect.objectContaining({ code: 'NEWC' }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/App.test.tsx`
Expected: FAIL — `App.tsx` still just renders `<div>QuizClash</div>`.

- [ ] **Step 3: Rewrite `web/src/App.tsx`**

```tsx
import { useGameConnection } from './hooks/useGameConnection.js';
import IdentityScreen from './screens/IdentityScreen.js';
import LobbyScreen from './screens/LobbyScreen.js';
import SetupScreen from './screens/SetupScreen.js';
import CountdownScreen from './screens/CountdownScreen.js';
import QuestionScreen from './screens/QuestionScreen.js';
import RevealScreen from './screens/RevealScreen.js';
import PodiumScreen from './screens/PodiumScreen.js';
import { loadSession } from './lib/session.js';

const WS_HOST = import.meta.env.VITE_WS_HOST as string;

export default function App() {
  const { state, rejection, join, send } = useGameConnection();

  async function handleJoin(params: { code: string; name: string; avatarSeed: string }) {
    if (params.code === '') {
      const response = await fetch(`https://${WS_HOST}/api/lobby`, { method: 'POST' });
      const body = (await response.json()) as { code: string };
      join({ ...params, code: body.code });
      return;
    }
    join(params);
  }

  if (state === null) {
    return (
      <div>
        {rejection !== null && <p role="alert">{rejection}</p>}
        <IdentityScreen onJoin={handleJoin} />
      </div>
    );
  }

  const selfId = loadSession()?.playerId ?? '';

  switch (state.phase) {
    case 'LOBBY':
      return <LobbyScreen state={state} selfId={selfId} onOpenSetup={() => send({ type: 'OPEN_SETUP' })} />;
    case 'SETUP':
    case 'GENERATING':
      return (
        <SetupScreen
          state={state}
          selfId={selfId}
          onSubmit={(config, source) => send({ type: 'SUBMIT_SETUP', config, source })}
        />
      );
    case 'COUNTDOWN':
      return <CountdownScreen phaseEndsAtMs={state.phaseEndsAtMs} />;
    case 'QUESTION':
      return (
        <QuestionScreen
          state={state}
          players={state.players}
          selfId={selfId}
          onAnswer={(choiceIndex) => send({ type: 'SUBMIT_ANSWER', choiceIndex })}
        />
      );
    case 'REVEAL':
      return <RevealScreen state={state} selfId={selfId} />;
    case 'PODIUM':
      return <PodiumScreen state={state} selfId={selfId} onPlayAgain={() => send({ type: 'PLAY_AGAIN' })} />;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: all pass, exit 0.

- [ ] **Step 6: Verify the whole app actually boots against a real local backend**

This is the first time the client and server run together — the equivalent of Plan A's `wrangler dev` boot check.

In one terminal, from the repo root: `npx wrangler dev --local --port 8787`
In another, from `web/`: `npm run dev`

Open the printed Vite URL (typically `http://localhost:5173`) in a browser. Type a name, pick an avatar, click "Create Lobby." Confirm the screen transitions to the Lobby view showing a real lobby code and your own avatar. Stop both dev servers afterward.

If this fails, the most likely causes are: `VITE_WS_HOST` not matching the Wrangler port, or a CORS/mixed-content issue on the `fetch` to `/api/lobby` — read whatever error the browser console actually shows rather than guessing.

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx web/src/App.test.tsx
git commit -m "feat: wire the app shell as a phase router with lobby creation"
```

---

### Task 16: E2E happy path

**Files:**
- Create: `web/playwright.config.ts`, `web/e2e/happy-path.spec.ts`

**Interfaces:**
- Consumes: the running app (Vite dev server + `wrangler dev`)
- Produces: one Playwright spec proving two real browser contexts can play a full round together (spec §10).

This is deliberately one flow, not a coverage tool (spec §10) — it exists to catch integration seams no unit or component test can see, the way the unicast bug (Task 1) or the missing `webSocketError` handler (already fixed in Plan A) would only show up here.

- [ ] **Step 1: Create `web/playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['iPhone 14'],
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
```

`devices['iPhone 14']` gives the mobile viewport the spec's testing strategy calls for (§10: "happy path at a mobile viewport"). `webServer` starts Vite automatically if it isn't already running — but this test also needs `wrangler dev` running against the same `VITE_WS_HOST`, which Playwright cannot start itself since it lives in the sibling root project; the step below runs it manually.

- [ ] **Step 2: Write `web/e2e/happy-path.spec.ts`**

```ts
import { test, expect, type Browser } from '@playwright/test';

async function joinAsNewPlayer(browser: Browser, name: string) {
  const context = await browser.newContext(); // separate session = separate player identity
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel(/name/i).fill(name);
  await page.getByRole('img').first().click();
  return { context, page };
}

test('two players can join, and the host reaches the lobby with both seated', async ({ browser }) => {
  const host = await joinAsNewPlayer(browser, 'Host');
  await host.page.getByRole('button', { name: /create lobby/i }).click();
  await expect(host.page.getByText(/[A-Z0-9]{4}/)).toBeVisible({ timeout: 10_000 });

  const lobbyCode = await host.page.getByText(/^[A-Z0-9]{4}$/).textContent();
  expect(lobbyCode).not.toBeNull();

  const guest = await joinAsNewPlayer(browser, 'Guest');
  await guest.page.getByLabel(/lobby code/i).fill(lobbyCode!);
  await guest.page.getByRole('button', { name: /^join$/i }).click();

  await expect(host.page.getByText('Guest')).toBeVisible({ timeout: 10_000 });
  await expect(guest.page.getByText('Host')).toBeVisible({ timeout: 10_000 });

  await host.context.close();
  await guest.context.close();
});
```

This deliberately stops at "both players see each other seated in the lobby" rather than driving a full game through Gemini generation — a real generation call spends API quota and takes up to 90s, which the spec's own testing strategy explicitly keeps out of automated runs ("Fake Gemini — generation is tested against fixture files. No test spends API quota or touches the network," §10). Extending this spec to cover Setup → Countdown → Question → Reveal → Podium requires either a way to inject a stubbed generation result into a real running Worker (not yet built anywhere in this codebase) or accepting a real Gemini call in CI — both are judgment calls for whoever picks this up next, not something to resolve inside this task.

- [ ] **Step 3: Run it against both dev servers**

In one terminal, from the repo root: `npx wrangler dev --local --port 8787`
In `web/`: `npx playwright install --with-deps chromium` (one-time), then `npm run e2e`

Expected: PASS. Stop the Wrangler server afterward.

- [ ] **Step 4: Commit**

```bash
git add web/playwright.config.ts web/e2e/happy-path.spec.ts
git commit -m "test: add E2E happy path for two players joining a lobby"
```

---

### Task 17: Production build verification

**Files:**
- Create: `web/vercel.json` (only if the default Vite preset needs an override — verify first)

**Interfaces:**
- Consumes: nothing new
- Produces: a verified-working production build. **This task does not deploy anything.** `vercel deploy` is an outward-facing action and stays the user's own call, exactly as `wrangler deploy` did at the end of Plan A.

- [ ] **Step 1: Run the production build**

Run: `cd web && npm run build`
Expected: exits 0, produces `web/dist/`.

- [ ] **Step 2: Serve the production build locally and smoke-test it**

Run: `npm run preview` (Vite's built-in static server for the `dist/` output)
Open the printed URL, confirm the Identity screen renders and looks styled (neobrutalism borders/shadows visible, not a flash of unstyled content). Stop the preview server.

- [ ] **Step 3: Check whether `vercel.json` is needed**

Vercel auto-detects a Vite project (build command `npm run build`, output directory `dist`) with no config file required for a standard setup. The one thing worth checking: this repo has two npm projects (root and `web/`), so if the user points a Vercel project at the repo root, it must be told the actual app lives in `web/`. If you have the ability to check Vercel's current documented behavior for monorepo subdirectory detection, do so; otherwise, create `web/vercel.json` defensively:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

and note in your task report that the Vercel project's "Root Directory" setting must be set to `web` when the user connects the repository — this is a dashboard setting, not something committed to a file, and is the one manual step Task 12/§12 of the spec already calls out as the user's own responsibility.

- [ ] **Step 4: Final full-repo verification**

Run from the repo root: `npm test && npm run typecheck` (root/Worker project)
Run from `web/`: `npm test && npm run typecheck && npm run build`

Expected: everything green.

- [ ] **Step 5: Commit**

```bash
git add web/vercel.json
git commit -m "chore: verify production build; document the Vercel root-directory setting"
```

---

## Plan B Completion Criteria

- [ ] Root project: `npm test` and `npm run typecheck` both green (unaffected by anything in `web/`)
- [ ] `web/`: `npm test`, `npm run typecheck`, `npm run build` all green
- [ ] `web/e2e`: happy path passes against a locally running Worker
- [ ] Task 15 Step 6's manual boot check passed: a real browser, a real local Worker, a real lobby created and joined by two tabs
- [ ] No screen computes a score, decides when a question ends, or advances a phase — grep for anything resembling scoring or phase-transition logic inside `web/src/screens/` and confirm none exists
- [ ] Every answer tile carries a distinct shape, not just a distinct color
- [ ] `vercel deploy` and `wrangler deploy` are NOT run by this plan — both remain the user's explicit call
