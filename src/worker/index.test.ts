import { env, runInDurableObject, SELF } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';
import { isValidLobbyCode } from '../engine/lobbyCode.js';
import type { GameRoom } from './GameRoom.js';

describe('POST /api/lobby', () => {
  test('mints a valid lobby code', async () => {
    const response = await SELF.fetch('https://example.com/api/lobby', { method: 'POST' });
    const body = (await response.json()) as { code: string };

    expect(response.status).toBe(200);
    expect(isValidLobbyCode(body.code)).toBe(true);
  });

  test('mints a different code on a second call', async () => {
    const first = (await (await SELF.fetch('https://example.com/api/lobby', { method: 'POST' })).json()) as { code: string };
    const second = (await (await SELF.fetch('https://example.com/api/lobby', { method: 'POST' })).json()) as { code: string };

    expect(first.code).not.toBe(second.code);
  });
});

describe('GET /ws', () => {
  test('rejects a malformed lobby code before reaching a Durable Object', async () => {
    const response = await SELF.fetch('https://example.com/ws?code=ab0d&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    expect(response.status).toBe(400);
  });

  test('accepts a lowercase code by normalizing it', async () => {
    const response = await SELF.fetch('https://example.com/ws?code=abcd&playerId=p1&name=Juan&seed=s', {
      headers: { Upgrade: 'websocket' },
    });

    expect(response.status).toBe(101);
  });

  test('forwards the normalized (uppercase) code to the Durable Object, not the raw input', async () => {
    const response = await SELF.fetch('https://example.com/ws?code=qrst&playerId=p1&name=Juan&seed=s', {
      headers: { Upgrade: 'websocket' },
    });
    expect(response.status).toBe(101);

    // The router addressed the object by the normalized code, so that is the
    // id we must look it up by too -- idFromName('qrst') would be a
    // different object entirely.
    const id = env.GAME_ROOM.idFromName('QRST');
    const stub = env.GAME_ROOM.get(id) as DurableObjectStub<GameRoom>;

    await runInDurableObject(stub, (instance: GameRoom) => {
      expect(instance.debugState().lobbyCode).toBe('QRST');
    });
  });

  test('requires a websocket upgrade header', async () => {
    const response = await SELF.fetch('https://example.com/ws?code=ABCD&playerId=p1');
    expect(response.status).toBe(426);
  });
});

describe('unknown routes', () => {
  test('returns 404 rather than falling through', async () => {
    const response = await SELF.fetch('https://example.com/nope');
    expect(response.status).toBe(404);
  });
});
