import { describe, expect, test, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGameConnection } from './useGameConnection.js';
import { RealtimeClient } from '../lib/realtimeClient.js';
import { saveSession } from '../lib/session.js';
import type { PublicState } from '../../../src/shared/types.js';

// Partial fakes are all these tests need to exercise the hook's plumbing;
// the cast keeps that terse while satisfying PublicState's full shape.
function fakePublicState(partial: Partial<PublicState>): PublicState {
  return partial as unknown as PublicState;
}

vi.mock('../lib/realtimeClient.js');

describe('useGameConnection', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  test('starts in a connecting-or-idle state with no PublicState yet', () => {
    const { result } = renderHook(() => useGameConnection());
    expect(result.current.state).toBeNull();
  });

  test('join() calls RealtimeClient.connect with the supplied params and an empty token', () => {
    const { result } = renderHook(() => useGameConnection());

    act(() => {
      result.current.join({ code: 'ABCD', name: 'Juan', avatarSeed: 'seed-1' });
    });

    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    expect(instance.connect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ABCD', name: 'Juan', avatarSeed: 'seed-1', token: '' }),
    );
  });

  test('an incoming identity event is persisted to session storage', () => {
    const { result } = renderHook(() => useGameConnection());
    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    const onHandler = vi.mocked(instance.on).mock.calls[0]![0];

    act(() => {
      result.current.join({ code: 'ABCD', name: 'Juan', avatarSeed: 'seed-1' });
      onHandler({ type: 'identity', playerId: 'p1', reconnectToken: 'minted-secret' });
    });

    expect(sessionStorage.getItem('quizclash-session')).toContain('minted-secret');
  });

  test('an incoming state event updates the returned state', () => {
    const { result } = renderHook(() => useGameConnection());
    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    const onHandler = vi.mocked(instance.on).mock.calls[0]![0];
    const fakeState = fakePublicState({ phase: 'LOBBY' });

    act(() => {
      onHandler({ type: 'state', state: fakeState });
    });

    expect(result.current.state).toEqual(fakeState);
  });

  test('a rejected event surfaces its reason and clears on the next successful state update', () => {
    const { result } = renderHook(() => useGameConnection());
    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    const onHandler = vi.mocked(instance.on).mock.calls[0]![0];

    act(() => {
      onHandler({ type: 'rejected', reason: 'NOT_HOST' });
    });
    expect(result.current.rejection).toBe('NOT_HOST');

    act(() => {
      onHandler({ type: 'state', state: fakePublicState({ phase: 'LOBBY' }) });
    });
    expect(result.current.rejection).toBeNull();
  });

  test('mounting with an existing stored session auto-connects using it, including its token', () => {
    saveSession({
      lobbyCode: 'WXYZ',
      playerId: 'p1',
      reconnectToken: 'stored-secret',
      name: 'Juan',
      avatarSeed: 'seed-9',
    });

    renderHook(() => useGameConnection());

    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    expect(instance.connect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WXYZ', playerId: 'p1', token: 'stored-secret' }),
    );
  });

  // Finding 4 (Plan B review): a reconnect used to pass empty name/avatarSeed,
  // which the server treats as a fresh join when the seat was pruned,
  // silently resetting the player's identity to defaults.
  test('mounting with an existing stored session reconnects using its persisted name and avatarSeed, not empty strings', () => {
    saveSession({
      lobbyCode: 'WXYZ',
      playerId: 'p1',
      reconnectToken: 'stored-secret',
      name: 'Juan',
      avatarSeed: 'seed-9',
    });

    renderHook(() => useGameConnection());

    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    expect(instance.connect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Juan', avatarSeed: 'seed-9' }),
    );
  });

  test('an identity event received after a fresh join persists the join name and avatarSeed', () => {
    const { result } = renderHook(() => useGameConnection());
    const instance = vi.mocked(RealtimeClient).mock.instances[0]!;
    const onHandler = vi.mocked(instance.on).mock.calls[0]![0];

    act(() => {
      result.current.join({ code: 'ABCD', name: 'Juan', avatarSeed: 'seed-1' });
      onHandler({ type: 'identity', playerId: 'p1', reconnectToken: 'minted-secret' });
    });

    const stored = JSON.parse(sessionStorage.getItem('quizclash-session')!);
    expect(stored).toEqual(
      expect.objectContaining({ name: 'Juan', avatarSeed: 'seed-1', reconnectToken: 'minted-secret' }),
    );
  });
});
