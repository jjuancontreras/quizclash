import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';
import type { GameRoom } from './GameRoom.js';

function room(name: string) {
  const id = env.GAME_ROOM.idFromName(name);
  return env.GAME_ROOM.get(id) as DurableObjectStub<GameRoom>;
}

describe('GameRoom', () => {
  test('upgrades a websocket request and seats the connecting player', async () => {
    const stub = room('ABCD');
    const response = await stub.fetch('https://do/ws?code=ABCD&name=Juan&seed=s1&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    expect(response.status).toBe(101);
    expect(response.webSocket).not.toBeNull();
  });

  test('rejects a non-websocket request rather than crashing', async () => {
    const response = await room('ABCD').fetch('https://do/ws?code=ABCD');
    expect(response.status).toBe(426);
  });

  test('sends the current state to the newly accepted socket immediately', async () => {
    const stub = room('WXYZ');
    const response = await stub.fetch('https://do/ws?code=WXYZ&name=Juan&seed=s1&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    const client = response.webSocket;
    if (client === null) throw new Error('expected a websocket in the response');
    client.accept();

    const first = await new Promise<MessageEvent>((resolve) => {
      client.addEventListener('message', (event) => resolve(event), { once: true });
    });

    const message = JSON.parse(String(first.data)) as { type: string; state: { players: { id: string }[] } };
    expect(message.type).toBe('STATE');
    expect(message.state.players.map((p) => p.id)).toEqual(['p1']);
  });

  test('holds engine state across separate requests to the same object', async () => {
    const stub = room('EFGH');
    await stub.fetch('https://do/ws?code=EFGH&name=Juan&seed=s&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    await runInDurableObject(stub, (instance: GameRoom) => {
      expect(instance.debugState().players).toHaveLength(1);
      expect(instance.debugState().hostId).toBe('p1');
    });
  });

  test('rejects a fifth player with the engine\'s LOBBY_FULL reason', async () => {
    const stub = room('IJKL');
    for (const id of ['p1', 'p2', 'p3', 'p4']) {
      await stub.fetch(`https://do/ws?code=IJKL&name=${id}&seed=s&playerId=${id}`, {
        headers: { Upgrade: 'websocket' },
      });
    }

    await runInDurableObject(stub, (instance: GameRoom) => {
      expect(instance.debugState().players).toHaveLength(4);
    });

    const fifth = await stub.fetch('https://do/ws?code=IJKL&name=p5&seed=s&playerId=p5', {
      headers: { Upgrade: 'websocket' },
    });
    expect(fifth.status).toBe(409);
  });

  test('advances the game when its alarm fires', async () => {
    const stub = room('MNOP');
    await stub.fetch('https://do/ws?code=MNOP&name=p1&seed=s&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    await runInDurableObject(stub, async (instance: GameRoom) => {
      instance.debugSetState({
        ...instance.debugState(),
        phase: 'COUNTDOWN',
        questions: [
          { question: 'Q?', choices: ['a', 'b', 'c', 'd'], correctIndex: 0, explanation: 'e', sourceQuote: 'q' },
        ],
        phaseEndsAtMs: 0,
      });
      await instance.alarm();
      expect(instance.debugState().phase).toBe('QUESTION');
    });
  });
});
