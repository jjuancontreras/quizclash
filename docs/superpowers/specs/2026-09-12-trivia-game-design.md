# QuizClash — Design Spec

**Date:** 2026-09-12
**Domain:** Personal
**Status:** Approved (brainstorming complete)
**Next step:** `superpowers:writing-plans`

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

| # | Module | Responsibility | Depends on |
|---|---|---|---|
| 1 | `shared/` | TypeScript types: `Question`, `Player`, `GamePhase`, and a discriminated union of every wire message. Imported by both client and Worker so a mistyped event is a compile error. | — |
| 2 | Quiz Generator | `{ source, count, difficulty, topics }` → `Question[]`. Owns the Gemini prompt, JSON schema, and output validation. Knows nothing about games or sockets. | 1 |
| 3 | Scoring | Pure: `(answeredAtMs, shownAtMs, windowMs, isCorrect)` → points. Isolated despite being tiny because it is the mechanic the whole game rests on. | 1 |
| 4 | Game Room (Durable Object) | The authoritative state machine. Holds players, questions, scores, clock. Every phase transition happens here and nowhere else. | 1, 2, 3 |
| 5 | Lobby Codes | Generate and validate 4-character codes; map code to Durable Object id. Excludes ambiguous characters (no `0`/`O`, no `1`/`I`) because codes are read aloud and typed on phones. | — |
| 6 | Realtime Client | Browser socket wrapper: connect, auto-reconnect with backoff, typed dispatch. React components never see a raw WebSocket. | 1 |
| 7 | UI Screens | Identity, Lobby, Setup, Countdown, Question, Reveal, Podium. | 1, 6 |

**The invariant that keeps this honest:** the client renders state and sends intent. It never computes a score, decides when a question ends, or advances a phase. All of that lives in module 4.

## 6. Game State Machine

| Phase | Players see | Exits when |
|---|---|---|
| `LOBBY` | Avatars bubbling in, lobby code, invite link | Host opens setup |
| `SETUP` | Host: the wizard. Others: "Host is building the quiz…" with file name | Host submits |
| `GENERATING` | Animated "building your quiz…" for everyone | Questions validated, or failure |
| `COUNTDOWN` | 3 → 2 → 1, synced | 3s elapse |
| `QUESTION` | Question, 4 choices, shrinking timer bar | All players answered **or** window expires |
| `REVEAL` | Correct answer, explanation, source quote, delta, running scoreboard | 5s elapse |
| `PODIUM` | Final 1–4 ranking, confetti | Host starts a new round, or all leave |

`QUESTION → REVEAL` advances as soon as all four have answered, so the fastest player is not left staring at a dead screen.

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
| Player drops in `LOBBY` | Seat freed, avatar bubbles out | Nothing to preserve |
| Player drops mid-game | Seat and score kept; game continues; missed questions score 0; may rejoin and resume | Three players must not be held hostage by one person's wifi |
| Host drops in `LOBBY` | Longest-connected remaining player promoted to host | A wifi blip must not destroy the lobby |
| Host drops mid-game | Game continues uninterrupted | The clock lives in the Durable Object, not the host's browser |
| All players drop | 10-minute alarm, then self-cleanup | Prevents abandoned lobbies leaking memory |

**Reconnect:** the client stores `{ lobbyCode, playerId }` in `sessionStorage`. On reconnect it sends both; the object re-attaches the player to their existing seat and pushes a **full state snapshot** — the same shape used for a fresh join, so there is one code path, not two.

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
  sourceQuote:  string   // the span of material it was drawn from
}
```

**Three layers of unequal strength.** The JSON schema *guarantees* shape — four choices, a valid index, no missing fields. The prompt *requests* length limits. Only server-side validation *enforces* them. Code must treat every length limit as untrusted until checked.

**Why 120 and 60:** on a 375px phone at readable size, 120 characters is roughly four lines of question text, and a 2×2 grid cell holds about 60 before it scrolls. The mobile-first requirement is therefore a **generation** constraint, not a CSS one.

**Overflowing questions are dropped, never truncated** — a question cut mid-clause is worse than no question. If at least 5 survive, the round plays short; below that it is a generation failure.

### Quality controls

1. **Answer-position bias** — models favour certain slots. Choices are **shuffled server-side after generation and `correctIndex` recomputed.** Without this, players notice the pattern within about six questions and exploit it.
2. **Duplicates** — one single call so the model sees all its own questions at once, an explicit "no two questions may test the same fact" instruction, and a server-side near-duplicate check on question text.
3. **Hallucination** — the prompt requires every answer be derivable from the provided material alone, and every question carries a `sourceQuote`.

**Known limitation, stated honestly:** because Gemini reads the PDF natively and the system never extracts the text itself, `sourceQuote` **cannot be verified server-side for PDFs** — it can for pasted text. Rather than pretend to verify it, the quote is **surfaced on the REVEAL screen** beneath the explanation. This turns an unverifiable field into the most pedagogically useful element in the game, and four humans looking at a fabricated quote catch it more reliably than a fuzzy string match would.

**Pre-generation solves determinism, not accuracy.** There is no model call during gameplay — grading is `submittedIndex === question.correctIndex`. But a wrong answer key generated up front is frozen for the whole round. Option A (source quote on reveal) makes such an error *visible*; it does not protect the *outcome*. Flag-and-void — two or more players flag a question, it is voided and points refunded at the podium — is the V2 upgrade, and the design already supports it since scores are recomputed at the podium regardless.

### Failure paths

- Malformed or schema-invalid output → retry once, then back to `SETUP` with "Couldn't build a quiz from that file — try a different file or paste the text."
- Fewer than 5 valid questions → generation failure.
- Upload over 10MB → rejected client-side before sending.
- Generation exceeding 90s → aborted, same failure path.

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

### Answer colours must carry shapes

Roughly 1 in 12 men has some colour vision deficiency. Four answers distinguished by colour alone make that player's game materially harder, on a timer. Each answer gets a distinct hue **and** a distinct shape, so colour is redundant rather than load-bearing.

| Slot | Shape | Hue |
|---|---|---|
| 1 | Circle | Coral red |
| 2 | Triangle | Ocean blue |
| 3 | Square | Sun yellow |
| 4 | Diamond | Grass green |

### Mobile layout (portrait primary)

- **Question screen:** question text in the top ~35%; **2×2 answer grid** in the bottom ~55%; each cell a large thumb target, around 140px tall — far above the 44px minimum.
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
| Server restart drops in-flight games | Accepted per decision #3. |
