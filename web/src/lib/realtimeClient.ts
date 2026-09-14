import type { ChoiceIndex, PublicState, SetupConfig } from '../../../src/shared/types.js';

export interface ConnectParams {
  readonly host: string;
  readonly code: string;
  readonly playerId: string;
  readonly token: string;
  readonly name: string;
  readonly avatarSeed: string;
}

/**
 * Messages this client can send. Shapes and names are fixed by the already-
 * shipped `src/worker/messages.ts` — do not add a field that file does not
 * parse, and do not rename one it does.
 */
export type ClientMessage =
  | { readonly type: 'OPEN_SETUP' }
  | { readonly type: 'PLAY_AGAIN' }
  | { readonly type: 'SUBMIT_ANSWER'; readonly choiceIndex: ChoiceIndex }
  | {
      readonly type: 'SUBMIT_SETUP';
      readonly config: SetupConfig;
      readonly source: { readonly kind: 'pdf'; readonly base64: string } | { readonly kind: 'text'; readonly text: string };
    };

export type ClientEvent =
  | { readonly type: 'connected' }
  | { readonly type: 'disconnected' }
  | { readonly type: 'state'; readonly state: PublicState }
  | { readonly type: 'identity'; readonly playerId: string; readonly reconnectToken: string }
  | { readonly type: 'rejected'; readonly reason: string }
  | { readonly type: 'error'; readonly message: string };

type Listener = (event: ClientEvent) => void;

/**
 * Owns the one WebSocket connection to a lobby's Durable Object. Translates
 * raw frames into typed events and back; React components never see a raw
 * WebSocket (spec §5, module 6).
 */
export class RealtimeClient {
  private socket: WebSocket | null = null;
  private listeners: Set<Listener> = new Set();

  connect(params: ConnectParams): void {
    const url = new URL(`wss://${params.host}/ws`);
    url.searchParams.set('code', params.code);
    url.searchParams.set('playerId', params.playerId);
    url.searchParams.set('token', params.token);
    url.searchParams.set('name', params.name);
    url.searchParams.set('seed', params.avatarSeed);

    // ws:// for local dev against a plain `wrangler dev` server; wss:// once
    // deployed. The host itself (with or without TLS) is supplied by the
    // caller via VITE_WS_HOST — this class does not decide that.
    const protocol = params.host.startsWith('localhost') ? 'ws' : 'wss';
    url.protocol = protocol;

    const socket = new WebSocket(url.toString());
    this.socket = socket;

    socket.onopen = () => this.emit({ type: 'connected' });
    socket.onclose = () => this.emit({ type: 'disconnected' });
    socket.onerror = () => this.emit({ type: 'disconnected' });
    socket.onmessage = (event: { data: string }) => this.handleMessage(event.data);
  }

  send(message: ClientMessage): void {
    this.socket?.send(JSON.stringify(message));
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  private handleMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return;

    const message = parsed as Record<string, unknown>;
    switch (message.type) {
      case 'STATE':
        this.emit({ type: 'state', state: message.state as PublicState });
        return;
      case 'IDENTITY':
        this.emit({
          type: 'identity',
          playerId: message.playerId as string,
          reconnectToken: message.reconnectToken as string,
        });
        return;
      case 'REJECTED':
        this.emit({ type: 'rejected', reason: message.reason as string });
        return;
      case 'ERROR':
        this.emit({ type: 'error', message: message.message as string });
        return;
      default:
        return;
    }
  }

  private emit(event: ClientEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
