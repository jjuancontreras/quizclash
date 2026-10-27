# Quiz Clash

A mobile-first, **4-player live trivia game** that writes its questions from
your own study material. Upload a reviewer, PDF or any text, choose the
difficulty and the number of questions, and race up to three friends on your
phones.

## How it works

1. **The host uploads material.** Gemini (Flash Lite) generates a
   multiple-choice quiz once, up front, against a strict Zod schema. Each
   question carries an explanation and a quote from the source text.
2. **Friends join by lobby code.** Each lobby is a Cloudflare **Durable
   Object** that holds the game state and talks to every phone over
   **WebSockets** in real time.
3. **Speed + correctness scoring.** The server owns the clock, so a client
   can't fake its answer time. Once anyone answers, everyone else gets a
   7-second "hurry up" window.
4. **Reveal and podium.** Each round shows the correct answer, its explanation
   and source quote, and the running scoreboard.

## Design decisions

- **No accounts, no database.** Nothing persists between matches, which keeps
  the whole stack on free tiers.
- **Cloudflare runs the game, Vercel serves the UI.** Vercel's WebSockets
  can't broadcast across instances, so a 4-player lobby needs a Durable Object.
- **No AI calls during play.** Questions are generated once, then grading is
  a plain comparison, so play is fast and deterministic.
- **Durable Object state is persisted on every change.** Cloudflare can
  hibernate a lobby between messages. Found in a live playtest, fixed and
  re-verified.

## Testing

- **208 tests at ~95% coverage** on the game engine (Vitest, run inside the
  Workers runtime), plus React component tests and Playwright E2E for the
  client.
- Live two-device playtests surfaced bugs the unit tests couldn't catch:
  missing CORS, `crypto.randomUUID` failing on plain-HTTP LAN, and lost
  hibernation state. Each one was fixed and re-verified live.
  [The design spec](docs/superpowers/specs/) §14 records every post-launch fix.

## Stack

TypeScript · React · Vite · Tailwind · Framer Motion · Cloudflare Workers +
Durable Objects · WebSockets · Gemini API · Zod · Vitest · Playwright

## Run it

```bash
npm install && npm test          # engine tests
cd web && npm install && npm test # client tests
```

The game server runs on Cloudflare (`wrangler deploy`, with `GEMINI_API_KEY`
set as a Worker secret).

Built with AI-assisted development (Claude Code), spec-first and test-driven,
with code and security review at each stage.
