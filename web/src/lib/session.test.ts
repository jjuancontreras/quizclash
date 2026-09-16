import { describe, expect, test, beforeEach } from 'vitest';
import { saveSession, loadSession, clearSession } from './session.js';

describe('session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('round-trips a saved session', () => {
    saveSession({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token', name: 'Juan', avatarSeed: 'seed-1' });
    expect(loadSession()).toEqual({
      lobbyCode: 'ABCD',
      playerId: 'p1',
      reconnectToken: 'secret-token',
      name: 'Juan',
      avatarSeed: 'seed-1',
    });
  });

  test('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull();
  });

  test('returns null for malformed stored JSON rather than throwing', () => {
    sessionStorage.setItem('quizclash-session', 'not json');
    expect(loadSession()).toBeNull();
  });

  test('returns null for a stored session missing name/avatarSeed (pre-Finding-4 shape)', () => {
    sessionStorage.setItem(
      'quizclash-session',
      JSON.stringify({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token' }),
    );
    expect(loadSession()).toBeNull();
  });

  test('clearSession removes the stored session', () => {
    saveSession({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token', name: 'Juan', avatarSeed: 'seed-1' });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
