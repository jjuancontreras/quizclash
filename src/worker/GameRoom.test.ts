import { env, runInDurableObject } from 'cloudflare:test';
import { describe, expect, test } from 'vitest';
import type { GameRoom } from './GameRoom.js';
import type { GameState } from '../shared/types.js';

function room(name: string) {
  const id = env.GAME_ROOM.idFromName(name);
  return env.GAME_ROOM.get(id) as DurableObjectStub<GameRoom>;
}

/**
 * The alarm test needs the room parked in a mid-game phase. GameRoom
 * deliberately exposes no setter: an unvalidated whole-state overwrite on a
 * Durable Object is reachable over RPC by anyone holding a typed stub. So the
 * seam lives here, in the tests, and nowhere in production code — `private`
 * is a compile-time rule, which is exactly what this cast spends.
 */
function seedState(instance: GameRoom, next: GameState): void {
  (instance as unknown as { state: GameState }).state = next;
}

/** Connects a player's socket and accepts it client-side, matching the fetch/accept shape every test in this file already uses. */
async function connectAndAccept(
  stub: DurableObjectStub<GameRoom>,
  code: string,
  playerId: string,
): Promise<WebSocket> {
  const response = await stub.fetch(
    `https://do/ws?code=${code}&name=${playerId}&seed=s&playerId=${playerId}`,
    { headers: { Upgrade: 'websocket' } },
  );
  const socket = response.webSocket;
  if (socket === null) throw new Error('expected a websocket in the response');
  socket.accept();
  return socket;
}

/** Resolves once `count` messages have arrived on `socket`, parsed from JSON. */
function collectFrames(
  socket: WebSocket,
  count: number,
): Promise<{ type: string; [key: string]: unknown }[]> {
  return new Promise((resolve) => {
    const frames: { type: string; [key: string]: unknown }[] = [];
    socket.addEventListener('message', (event) => {
      frames.push(JSON.parse(String(event.data)) as { type: string; [key: string]: unknown });
      if (frames.length === count) resolve(frames);
    });
  });
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

    // A fresh join now also receives a one-off IDENTITY message ahead of the
    // STATE snapshot (Task: reconnect token). It arrives first; STATE follows.
    const messages: { type: string; state?: { players: { id: string }[] } }[] = [];
    await new Promise<void>((resolve) => {
      client.addEventListener('message', (event) => {
        messages.push(JSON.parse(String(event.data)));
        if (messages.length === 2) resolve();
      });
    });

    expect(messages[0]?.type).toBe('IDENTITY');
    const stateMessage = messages.find((m) => m.type === 'STATE');
    expect(stateMessage?.state?.players.map((p) => p.id)).toEqual(['p1']);
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

  /**
   * The hibernation API routes an abnormally-terminated socket to
   * webSocketError, not webSocketClose. Without a handler the seat stays
   * connected forever: every later question runs its full window waiting for
   * a ghost, cleanup can never fire, and the seat blocks a rejoin.
   */
  test('frees the seat when a socket terminates abnormally', async () => {
    const stub = room('QRST');
    for (const id of ['p1', 'p2']) {
      await stub.fetch(`https://do/ws?code=QRST&name=${id}&seed=s&playerId=${id}`, {
        headers: { Upgrade: 'websocket' },
      });
    }

    await runInDurableObject(stub, async (instance: GameRoom, state: DurableObjectState) => {
      const socket = state
        .getWebSockets()
        .find((ws) => (ws.deserializeAttachment() as { playerId: string }).playerId === 'p1');
      if (socket === undefined) throw new Error('expected p1 to hold an accepted socket');

      await instance.webSocketError(socket, new Error('connection reset by peer'));

      expect(instance.debugState().players.map((p) => p.id)).toEqual(['p2']);
      expect(instance.debugState().hostId).toBe('p2');
    });
  });

  /**
   * The reconnect token is what stops one player in a lobby from reading a
   * rival's id off their own STATE frame and hijacking that seat on a second
   * socket. It must reach its owner, and only its owner, on a fresh join.
   */
  test('sends the fresh joiner an IDENTITY message carrying a non-empty reconnect token', async () => {
    const stub = room('IDEN');
    const response = await stub.fetch('https://do/ws?code=IDEN&name=Juan&seed=s1&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    const client = response.webSocket;
    if (client === null) throw new Error('expected a websocket in the response');
    client.accept();

    const messages: { type: string; playerId?: string; reconnectToken?: string }[] = [];
    await new Promise<void>((resolve) => {
      client.addEventListener('message', (event) => {
        messages.push(JSON.parse(String(event.data)));
        if (messages.length === 2) resolve();
      });
    });

    const identity = messages.find((m) => m.type === 'IDENTITY');
    expect(identity).toBeDefined();
    expect(identity?.playerId).toBe('p1');
    expect(identity?.reconnectToken).toEqual(expect.any(String));
    expect(identity?.reconnectToken?.length).toBeGreaterThan(0);
  });

  /**
   * The property that actually matters: IDENTITY is unicast, not broadcast.
   * The one moment a leak could happen is when a second player joins while
   * the first is already connected — the first socket is listening and
   * would receive a broadcast if the send were ever changed to one. Every
   * join broadcasts a STATE frame to already-connected sockets regardless
   * (proven by the existing "holds engine state" test), so the first socket
   * is guaranteed to receive at least that one frame; this test asserts it
   * receives nothing else, in particular no IDENTITY naming the second
   * player.
   */
  test('never sends an already-connected socket the IDENTITY meant for someone else', async () => {
    const stub = room('UNIC');
    const first = await stub.fetch('https://do/ws?code=UNIC&name=Juan&seed=s1&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });
    const firstClient = first.webSocket;
    if (firstClient === null) throw new Error('expected a websocket in the response');
    firstClient.accept();

    // Drain p1's own IDENTITY + STATE from its own join before watching for
    // whatever arrives once p2 joins.
    const firstMessagesAfterOwnJoin: { type: string; playerId?: string }[] = [];
    await new Promise<void>((resolve) => {
      firstClient.addEventListener('message', (event) => {
        firstMessagesAfterOwnJoin.push(JSON.parse(String(event.data)));
        if (firstMessagesAfterOwnJoin.length === 2) resolve();
      });
    });

    const leakedToFirst: { type: string; playerId?: string }[] = [];
    firstClient.addEventListener('message', (event) => {
      leakedToFirst.push(JSON.parse(String(event.data)));
    });

    const second = await stub.fetch('https://do/ws?code=UNIC&name=Ana&seed=s2&playerId=p2', {
      headers: { Upgrade: 'websocket' },
    });
    const secondClient = second.webSocket;
    if (secondClient === null) throw new Error('expected a websocket in the response');
    secondClient.accept();

    // Every join broadcasts a STATE frame to already-connected sockets
    // regardless of the identity feature, so p1 is guaranteed to receive
    // exactly that one frame here. Wait for it, then give any extra (leaked)
    // frame a further moment to arrive before asserting on the full set.
    await new Promise<void>((resolve) => {
      const seenAlready = leakedToFirst.some((m) => m.type === 'STATE');
      if (seenAlready) { resolve(); return; }
      const onMessage = (event: MessageEvent): void => {
        const message = JSON.parse(String(event.data)) as { type: string };
        if (message.type === 'STATE') {
          firstClient.removeEventListener('message', onMessage);
          resolve();
        }
      };
      firstClient.addEventListener('message', onMessage);
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(leakedToFirst).toEqual([{ type: 'STATE', state: expect.anything() }]);
    expect(leakedToFirst.find((m) => m.type === 'IDENTITY' && m.playerId === 'p2')).toBeUndefined();
  });

  test('accepts a reconnect whose token matches the one issued on join', async () => {
    const stub = room('RECN');
    const joined = await stub.fetch('https://do/ws?code=RECN&name=Juan&seed=s1&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });
    const joinClient = joined.webSocket;
    if (joinClient === null) throw new Error('expected a websocket in the response');
    joinClient.accept();

    const identity = await new Promise<{ type: string; reconnectToken: string }>((resolve) => {
      joinClient.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { type: string; reconnectToken: string };
        if (message.type === 'IDENTITY') resolve(message);
      });
    });

    const reconnect = await stub.fetch(
      `https://do/ws?code=RECN&playerId=p1&token=${identity.reconnectToken}`,
      { headers: { Upgrade: 'websocket' } },
    );

    expect(reconnect.status).toBe(101);
    expect(reconnect.webSocket).not.toBeNull();
  });

  test('refuses a reconnect with a missing or wrong token with 401, never accepting the socket', async () => {
    const stub = room('BADT');
    await stub.fetch('https://do/ws?code=BADT&name=Juan&seed=s1&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    const wrongToken = await stub.fetch('https://do/ws?code=BADT&playerId=p1&token=not-the-real-token', {
      headers: { Upgrade: 'websocket' },
    });
    expect(wrongToken.status).toBe(401);
    expect(wrongToken.webSocket).toBeNull();

    const missingToken = await stub.fetch('https://do/ws?code=BADT&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });
    expect(missingToken.status).toBe(401);
    expect(missingToken.webSocket).toBeNull();

    await runInDurableObject(stub, (instance: GameRoom) => {
      expect(instance.debugState().players).toHaveLength(1);
    });
  });

  test('advances the game when its alarm fires', async () => {
    const stub = room('MNOP');
    await stub.fetch('https://do/ws?code=MNOP&name=p1&seed=s&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });

    await runInDurableObject(stub, async (instance: GameRoom) => {
      seedState(instance, {
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

  /**
   * debugState() is a test seam that must never expose reconnectToken.
   * Even though it returns GameState (not PublicState), the token is a
   * server secret that belongs only on secure channels — testing must be
   * able to read other fields like phase, hostId, and player ids without
   * accidentally leaking the actual token value.
   */
  test('strips reconnectToken from players in debugState', async () => {
    const stub = room('DBTK');
    const response = await stub.fetch('https://do/ws?code=DBTK&name=TestPlayer&seed=s1&playerId=p1', {
      headers: { Upgrade: 'websocket' },
    });
    const client = response.webSocket;
    if (client === null) throw new Error('expected a websocket in the response');
    client.accept();

    // Capture the real token sent in the IDENTITY message so we can verify
    // debugState() does NOT return this value
    const realToken = await new Promise<string>((resolve) => {
      client.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as { type: string; reconnectToken?: string };
        if (message.type === 'IDENTITY' && message.reconnectToken) {
          resolve(message.reconnectToken);
        }
      });
    });

    await runInDurableObject(stub, (instance: GameRoom) => {
      const debugged = instance.debugState();

      // debugState must return a GameState, so players are still Player[], not PublicPlayer[]
      expect(debugged.players).toHaveLength(1);

      const player = debugged.players[0];
      expect(player).toBeDefined();

      // Other fields must be intact
      expect(player?.id).toBe('p1');
      expect(player?.name).toBe('TestPlayer');
      expect(player?.connected).toBe(true);

      // The critical check: reconnectToken must NOT be the real value
      expect(player?.reconnectToken).not.toBe(realToken);
      // And it should be empty (the obfuscation strategy)
      expect(player?.reconnectToken).toBe('');
    });
  });

  /**
   * The property that actually matters for REJECTED, mirroring the IDENTITY
   * unicast test above: a rejection addressed to one player must never reach
   * anyone else's socket, even though both are seated in the same room.
   */
  test('a NOT_HOST rejection reaches only the rejected player, never the other seated players', async () => {
    const stub = room('NHST');
    const hostSocket = await connectAndAccept(stub, 'NHST', 'p1');
    await collectFrames(hostSocket, 2); // p1's own IDENTITY + STATE

    // Registered before p2 joins: an already-accepted socket only queues
    // messages for listeners attached ahead of the send, unlike a socket that
    // has not yet been accepted (see connectAndAccept usage above).
    const hostBroadcastFromJoin = collectFrames(hostSocket, 1); // the STATE broadcast from p2 joining
    const otherSocket = await connectAndAccept(stub, 'NHST', 'p2');
    await hostBroadcastFromJoin;
    await collectFrames(otherSocket, 2); // p2's own IDENTITY + STATE

    const leakedToHost: { type: string }[] = [];
    hostSocket.addEventListener('message', (event) => {
      leakedToHost.push(JSON.parse(String(event.data)) as { type: string });
    });

    const otherFramesPromise = collectFrames(otherSocket, 1);
    otherSocket.send(JSON.stringify({ type: 'OPEN_SETUP' })); // p2 is not host

    const otherFrames = await otherFramesPromise;
    expect(otherFrames).toContainEqual({ type: 'REJECTED', reason: 'NOT_HOST' });

    // Give any leaked broadcast a moment to arrive before asserting none did.
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(leakedToHost.some((f) => f.type === 'REJECTED')).toBe(false);
  });
});
