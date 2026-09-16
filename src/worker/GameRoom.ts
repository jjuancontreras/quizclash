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

/**
 * Player-facing text for an alarm write that failed. The alarm is the game
 * clock — every phase past COUNTDOWN advances only when it fires — so a
 * rejected `setAlarm` must never disappear as a silent, unhandled rejection.
 */
const ALARM_SCHEDULING_FAILURE_MESSAGE =
  'Lost the game clock. Refresh the page to reconnect.';

/**
 * Maps a REJECTED reply to the HTTP response `fetch` sends before ever
 * accepting a socket. `LOBBY_FULL` keeps its established 409; a bad reconnect
 * token is a distinct failure mode and gets 401, never 409.
 */
function rejectionResponse(reason: 'LOBBY_FULL' | 'NOT_HOST' | 'BAD_PHASE' | 'BAD_TOKEN' | undefined): Response | null {
  if (reason === 'LOBBY_FULL') return new Response('Lobby is full', { status: 409 });
  if (reason === 'BAD_TOKEN') return new Response('Invalid reconnect token', { status: 401 });
  return null;
}

const STATE_STORAGE_KEY = 'state';

export class GameRoom extends DurableObject<Env> {
  private state: GameState = createInitialState('');
  private pendingSource: QuizSource | null = null;

  /**
   * `acceptWebSocket` puts this object under Cloudflare's WebSocket
   * Hibernation API: the runtime is free to evict it from memory between
   * events (routine, cost-saving behavior, not a rare edge case) while
   * keeping player connections looking alive at the edge. A plain class
   * field does not survive that — without this rehydration, every wake
   * silently resets to an empty lobby, and everyone already "in" the room
   * vanishes from the server's tracking despite their own socket appearing
   * fine to them. `blockConcurrencyWhile` guarantees no request reaches this
   * instance until the read completes, so nothing racing the constructor can
   * observe the momentary default state.
   */
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.blockConcurrencyWhile(async () => {
      const storedState = await this.ctx.storage.get<GameState>(STATE_STORAGE_KEY);
      if (storedState !== undefined) this.state = storedState;
    });
  }

  /**
   * Read-only test seam. Not called in production paths, and deliberately not
   * paired with a setter: a whole-state overwrite is reachable over RPC by
   * anyone holding a typed stub to this object.
   *
   * The reconnectToken is server-secret and never exposed via this method,
   * even though it returns GameState rather than PublicState. Tests may read
   * other fields like phase, hostId, and player ids freely.
   */
  debugState(): GameState {
    return {
      ...this.state,
      players: this.state.players.map(({ reconnectToken, ...rest }) => ({ ...rest, reconnectToken: '' })),
    };
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a websocket upgrade', { status: 426 });
    }

    const url = new URL(request.url);
    const playerId = url.searchParams.get('playerId') ?? crypto.randomUUID();
    const token = url.searchParams.get('token') ?? '';
    const code = url.searchParams.get('code') ?? '';
    if (this.state.lobbyCode === '') this.state = { ...this.state, lobbyCode: code };

    // A fresh join is issued a brand-new secret here; the URL's `token` (if
    // any) is irrelevant to it. A reconnect never mints a new secret — it
    // must present the one the join already handed out, so it is passed
    // through unmodified for the engine to check.
    const isKnown = this.state.players.some((p) => p.id === playerId);
    const reconnectToken = isKnown ? token : crypto.randomUUID();
    const event: EngineEvent = isKnown
      ? { type: 'PLAYER_RECONNECT', playerId, reconnectToken }
      : {
          type: 'PLAYER_JOIN',
          playerId,
          name: url.searchParams.get('name') ?? 'Player',
          avatarSeed: url.searchParams.get('seed') ?? 'default',
          reconnectToken,
        };

    // Checked, and turned into a response, before the socket is ever
    // created — a failed reconnect attempt must not seat an attacker's
    // connection at all.
    const outcome = await this.apply(event);
    const rejection = outcome.replies.find((r) => r.message.type === 'REJECTED');
    const reason = rejection?.message.type === 'REJECTED' ? rejection.message.reason : undefined;
    const rejectedResponse = rejectionResponse(reason);
    if (rejectedResponse !== null) return rejectedResponse;

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ playerId } satisfies SocketMeta);

    // The token is this socket's proof of identity for every future
    // reconnect. It is sent once, directly on this socket, and never
    // broadcast — a reconnecting client already holds it and must not be
    // sent it again.
    if (!isKnown) {
      const identityMessage: ServerMessage = { type: 'IDENTITY', playerId, reconnectToken };
      server.send(JSON.stringify(identityMessage));
    }

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

    // The source is held aside; the reducer stays pure and never sees a
    // payload. Not persisted to storage: webSocketMessage awaits straight
    // through apply() and runEffect() as one chain, so there is no gap
    // between setting this and the GENERATE effect consuming it where a
    // hibernation wake could land — and a request that dies mid-flight
    // for some other reason is already recoverable by the client simply
    // resubmitting, same as any other failed SUBMIT_SETUP.
    if (parsed.source !== null) this.pendingSource = parsed.source;

    const outcome = await this.apply(parsed.event);
    await this.runEffect(outcome.effect);
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    await this.releaseSocket(ws);
  }

  /**
   * The hibernation API delivers an abnormally-terminated socket here rather
   * than to webSocketClose. Without this, that seat never produces a
   * PLAYER_LEAVE: it stays `connected: true` forever, so every later question
   * waits out its full window for a player who is gone, the all-disconnected
   * cleanup can never fire, and the seat blocks a rejoin.
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('GameRoom: websocket terminated abnormally', error);
    await this.releaseSocket(ws);
  }

  private async releaseSocket(ws: WebSocket): Promise<void> {
    const meta = ws.deserializeAttachment() as SocketMeta | null;
    if (meta === null) return;
    const outcome = await this.apply({ type: 'PLAYER_LEAVE', playerId: meta.playerId });
    await this.runEffect(outcome.effect);
  }

  async alarm(): Promise<void> {
    const outcome = await this.apply({ type: 'TIMEOUT' });
    await this.runEffect(outcome.effect);
  }

  /** The single place the clock is read. Nothing under src/engine may do this. */
  private now(): number {
    return Date.now();
  }

  private async apply(event: EngineEvent): Promise<EngineResult> {
    const outcome = reduce(this.state, event, this.now());
    this.state = outcome.state;
    await this.ctx.storage.put(STATE_STORAGE_KEY, this.state);
    this.broadcast(outcome.broadcasts);
    this.deliverReplies(outcome.replies);
    if (outcome.alarmAtMs !== null) {
      // Not awaited — `apply` stays synchronous so `fetch` can still return
      // its 101 upgrade response promptly. The rejection is still handled:
      // a failed write is reported to every connected socket rather than
      // becoming an unhandled rejection nobody ever learns about.
      this.ctx.storage.setAlarm(outcome.alarmAtMs).catch((error: unknown) => {
        console.error('GameRoom: failed to schedule the alarm', error);
        this.broadcast([{ type: 'ERROR', message: ALARM_SCHEDULING_FAILURE_MESSAGE }]);
      });
    }
    return outcome;
  }

  private deliverReplies(replies: EngineResult['replies']): void {
    if (replies.length === 0) return;

    for (const socket of this.ctx.getWebSockets()) {
      const meta = socket.deserializeAttachment() as SocketMeta | null;
      if (meta === null) continue;

      for (const reply of replies) {
        if (reply.to !== meta.playerId) continue;
        try {
          socket.send(JSON.stringify(reply.message));
        } catch {
          // Same reasoning as `broadcast`: a socket that died between
          // getWebSockets() and send() is handled by webSocketClose.
        }
      }
    }
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

    // Both are captured before the first `await`: by the time the model
    // answers, the host may have timed out and retried, leaving a different
    // attempt in flight. The engine rejects this result if so.
    const source = this.pendingSource;
    const { generationId } = effect;

    // Consumed either way, once: a stale upload must not be replayed against
    // a later retry's own SUBMIT_SETUP.
    this.pendingSource = null;

    if (source === null) {
      await this.apply({
        type: 'GENERATION_FAILED',
        generationId,
        reason: 'No study material was received.',
      });
      return;
    }

    const model = createGeminiModel(this.env.GEMINI_API_KEY);
    const outcome = await generateQuiz(model, source, effect.config);

    await this.apply(
      outcome.ok
        ? { type: 'GENERATION_SUCCEEDED', generationId, questions: outcome.questions }
        : { type: 'GENERATION_FAILED', generationId, reason: outcome.reason },
    );
  }
}
