import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeClient } from './realtimeClient.js';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.onclose?.();
  }

  // Test helper, not part of the real WebSocket interface.
  simulateOpen(): void {
    this.onopen?.();
  }
  simulateMessage(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('RealtimeClient', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('connect builds a URL with every required query parameter', () => {
    const client = new RealtimeClient();
    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: 'tok', name: 'Juan', avatarSeed: 'seed-1' });

    const socket = FakeWebSocket.instances[0]!;
    const url = new URL(socket.url);
    expect(url.searchParams.get('code')).toBe('ABCD');
    expect(url.searchParams.get('playerId')).toBe('p1');
    expect(url.searchParams.get('token')).toBe('tok');
    expect(url.searchParams.get('name')).toBe('Juan');
    expect(url.searchParams.get('seed')).toBe('seed-1');
  });

  test('emits a connected event once the socket opens', () => {
    const client = new RealtimeClient();
    const events: string[] = [];
    client.on((e) => events.push(e.type));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    FakeWebSocket.instances[0]!.simulateOpen();

    expect(events).toContain('connected');
  });

  test('translates an incoming STATE frame into a state event', () => {
    const client = new RealtimeClient();
    const events: unknown[] = [];
    client.on((e) => events.push(e));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    const fakeState = { phase: 'LOBBY', lobbyCode: 'ABCD' };
    FakeWebSocket.instances[0]!.simulateMessage({ type: 'STATE', state: fakeState });

    expect(events).toContainEqual({ type: 'state', state: fakeState });
  });

  test('translates an incoming IDENTITY frame into an identity event', () => {
    const client = new RealtimeClient();
    const events: unknown[] = [];
    client.on((e) => events.push(e));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    FakeWebSocket.instances[0]!.simulateMessage({ type: 'IDENTITY', playerId: 'p1', reconnectToken: 'minted-secret' });

    expect(events).toContainEqual({ type: 'identity', playerId: 'p1', reconnectToken: 'minted-secret' });
  });

  test('send serializes and forwards a message to the socket', () => {
    const client = new RealtimeClient();
    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });

    client.send({ type: 'SUBMIT_ANSWER', choiceIndex: 2 });

    const socket = FakeWebSocket.instances[0]!;
    expect(socket.sent).toContainEqual(JSON.stringify({ type: 'SUBMIT_ANSWER', choiceIndex: 2 }));
  });

  test('on returns an unsubscribe function', () => {
    const client = new RealtimeClient();
    const events: string[] = [];
    const unsubscribe = client.on((e) => events.push(e.type));

    client.connect({ host: 'localhost:8787', code: 'ABCD', playerId: 'p1', token: '', name: 'Juan', avatarSeed: 'seed-1' });
    unsubscribe();
    FakeWebSocket.instances[0]!.simulateOpen();

    expect(events).toEqual([]);
  });
});
