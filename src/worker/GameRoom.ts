import { DurableObject } from 'cloudflare:workers';
import { createInitialState, reduce, toPublicState } from '../engine/gameEngine.js';
import { createGeminiModel } from '../quiz/geminiClient.js';
import { generateQuiz } from '../quiz/generator.js';
import { parseClientMessage } from './messages.js';
import type { EngineEffect, EngineEvent, EngineResult, GameState, ServerMessage } from '../shared/types.js';
import type { QuizSource } from '../quiz/geminiClient.js';
import type { Env } from './env.js';

interface SocketMeta {
  readonly playerId: string;
}

export class GameRoom extends DurableObject<Env> {
  private state: GameState = createInitialState('');
  private pendingSource: QuizSource | null = null;

  /** Test seams. Not called in production paths. */
  debugState(): GameState {
    return this.state;
  }
  debugSetState(next: GameState): void {
    this.state = next;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a websocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? crypto.randomUUID();
    const code = url.searchParams.get('code') ?? '';
    if (this.state.lobbyCode === '') this.state = { ...this.state, lobbyCode: code };

    const isKnown = this.state.players.some((p) => p.id === playerId);
    const event: EngineEvent = isKnown
      ? { type: 'PLAYER_RECONNECT', playerId }
      : {
          type: 'PLAYER_JOIN',
          playerId,
          name: url.searchParams.get('name') ?? 'Player',
          avatarSeed: url.searchParams.get('seed') ?? 'default',
        };

    const outcome = this.apply(event);
    const wasRejected = outcome.broadcasts.some((m) => m.type === 'REJECTED');
    if (wasRejected) return new Response('Lobby is full', { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId } satisfies SocketMeta);

    // The join was broadcast to the sockets that existed at that moment, which
    // does not include this one — it didn't exist yet. Without this, a
    // joining or reconnecting client would see nothing until some unrelated
    // event happened to fire. Send the current state directly, using the same
    // STATE shape the engine broadcasts everywhere else.
    const stateMessage: ServerMessage = { type: 'STATE', state: toPublicState(this.state) };
    server.send(JSON.stringify(stateMessage));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;

    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (meta === null) return;

    const parsed = parseClientMessage(raw, meta.playerId);
    if (parsed === null) return;

    // The source is held aside; the reducer stays pure and never sees a payload.
    if (parsed.source !== null) this.pendingSource = parsed.source;

    const outcome = this.apply(parsed.event);
    await this.runEffect(outcome.effect);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (meta === null) return;
    const outcome = this.apply({ type: 'PLAYER_LEAVE', playerId: meta.playerId });
    await this.runEffect(outcome.effect);
  }

  async alarm(): Promise<void> {
    const outcome = this.apply({ type: 'TIMEOUT' });
    await this.runEffect(outcome.effect);
  }

  /** The single place the clock is read. Nothing under src/engine may do this. */
  private now(): number {
    return Date.now();
  }

  private apply(event: EngineEvent): EngineResult {
    const outcome = reduce(this.state, event, this.now());
    this.state = outcome.state;
    this.broadcast(outcome.broadcasts);
    if (outcome.alarmAtMs !== null) void this.ctx.storage.setAlarm(outcome.alarmAtMs);
    return outcome;
  }

  private broadcast(messages: readonly ServerMessage[]): void {
    if (messages.length === 0) return;
    const payloads = messages.map((m) => JSON.stringify(m));

    for (const socket of this.ctx.getWebSockets()) {
      for (const payload of payloads) {
        try {
          socket.send(payload);
        } catch {
          // A socket that died between getWebSockets() and send() is handled
          // by webSocketClose; dropping this frame is correct, not an error.
        }
      }
    }
  }

  private async runEffect(effect: EngineEffect | null): Promise<void> {
    if (effect === null) return;

    if (effect.type === 'CLEANUP') {
      await this.ctx.storage.deleteAlarm();
      return;
    }

    const source = this.pendingSource;
    if (source === null) {
      this.apply({ type: 'GENERATION_FAILED', reason: 'No study material was received.' });
      return;
    }

    const model = createGeminiModel(this.env.GEMINI_API_KEY);
    const outcome = await generateQuiz(model, source, effect.config);

    this.apply(
      outcome.ok
        ? { type: 'GENERATION_SUCCEEDED', questions: outcome.questions }
        : { type: 'GENERATION_FAILED', reason: outcome.reason },
    );
  }
}
