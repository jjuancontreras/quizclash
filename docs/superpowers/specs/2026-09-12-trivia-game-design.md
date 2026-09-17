# QuizClash — Design Spec

**Date:** 2026-09-12 (updated 2026-09-13)
**Domain:** Personal
**Status:** Plan A shipped and merged (engine + Durable Object, including the reconnect-token hardening in §6). Plan B (client) next.
**Outcomes record:** `docs/superpowers/plan-a-outcomes.md` — decisions corrected during Plan A's execution, what shipped beyond this document's original text, and what Plan B must pick up. This spec has been updated in place to match; the outcomes doc is the narrative of *why*.

---

## 1. Purpose

A web-based, mobile-first, 4-player competitive trivia game. A host uploads reference material (a PDF reviewer, lecture notes, or pasted text); the system generates a multiple-choice quiz from it with an LLM; up to four players answer simultaneously on their phones, scored on both correctness and speed. The goal is studying that feels like a game.

## 2. Global Constraints

Inherited from `~/.claude/rules/common/`:

- **coding-style.md** — immutability, KISS/DRY/YAGNI, files 200–400 lines typical / 800 max, functions under 50 lines, no deep nesting, explicit error handling.
- **security.md** — no hardcoded secrets, validate all input at boundaries.
- **testing.md** — 80% coverage floor, AAA structure, descriptive test names, TDD.
- **git-workflow.md** — `<type>: <description>` commit format.

## 3. Decisions Locked During Brainstorming

| # | Decision | Rationale |
|---|---|---|
| 1 | **Guest identity, no accounts** | Nothing persists between matches, so accounts would store only a display name and avatar seed. Deletes an entire module and all password-handling risk. Reversible later. |
| 2 | **Per-match podium only** | No ELO, no ladder, no lifetime stats. |
| 3 | **In-memory state, no database** | Follows from #1 and #2. Server restart drops in-flight games; acceptable for a 4-friend game. Also what keeps Cloudflare free — no Durable Object storage billing. |
| 4 | **PDF and pasted text only** | Gemini reads PDFs natively, so no text-extraction pipeline. DOCX/PPTX would require a conversion dependency; images produce unpredictable question quality. |
| 5 | **Google Gemini Flash** | Free tier (~15 RPM / 1,500 RPD, no card). Native file understanding removes the extraction/chunking/RAG subsystem entirely. ~1M token context fits a whole chapter. Structured output guarantees valid question objects. |
| 6 | **One-shot batch generation** | All questions generated before the countdown. No model call during gameplay; answer checking is integer comparison. |
| 7 | **Option A for answer-key errors** | Source quote surfaced on the REVEAL screen. No host preview — it would give the host foreknowledge and break competitive fairness. Flag-and-void deferred to V2. |
| 8 | **React + Vite on Vercel; Durable Object per lobby on Cloudflare** | Vercel cannot broadcast between function instances, so it cannot host the game itself. See §4. |
| 9 | **Neobrutalism visual direction** | Sourced library, not generated. See §9. |
| 10 | **Injected clock** | Required for deterministic tests of a 20s question window. Must be designed in from the first commit. |
| 11 | **Reconnect requires a server-minted secret, not just the player id** | Added during Plan A after the original guest-identity design (#1) turned out to leave every player's id broadcast to the whole lobby, letting anyone reconnect as anyone. See §6. |

## 4. Hosting Architecture

Two deploy targets, one GitHub repo.

**Vercel — the interface.** Serves the React SPA. This is the shareable URL; invite links are `<app>.vercel.app/join/<CODE>`. Vercel Hobby, free, no card.

**Cloudflare Workers + Durable Objects — the game and the AI.** One Durable Object instance per lobby code. It holds players, questions, and scores in memory, owns the authoritative clock, and serves the WebSocket connections directly.

**Why not Vercel alone.** Vercel added native WebSocket support (public beta, June 2026), but connections are pinned to a single function instance and there is no built-in way to broadcast to connections held by another instance. Four players can land on four instances, and the lobby cannot talk to itself. Vercel's own remedy is Redis or a third-party provider — which would move live state out of memory, contradicting decision #3.

**Why not Vercel + Node/Socket.IO on Railway or Render.** The conventional fallback and far easier to debug, but Render's free tier sleeps and takes roughly 50s to wake — an invite link that looks broken — and Railway no longer offers a real free tier. Retained as the fallback if Workers proves obstructive.

**Why Gemini is called from the Durable Object, not a Vercel function.** Workers do not bill time spent awaiting a network call, so a 40s generation request is free and untimed there. A Vercel Hobby function could time out mid-generation.

### Cost

| Piece | Plan | Card | Limit |
|---|---|---|---|
| GitHub | Free | No | — |
| Vercel | Hobby | No | Non-commercial only |
| Cloudflare Workers + Durable Objects | Free | No | 100k req/day; inbound WS messages billed 20:1, outbound free |
| Gemini API | Free tier | No | ~15 RPM, 1,500 RPD |
| neobrutalism.dev, motion, canvas-confetti, DiceBear, Tailwind | OSS | No | — |

Durable Object **storage** began billing in January 2026 — not incurred here, because state is in-memory and nothing is written to disk.

### Secrets

`GEMINI_API_KEY` is set by the user via `npx wrangler secret put GEMINI_API_KEY` and read as `env.GEMINI_API_KEY`. It never enters the repo, a file, or a chat transcript.

## 5. Module Decomposition

| # | Module | Responsibility | Depends on | Status |
|---|---|---|---|---|
| 1 | `shared/` | TypeScript types: `Question`, `Player`, `GamePhase`, and a discriminated union of every wire message. Imported by both client and Worker so a mistyped event is a compile error. | — | **Shipped (Plan A)** |
| 2 | Quiz Generator | `{ source, count, difficulty, topics }` → `Question[]`. Owns the Gemini prompt, JSON schema, and output validation. Knows nothing about games or sockets. | 1 | **Shipped** |
| 3 | Scoring | Pure: `(answeredAtMs, shownAtMs, windowMs, isCorrect)` → points. Isolated despite being tiny because it is the mechanic the whole game rests on. | 1 | **Shipped** |
| 4 | Game Room (Durable Object) | The authoritative state machine. Holds players, questions, scores, clock. Every phase transition happens here and nowhere else. | 1, 2, 3 | **Shipped**, hardened post-merge with the reconnect-token check (§6) |
| 5 | Lobby Codes | Generate and validate 4-character codes; map code to Durable Object id. Excludes ambiguous characters (no `0`/`O`, no `1`/`I`) because codes are read aloud and typed on phones. | — | **Shipped** |
| 6 | Realtime Client | Browser socket wrapper: connect, auto-reconnect with backoff, typed dispatch. React components never see a raw WebSocket. Must capture the `IDENTITY` message (§6) on first join and carry the token on every reconnect. | 1 | **Plan B** |
| 7 | UI Screens | Identity, Lobby, Setup, Countdown, Question, Reveal, Podium. | 1, 6 | **Plan B** |

**The invariant that keeps this honest:** the client renders state and sends intent. It never computes a score, decides when a question ends, or advances a phase. All of that lives in module 4.

Modules 1–5 shipped as **Plan A**: a fully tested, headless engine and Durable Object with no UI — verified end to end via `wrangler dev` against a live Gemini key. Modules 6–7 are **Plan B**, starting from this spec plus two engine additions the final Plan A review found necessary before any client can be built correctly (both below): `PublicState` needs `answered`/`deltas` fields, and every `REJECTED`/`ERROR` message needs to reach only its intended recipient rather than the whole lobby.

## 6. Game State Machine

| Phase | Players see | Exits when |
|---|---|---|
| `LOBBY` | Avatars bubbling in, lobby code, invite link | Host opens setup |
| `SETUP` | Host: the wizard. Others: "Host is building the quiz…" | Host submits |
| `GENERATING` | A real elapsed-time progress bar for everyone, not just a static message | Questions validated, or failure |
| `COUNTDOWN` | 3 → 2 → 1, synced | 3s elapse |
| `QUESTION` | "Question N of Total", question, 4 choices, shrinking timer bar, per-player answered roster | All players answered **or** window expires |
| `REVEAL` | Correct answer, explanation, source quote, delta, running scoreboard | 5s elapse |
| `PODIUM` | Final 1–4 ranking, confetti | Host chooses "Play again", or all leave |

`QUESTION → REVEAL` advances as soon as all four have answered, so the fastest player is not left staring at a dead screen.

### Rules that close ambiguities in the above

- **The host plays.** They occupy one of the four seats and are scored like anyone else. This is why the rejected host-preview idea in §8 breaks the game rather than merely bending it.
- **"Play again" returns the lobby to `LOBBY` with scores reset and the same players seated** — except players who disconnected before the podium, whose seats are pruned so a replacement can join without the lobby reading as full. If the departed player was host, the longest-connected remaining player is promoted, matching the `LOBBY` promotion rule below. It does *not* replay the same questions — a fresh `SETUP` and generation is required, because replaying a known answer key is not a game. Reusing the previous quiz is part of the deferred quiz-library feature (§11).
- **A fifth player attempting to join is rejected** with "This lobby is full" and returned to the join screen. The lobby cap is enforced in the Durable Object, not the UI.
- **A late join into a seat freed earlier in the same lobby is allowed at any phase**, including mid-round — there is no cap on when a player may join, only on how many are seated at once. They start at zero score; any question they missed before joining stays unanswered for them, scored 0 like a timeout. This is a deliberate recovery path, not a gap: it is how a lobby stays playable after someone leaves mid-`LOBBY` and a replacement shows up once the round is already moving.
- **Duplicate display names inside one lobby are disambiguated with a numeric suffix** (`Juan`, `Juan (2)`). Names are trimmed, capped at 16 characters, and stripped of control characters on arrival — the display name is untrusted input rendered on three other people's screens. The DiceBear avatar seed gets the identical treatment: stripped to `[A-Za-z0-9_-]`, capped at 32 characters, falling back to a default seed when nothing usable remains. It is exactly the same class of input — attacker-controlled, rendered on three other screens for the life of the lobby — and earns the same boundary discipline.

### Scoring

```
points = correct ? round(1000 * (1 - 0.5 * timeUsed / windowMs)) : 0
```

Instant correct ≈ 1000; buzzer-beater correct ≈ 500; wrong or no answer 0. Window is **20 seconds, fixed** — not configurable in V1.

**Why halving rather than a linear ramp to zero:** linear-to-zero scores a correct answer at 19 of 20 seconds at about 25 points, as if the player knew nothing. Speed should decide between two players who both know the answer; knowing it must always beat not knowing it.

### Timing model and its accepted flaw

`timeUsed` is the server clock at answer arrival minus the server clock at question broadcast. This includes network round-trip, so a player on worse wifi is penalised by their latency.

**Accepted deliberately:** a typical RTT of 20–80ms against a 20,000ms window is under 0.4% of score, below the noise of human reaction time. The alternative — trusting a client-reported elapsed time — fixes a rounding error by creating a field players can lie in. Clients render a local countdown for smoothness; it is cosmetic and never feeds scoring.

### Disconnect handling

| Event | Behaviour | Why |
|---|---|---|
| Player drops in `LOBBY`, `SETUP`, or `GENERATING` | Seat freed, avatar bubbles out; host reassigned if it was them | Nothing worth preserving yet — no questions exist and every score is still zero, while an absent host actively blocks the lobby (only the host can open or submit setup). These three phases are treated identically: a round has not started. |
| Player drops in `COUNTDOWN`, `QUESTION`, or `REVEAL` | Seat and score kept; game continues; missed questions score 0; may rejoin and resume | Three players must not be held hostage by one person's wifi, and there is now a score worth preserving |
| Host drops in `LOBBY`, `SETUP`, or `GENERATING` | Longest-connected remaining player promoted to host | A wifi blip must not destroy the lobby, and — specifically for `SETUP`/`GENERATING` — the game cannot otherwise be started or retried at all, since both actions are host-gated |
| Host drops during `COUNTDOWN`/`QUESTION`/`REVEAL` | Game continues uninterrupted, host seat and identity unchanged | The clock lives in the Durable Object, not the host's browser |
| Host absent at `PODIUM` | Longest-connected remaining player promoted to host | Otherwise "Play again" and re-`OPEN_SETUP` are both host-gated and the room can never restart |
| All players drop | 10-minute alarm, then self-cleanup | Prevents abandoned lobbies leaking memory |

**Reconnecting requires proof, not just the id.** Every player id is visible to every other player in the lobby (§6's `STATE` broadcasts include the full seated list) — an id was never meant to double as a credential. A player is authenticated for reconnect by a **`reconnectToken`**: a random secret the server mints once, at first join, and reveals to nobody but its owner.

- On a fresh join, the server's first message on that socket — before the usual `STATE` snapshot — is a one-off `IDENTITY` frame: `{ playerId, reconnectToken }`. It is sent once, to that socket only, and never appears in any broadcast or in any later message to anyone.
- The client stores `{ lobbyCode, playerId, reconnectToken }` in `sessionStorage`.
- To reconnect, the client sends all three. The server checks the token against what it minted for that `playerId`; only on a match does it restore the seat and push the full state snapshot (the same shape used for a fresh join, so there is still one code path, not two). A mismatch is refused **before the WebSocket connection is even accepted** — the client's connection attempt itself fails, so the UI needs an explicit "couldn't reconnect" state, distinct from "still connecting."
- Losing the token (a cleared `sessionStorage`, a different device) means the seat cannot be reclaimed — the player rejoins as someone new. Accepted: there are no accounts and nothing persists past the match, so this matches the rest of the guest-identity model rather than being a new limitation.

### Two engine gaps Plan B must close before any screen work

Found by Plan A's final whole-branch review, executing the reducer against adversarial scenarios rather than reading it. Both are engine changes with engine tests — not client workarounds, and not optional polish, because the two screens they block (`REVEAL` and the reject-message UI) cannot be built correctly without them.

**1. Messages must reach only their intended recipient.** Today, the wire protocol has no notion of a reply — every `ERROR` and `REJECTED` message rides the same broadcast channel as `STATE`, so when one player taps a host-only control, **all four players see the rejection**, aimed at someone they can't identify. Fix: give the engine's result type a way to address a message to one player (a `replies` list alongside `broadcasts`, or a `to: playerId` tag on individual messages) and have the Durable Object route by the socket's own player id rather than fanning everything out. This has to land before Plan B's client reads a single `REJECTED` frame, or the client gets built assuming a message is always meant for the viewer.

**2. `PublicState` needs `answered` and `deltas`.** The `REVEAL` row above promises "delta" and the `QUESTION → REVEAL` rule promises the round advances "as soon as all four have answered" — but nothing in the current wire state exposes either. A client cannot show "2 of 4 answered" during `QUESTION`, cannot show a per-question score delta on `REVEAL`, and a player who reconnects mid-round has no prior frame to diff against to recover either fact. Fix: `PublicState` gains `answered: readonly string[]` (player ids who have answered the live question) during `QUESTION`, and `deltas: readonly { playerId, points, choiceIndex }[]` during `REVEAL` — both pure projections of the engine's own `state.answers`, requiring no new state to be tracked.

## 7. Setup Wizard

**One scrollable bottom sheet, not four sequential popups.** Four modals on a phone is four chances to lose your place, and it hides the total commitment until step three.

1. **Source** — drop a PDF, or a "paste text instead" tab. Gates the rest: the remaining sections stay disabled until a source is present.
2. **How many** — 5 / 10 / 15 / 20 as large pill buttons.
3. **Difficulty** — Easy / Medium / Hard.
4. **Focus** *(optional)* — free text, e.g. "photosynthesis, cell division".

Then a single **Generate** button. Non-host players see a live "Host is building the quiz…" state with the file name.

Auto-extracted topic chips are deferred to V2: a second Gemini call plus a selection UI, to solve a problem you mostly do not have when uploading your own reviewer.

## 8. Question Generation

### Difficulty must be defined behaviourally

"Hard" means nothing to a model unstated; without definitions you get three flavours of the same question. The prompt defines:

- **Easy** — direct recall of a fact stated explicitly; wrong choices clearly wrong.
- **Medium** — requires connecting two stated facts or applying a definition; wrong choices plausible.
- **Hard** — requires inferring or applying a concept to a case not in the material; wrong choices are **common misconceptions** about the topic.

Difficulty lives in the distractors, not the question stem.

### Schema

```ts
{
  question:     string   // <= 120 chars
  choices:      string[] // exactly 4, each <= 60 chars
  correctIndex: 0 | 1 | 2 | 3
  explanation:  string   // <= 150 chars, shown on REVEAL
  sourceQuote:  string   // the span of material it was drawn from, <= 200 chars
}
```

`sourceQuote` gets the same cap treatment as everything else it's shown alongside on the `REVEAL` screen — 200 characters, chosen to comfortably hold a sentence or two on a phone without the card growing taller than the explanation above it. Like the other four fields, this is enforced server-side, not merely requested in the prompt.

**The generated set is also capped to exactly what was asked for.** The schema and prompt both aim at `config.count`, but neither *guarantees* it — a model can return more. Server-side validation slices the prepared set down to `config.count` after the existing filter/dedupe/shuffle pipeline, so a host who asked for 10 questions can never get a 25-minute game because the model got generous.

**Three layers of unequal strength.** The JSON schema *guarantees* shape — four choices, a valid index, no missing fields. The prompt *requests* length limits and the question count. Only server-side validation *enforces* either. Code must treat every length limit and every count as untrusted until checked.

**Why 120 and 60:** on a 375px phone at readable size, 120 characters is roughly four lines of question text, and (originally, when choices lived in a 2×2 grid cell — see §9's V1 revision for why that layout changed) 60 characters was about what a cell held before it scrolled. The limit itself didn't need to change when the layout did — a full-width row comfortably fits 60 characters on one or two lines either way — but the constraint's origin was the grid, not the current list. The mobile-first requirement is a **generation** constraint either way, not a CSS one.

**Overflowing questions are dropped, never truncated** — a question cut mid-clause is worse than no question. If at least 5 survive, the round plays short; below that it is a generation failure.

### Quality controls

1. **Answer-position bias** — models favour certain slots. Choices are **shuffled server-side after generation and `correctIndex` recomputed.** Without this, players notice the pattern within about six questions and exploit it.
2. **Duplicates** — one single call so the model sees all its own questions at once, an explicit "no two questions may test the same fact" instruction, and a server-side near-duplicate check on question text.
3. **Hallucination** — the prompt requires every answer be derivable from the provided material alone, and every question carries a `sourceQuote`.

**Known limitation, stated honestly:** because Gemini reads the PDF natively and the system never extracts the text itself, `sourceQuote` **cannot be verified server-side for PDFs** — it can for pasted text. Rather than pretend to verify it, the quote is **surfaced on the REVEAL screen** beneath the explanation. This turns an unverifiable field into the most pedagogically useful element in the game, and four humans looking at a fabricated quote catch it more reliably than a fuzzy string match would.

**Pre-generation solves determinism, not accuracy.** There is no model call during gameplay — grading is `submittedIndex === question.correctIndex`. But a wrong answer key generated up front is frozen for the whole round. Option A (source quote on reveal) makes such an error *visible*; it does not protect the *outcome*. Flag-and-void — two or more players flag a question, it is voided and points refunded at the podium — is the V2 upgrade, and the design already supports it since scores are recomputed at the podium regardless.

### Failure paths

- Malformed or schema-invalid output, or fewer than 5 valid questions survive → retry once (after a short delay, added in V1 — see §14), then back to `SETUP`.
- **V1 revision: the retry-exhausted message is no longer one-size-fits-all.** If every failed attempt looked transient (a rate-limit or 5xx status from the model call), the host sees "The AI service is busy right now. Please wait a moment and try again." — not a claim about their file. Only when at least one attempt failed for a genuine content/schema reason does the host see "Couldn't build a quiz from that file — try a different file or paste the text." Both are still generic enough to never leak a raw model error (unresolvable model id, expired key, exhausted quota all stay indistinguishable from outside — logged server-side only).
- Upload over 10MB → rejected client-side before sending.
- Generation exceeding 90s → the engine's own alarm-based hard cutoff fires first, independent of `generateQuiz`'s two-attempt retry above; this is a separate message ("Question generation is taking longer than usual — that's almost always the AI service being busy, not your file. Try again in a minute.", reworded in V1 for the same reason as the busy-message split above) rather than either of the two `generateQuiz` outcomes.

**Every failure returns the host to a screen where they can retry. No phase may strand the lobby.**

### Delivery

PDFs are sent to Gemini inline as base64; the 10MB cap keeps this under the inline limit, so there is no Files API upload step and nothing to clean up.

### Prompt injection

An uploaded PDF could contain text such as "ignore your instructions". The worst case here is bad questions, not data loss — but the material is inserted into the prompt as clearly delimited **data**, never as instructions, and all generated output is validated before being trusted.

## 9. Visual Design

**Component library: [neobrutalism.dev](https://www.neobrutalism.dev/)** — React + Tailwind, MIT, built on shadcn/ui. Thick black borders, hard offset shadows, saturated colour blocks, chunky rounded buttons.

**Why over the alternatives:** [Preline](https://preline.co/) and [FlyonUI](https://flyonui.com/) are clean and corporate — the app would look like a SaaS dashboard that happens to ask questions. Cloning Kahoot's look is both derivative and trademark-adjacent. Neobrutalism earns it on practical grounds: the style is **forgiving** — thick borders and hard shadows read as "game" immediately, and imperfect spacing still looks deliberate. For a non-designer that is the difference between playful and unfinished. Being shadcn-based, components are copied into the repo as owned source, not an opaque dependency.

**Layout reference:** [Queezy — Quiz App UI Kit](https://www.figma.com/community/file/1178996093139112052/free-queezy-quiz-app-ui-kit) (free, Figma Community) — screen composition and answer-grid proportions only, not its colours.

**Motion:** `motion` (Framer Motion) for the bubbly join — a spring with overshoot so avatars pop past final size and settle. `canvas-confetti` for the podium.

**Avatars:** [DiceBear](https://www.dicebear.com/) — deterministic avatars generated from a seed string. A grid of 12 pre-seeded options; only the seed is stored. No uploads, no image hosting, no moderation surface.

### Answer choices — V1 revision: A/B/C/D list, not shape+colour tiles

**Superseded during V1 refinement, after real playtesting.** The original design below (a 2×2 grid of shape+colour tiles) shipped first, then was replaced: it read as a direct clone of Kahoot's own answer-tile pattern — exactly the outcome §9's own component-library rationale explicitly warned against ("Cloning Kahoot's look is both derivative and trademark-adjacent"). The fix that was live-tested and shipped is a vertical list of full-width rows, each labelled with a conventional **A/B/C/D** letter badge instead of a shape+hue pair.

This did not reopen the accessibility requirement — it satisfies it more simply. A letter is colour-independent on its own; no separate shape pairing is needed to keep colour from being load-bearing. Correct/wrong feedback at `REVEAL` still uses colour (green/red), but only as reinforcement alongside the letter and the explanation text, never as the only signal.

The original shape+colour design, kept here for the record of what changed and why:

> Roughly 1 in 12 men has some colour vision deficiency. Four answers distinguished by colour alone make that player's game materially harder, on a timer. Each answer got a distinct hue **and** a distinct shape, so colour was redundant rather than load-bearing.
>
> | Slot | Shape | Hue |
> |---|---|---|
> | 1 | Circle | Coral red |
> | 2 | Triangle | Ocean blue |
> | 3 | Square | Sun yellow |
> | 4 | Diamond | Grass green |

### Mobile layout (portrait primary)

- **Question screen:** question text and a live "N of M players answered" roster (with per-player checkmarks) in the top ~35%; a **vertical list of four full-width answer rows** in the bottom ~55%, each a large thumb target.
- **Timer is a shrinking horizontal bar, not a number.** A bar is read peripherally while reading the question; a counting number steals focus from the question.
- **Lobby:** 2×2 avatar slots with visible empty "waiting for players" placeholders, so a 2-player lobby looks deliberate rather than broken.
- Safe-area insets respected for notched phones.
- **The page never scrolls horizontally at any breakpoint.**
- Desktop is the same layout, centred, max-width capped — genuinely mobile-first, not a desktop design squeezed down.

## 10. Testing Strategy

80% coverage floor, TDD throughout (RED → GREEN → REFACTOR).

**Unit** — scoring exhaustively (instant-correct, buzzer-correct, wrong, no answer, answer arriving after the window closed); lobby code generation and ambiguous-character exclusion; question validation, shuffling, near-duplicate detection.

**Integration** — the Durable Object driven through a complete game: join, host start, stubbed generation, all four answering, a player dropping mid-game, that player reconnecting, podium scores. This is where the real bugs live.

**E2E** — Playwright, two browser contexts (host and one player), happy path at a mobile viewport. One or two flows only; E2E proves the pieces connect, it is not a coverage tool.

**Fake Gemini** — generation is tested against fixture files. No test spends API quota or touches the network.

**Injected clock (architectural).** The Durable Object takes a time source rather than reading `Date.now()` directly. Otherwise testing a 20s window means a test that sleeps 20 seconds and a full-game test that takes ten minutes — a suite nobody runs. This must be designed in from the first commit, not retrofitted.

## 11. Explicitly Out of Scope for V1

Accounts and passwords; any database; quiz library or replay; DOCX, PPTX, or image input; spectators; in-game chat; more than 4 players; persistent stats or leaderboards; a configurable question window; auto-extracted topic chips; flag-and-void.

## 12. Setup Responsibilities

**Automated:** all code, `wrangler.jsonc`, GitHub repo creation and push, local verification under `wrangler dev` plus Vite before anything reaches a dashboard.

**Requires the user — three one-time browser logins, about 10 minutes:**

1. Cloudflare account, then `npx wrangler login` (OAuth).
2. Vercel signup via "Continue with GitHub", pointed at the repo.
3. Google AI Studio to mint the Gemini key, then `npx wrangler secret put GEMINI_API_KEY` — pasted by the user, never handled by Claude.

## 13. Open Risks

| Risk | Mitigation |
|---|---|
| Workers runtime is unfamiliar (not Node), with fewer tutorials | Cost is paid in setup, not ongoing complexity. Node/Socket.IO on Render is the documented fallback. |
| Wrong answer key frozen at generation | Option A makes it visible; flag-and-void is the V2 fix. |
| Question quality poor on dense or badly formatted PDFs | Failure path returns to SETUP; pasted text is the escape hatch. |
| Gemini free-tier limits change | 1,500 RPD against a handful of games leaves enormous headroom. |
| Server restart drops in-flight games | **Resolved in V1, not merely accepted.** A real hibernation-driven state loss was found and fixed after deploy (§14) — this risk should be considered closed, not just mitigated. |

## 14. V1 Shipped (2026-09-17)

V1 is live and considered feature-complete. Deployed to `https://quizclash.fernando-contreras.workers.dev`. Everything from here is refinement driven by real playtesting and outside feedback, not new architecture.

**Real bugs found only by playing the live, deployed game — invisible to every unit, integration, and local-dev test in this spec's §10:**

- **Durable Object state loss on hibernation.** `GameRoom`'s entire game state was a plain in-memory field with no persistence to `ctx.storage`. Cloudflare's WebSocket Hibernation API (`acceptWebSocket`) routinely evicts a Durable Object from memory between messages while keeping connections looking alive — every eviction silently reset the lobby to empty, and every seated player vanished from the server's own tracking without their own socket showing anything wrong. This directly falsifies the "Server restart drops in-flight games" risk above, which treated the failure mode as rare and acceptable; hibernation eviction is routine, not rare. Fixed: state is persisted to `ctx.storage` after every mutation and rehydrated via `blockConcurrencyWhile` in the constructor.
- **`crypto.randomUUID()` is unavailable outside a secure context.** Testing from a second device over plain HTTP on a LAN IP (not `localhost`) throws `TypeError: crypto.randomUUID is not a function` — silently swallowed by a broad `try/catch` into a misleading "Could not reach the server" message. Fixed with a `getRandomValues`-based fallback, which has no such restriction.
- **`/api/lobby` had no CORS header.** Worked via `curl`, silently blocked by every real browser. `curl` was never a substitute for a real cross-origin browser request.
- **`gemini-flash-latest` became unreliable in practice.** Confirmed directly against the live API: single calls taking 60–170s to return a `503 UNAVAILABLE` ("high demand"), well past this spec's 90s generation budget for even one of the two allowed attempts. Switched the default model to `gemini-flash-lite-latest` (verified end-to-end against real uploaded material) and added a per-attempt network timeout plus a short delay before the retry, so a rate-limit-shaped failure has a real chance of clearing before the budget is exhausted.
- **Generation's single failure message conflated "the AI service is busy" with "this file won't work."** Both collapsed into the same file-blaming text. Now split into two honest messages depending on whether every failed attempt looked transient (rate limit / 5xx) or not.

**Real design change, not a bug: §9's answer-tile design was replaced** (see the "V1 revision" note in §9) after it read as a Kahoot clone in practice — resolved without weakening the accessibility requirement it existed to serve.

**New mechanic, not in the original spec: competitive pressure.** Once any player answers a `QUESTION`, every player still deciding has their remaining time capped to a fixed hurry window (currently 7s), never extended — implemented as a `Math.min` against the existing deadline in the reducer, broadcast through the same `phaseEndsAtMs` field the client already renders, no wire-protocol change required. Paired with a client-side "hurry up" prompt and a live per-player answered roster (both driven by data — `state.answered` — the engine already exposed).

**Known gaps carried forward, not yet closed, still real:**

- Spec §6's original "with file name" claim for the non-host SETUP waiting screen was never implemented — the wire protocol has no field for it (`SetupMessageSchema` carries only `config` + `source`). Closing it needs a `sourceLabel`-shaped addition across the wire protocol, `GameState`, and `PublicState`. Judged cosmetic enough to defer through Plan B's final review and still true today.
- `wrangler dev --local` cannot boot on the primary dev machine (a Node v24.18.0/workerd `spawn UNKNOWN` incompatibility) — local iteration currently requires either a live `wrangler deploy` or `wrangler dev --remote` (which itself no longer supports Durable Objects, so it only covers non-DO routes). Worth resolving before the next round of engine-level refinement work, since it currently makes "run it locally and watch it work" impossible for the one component most likely to need iteration.
