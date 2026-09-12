import { GameRoom } from './GameRoom.js';
import type { Env } from './env.js';

export { GameRoom };

/**
 * The Worker's public entry point. Every lobby is one GameRoom Durable
 * Object instance, addressed by its lobby code; this handler's only job is
 * to route an incoming websocket upgrade to that instance.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    if (code === null || code === '') {
      return new Response('Missing lobby code', { status: 400 });
    }

    const id = env.GAME_ROOM.idFromName(code);
    return env.GAME_ROOM.get(id).fetch(request);
  },
} satisfies ExportedHandler<Env>;
