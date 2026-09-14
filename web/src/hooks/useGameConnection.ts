import { useCallback, useEffect, useRef, useState } from 'react';
import { RealtimeClient, type ClientEvent, type ClientMessage } from '../lib/realtimeClient.js';
import { loadSession, saveSession } from '../lib/session.js';
import type { PublicState } from '../../../src/shared/types.js';

const WS_HOST = import.meta.env.VITE_WS_HOST as string;

export interface JoinParams {
  readonly code: string;
  readonly name: string;
  readonly avatarSeed: string;
}

export interface UseGameConnection {
  readonly state: PublicState | null;
  readonly connectionStatus: 'connecting' | 'connected' | 'disconnected';
  readonly rejection: string | null;
  readonly join: (params: JoinParams) => void;
  readonly send: (message: ClientMessage) => void;
}

/**
 * Owns the single RealtimeClient instance for the lifetime of the component
 * tree that mounts this hook. Handles two entry paths into a live
 * connection:
 *  - a stored session found on mount (a player refreshing mid-game) is
 *    reconnected automatically, using its persisted reconnect token;
 *  - a brand-new player connects only when `join()` is called explicitly
 *    (IdentityScreen, Task 8), with an empty token.
 *
 * `lobbyCodeRef` (not state) tracks the in-flight lobby code so the single,
 * mount-time event listener always reads the *current* value when an
 * `identity` event arrives — a `useState`/`useCallback`-dependency version
 * of this would close over a stale `null` the first time `join()` and the
 * resulting `identity` event land inside the same `act()` batch, since the
 * listener registered with RealtimeClient.on() is never re-subscribed.
 */
export function useGameConnection(): UseGameConnection {
  const clientRef = useRef<RealtimeClient | null>(null);
  if (clientRef.current === null) {
    clientRef.current = new RealtimeClient();
  }
  const lobbyCodeRef = useRef<string | null>(null);

  const [state, setState] = useState<PublicState | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>(
    'disconnected',
  );
  const [rejection, setRejection] = useState<string | null>(null);

  const handleEvent = useCallback((event: ClientEvent) => {
    switch (event.type) {
      case 'connected':
        setConnectionStatus('connected');
        return;
      case 'disconnected':
        setConnectionStatus('disconnected');
        return;
      case 'state':
        setState(event.state);
        setRejection(null);
        return;
      case 'identity':
        if (lobbyCodeRef.current !== null) {
          saveSession({
            lobbyCode: lobbyCodeRef.current,
            playerId: event.playerId,
            reconnectToken: event.reconnectToken,
          });
        }
        return;
      case 'rejected':
        setRejection(event.reason);
        return;
      case 'error':
        setRejection(event.message);
        return;
    }
  }, []);

  useEffect(() => {
    const client = clientRef.current;
    if (client === null) return;
    const unsubscribe = client.on(handleEvent);
    return unsubscribe;
  }, [handleEvent]);

  useEffect(() => {
    const existing = loadSession();
    if (existing === null) return;

    lobbyCodeRef.current = existing.lobbyCode;
    setConnectionStatus('connecting');
    clientRef.current?.connect({
      host: WS_HOST,
      code: existing.lobbyCode,
      playerId: existing.playerId,
      token: existing.reconnectToken,
      name: '',
      avatarSeed: '',
    });
    // Mount-only: a fresh join() call is a distinct, explicit user action
    // and must not be triggered by this effect re-running.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const join = useCallback((params: JoinParams) => {
    lobbyCodeRef.current = params.code;
    setConnectionStatus('connecting');
    clientRef.current?.connect({
      host: WS_HOST,
      code: params.code,
      playerId: crypto.randomUUID(),
      token: '',
      name: params.name,
      avatarSeed: params.avatarSeed,
    });
  }, []);

  const send = useCallback((message: ClientMessage) => {
    clientRef.current?.send(message);
  }, []);

  return { state, connectionStatus, rejection, join, send };
}
