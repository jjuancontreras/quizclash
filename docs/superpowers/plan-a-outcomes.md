# Plan A — Outcomes, Decisions, and Carry-Forward

**Branch:** `plan-a-engine` · **Date:** 2026-09-12/13
**Spec:** `specs/2026-09-12-trivia-game-design.md` · **Plan:** `plans/2026-09-12-plan-a-engine.md`

Plan A built the headless QuizClash game engine and its Cloudflare Durable Object adapter. No UI — that is Plan B.

This file is the durable record of decisions taken during execution. The SDD ledger that held them was scratch and has been deleted; git history plus this file are the record now.

## Final state

| | |
|---|---|
| Tasks | 14 of 14 complete, each reviewed |
| Tests | 200 passing across 15 files |
| Coverage (instrumentable code) | 95.71% statements · 93.49% branches · 97.14% functions |
| Typecheck | clean |
| End-to-end | `wrangler dev --local` boots; `POST /api/lobby` returns a live code |
| Commits | 30 |

## Decisions that changed the design during execution

These corrected defects in the **plan or spec**, not in the implementations. They are the ones worth remembering.

### 1. `SETUP` and `GENERATING` behave like `LOBBY` on disconnect, not like mid-game

Spec §6's disconnect table distinguishes "drops in LOBBY" from "drops mid-game" and never says which side `SETUP` and `GENERATING` fall on. The plan's `isInPlay` treated them as mid-game, which kept a departed host's seat without promoting a replacement — and since `SETUP` has no timer and only the host can start a game, the remaining three players were stranded permanently.

**Resolved:** a round is "running" only in `COUNTDOWN`, `QUESTION`, and `REVEAL`. Keeping a seat exists to preserve an accumulated score and let a player rejoin a live round; before `COUNTDOWN` no questions exist and all scores are zero, while an absent host actively blocks the lobby.

**Fold into the spec before Plan B.**

### 2. A generation result must be matched to the attempt that requested it

Phase alone is not a generation identity. A generation that exceeded its 90s timeout could resolve *after* the host retried and be accepted over the fresh attempt, overwriting its deadline.

**Resolved:** `GameState.generationId`, incremented on each `SUBMIT_SETUP`, carried on the `GENERATE` effect and both generation events, and matched in both handlers alongside the phase check.

### 3. A pending deadline must survive a seat being freed

Two separate bugs of this class were found and fixed: `handleJoin` and `handleLeave` each unconditionally armed the 10-minute idle alarm, clobbering a live 3s/20s/5s/90s phase deadline. Because those phases advance *only* when the alarm fires, the round would silently stall.

**Rule, now enforced in both handlers:** `alarmAtMs: state.phaseEndsAtMs ?? nowMs + IDLE_CLEANUP_MS`.

### 4. Round completion is decided per-player, never by counting

A disconnected player's answer stays in `state.answers` while they drop out of the connected count, so a count comparison could reveal the answer while a connected player still had an open turn — silently costing them their question.

**Resolved:** both `handleSubmitAnswer` and `handleLeave` use `everyConnectedPlayerAnswered`, which checks that each present player has an answer.

### 5. The answer key never reaches a browser early

`toPublicState` exposes `correctIndex` only inside the `reveal` object, gated on `phase === 'REVEAL'`. The test asserts the *serialized* payload contains no `correctIndex` at all. This is the anti-cheat property the pure-reducer architecture exists to make structural.

## Known limitations carried into Plan B

### Player identity is spoofable within a lobby — deferred to V2, deliberately

Player ids are broadcast verbatim to every player in each `STATE` frame, and `GameRoom.fetch` treats any URL-supplied `playerId` matching a seated player as a legitimate reconnect. **Any player can read another's id and open a second socket as them**, submitting answers or issuing host commands, with no signal to the victim.

Accepted for V1: the spec deliberately chose guest identity with no accounts; the blast radius is one lobby among four people who already share the join code; nothing persists.

**Two things Plan B must honour:**
1. **Do not build the client assuming player ids are secret.**
2. **Reserve the wire field now, even without enforcing it.** Spec §6 already commits the client to storing `{ lobbyCode, playerId }` and sending both on reconnect. Once that ships across two independently-deployed targets, adding a field is a breaking change. Mint a `reconnectSecret` at join, keep it server-side, never put it in `toPublicState`, return it only on the joining socket's first frame, and have the client store it. V1 may ignore it entirely; V2 becomes a one-line guard instead of a protocol migration.

### `DEFAULT_GEMINI_MODEL` — verified 2026-09-13

`'gemini-flash-latest'` was confirmed against a live key: `generateContent` resolves and returns a correct response. A transient 503 ("high demand") appeared on the first two attempts and cleared on retry — normal, not a configuration problem.

Worth recording: `gemini-2.5-flash` (the version named in `@google/genai`'s own README quickstart) was checked as a comparison and is now **404 — deprecated for new users**, with Google's error pointing callers at `gemini-3.6-flash`. This confirms the plan's choice of the `-latest` alias over a pinned dated version was correct — it tracks the current model automatically as Google retires versions, rather than needing code changes.

### `src/worker/**` has no coverage instrumentation

`@vitest/coverage-v8` cannot instrument workerd. The coverage run excludes `src/worker/**` and scopes to the `unit` project so it exits 0 and reports an honest number. Those tests still run under `npm test` — they simply produce no coverage data, so the adapter has no coverage safety net. Consider an istanbul provider for that project, or accept permanently.

### `compatibility_date` is pinned to the test runtime

`wrangler.jsonc` sits at `2026-08-22` because the bundled miniflare/workerd refuses a newer date. A comment in the file explains it. Raise it only when `@cloudflare/vitest-pool-workers` ships a newer miniflare, and re-run the worker suite after.

## Plan B's first two tasks are engine work, not UI

Both were found by the final whole-branch review and deliberately routed here rather than rushed into Plan A.

1. **Fix the unicast seam.** `EngineResult` has no notion of a reply, so `rejected()` puts `REJECTED` on the broadcast list and the adapter fans it out — **every player receives a rejection aimed at one of them**. Split `EngineResult` into `broadcasts` and `replies` (or tag messages with an optional `to`) and route by socket attachment. Do this *before* any client reads `REJECTED` frames; do not paper over it client-side.

2. **Add `answered` and `deltas` to `PublicState`.** Spec §6 requires the REVEAL screen to show a per-question delta, and the `QUESTION → REVEAL` rule makes an "n of 4 answered" indicator natural — but `state.answers` is never projected, so neither can be rendered. A reconnecting player has no prior frame to diff against. Both are pure projections; do them in the engine with engine tests.

## Spec gaps to close before Plan B is planned

- Which side `SETUP`/`GENERATING` fall on in the §6 disconnect table (decision 1 above).
- A length cap on `sourceQuote` — §8's schema table omits one, and it renders on a phone.
- An `avatarSeed` sanitisation rule — §6 specifies one for display names and is silent on seeds. The engine now sanitises it (`[A-Za-z0-9_-]`, capped at 32); the spec should say so.
- Whether a mid-game join is allowed — §6 covers rejecting a fifth player and is silent on a late fourth joining a running round.
- The `reconnectSecret` field in §6's reconnect paragraph.

## Notes for the client

- **`phaseEndsAtMs` is a server absolute timestamp.** Phone clocks drift. Compute an offset from the first `STATE` frame rather than trusting local `Date.now()`, or the timer bar will disagree with the server's cutoff.
- **Lobby codes are minted without a collision check.** `POST /api/lobby` never touches a Durable Object. At 31⁴ ≈ 923k this is negligible, but the join flow should show a clear error if a player lands in a lobby whose phase is not `LOBBY`.
- **E2E is entirely unwritten** (spec §10) because it needs a UI. Playwright with two browser contexts is the only thing that would have caught the unicast seam or the missing `webSocketError` handler — both invisible to the unit and worker suites.

## Deferred minor items

Recorded and judged acceptable to carry: the `shuffleQuestionChoices` out-of-range return (unreachable via `prepareQuestions`); the `generateLobbyCode` fallback on a contract-violating random source; `pendingSource` not being cleared after consumption; `isChoiceIndex` input-class tests; the anti-injection prompt assertion's substring; the empty-response throw test; the "clears any error" test's isolation; the reconnect broadcast assertion; `resolveNameCollision`'s magic number; `rejected()` restating its union; `PLAYER_JOIN`'s missing phase guard; the duplicate-`playerId` join; the `createGeminiModel` try/catch; and an `IDLE_CLEANUP_MS` alarm that fires in `LOBBY` without emitting `CLEANUP`.
