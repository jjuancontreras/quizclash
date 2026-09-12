import { generateLobbyCode, isValidLobbyCode, normalizeLobbyCode } from '../engine/lobbyCode.js';
import type { Env } from './env.js';

export { GameRoom } from './GameRoom.js';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function routeWebSocket(request: Request, env: Env, url: URL): Response | Promise<Response> {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('Expected a websocket upgrade', { status: 426 });
  }

  const code = normalizeLobbyCode(url.searchParams.get('code') ?? '');
  if (!isValidLobbyCode(code)) {
    return new Response('Invalid lobby code', { status: 400 });
  }

  // The code IS the routing key: one Durable Object per lobby.
  const id = env.GAME_ROOM.idFromName(code);
  const forwarded = new URL(request.url);
  forwarded.searchParams.set('code', code);

  return env.GAME_ROOM.get(id).fetch(new Request(forwarded, request));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/lobby' && request.method === 'POST') {
      return json({ code: generateLobbyCode() });
    }

    if (url.pathname === '/ws') {
      return routeWebSocket(request, env, url);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;
