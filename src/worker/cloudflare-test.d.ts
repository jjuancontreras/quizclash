/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { Env as WorkerEnv } from './env.js';

// `cloudflare:test`'s `env` export is typed as `Cloudflare.Env`, an interface
// meant to be extended per-project (see @cloudflare/workers-types). Without
// this, `env.GAME_ROOM` in GameRoom.test.ts would not type-check.
declare global {
  namespace Cloudflare {
    interface Env extends WorkerEnv {}
  }
}
