import { SELF } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';
import { isValidLobbyCode } from '../engine/lobbyCode.js';

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
