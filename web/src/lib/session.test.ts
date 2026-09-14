import { describe, expect, test, beforeEach } from 'vitest';
import { saveSession, loadSession, clearSession } from './session.js';

describe('session storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test('round-trips a saved session', () => {
    saveSession({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token' });
    expect(loadSession()).toEqual({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token' });
  });

  test('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull();
  });

  test('returns null for malformed stored JSON rather than throwing', () => {
    sessionStorage.setItem('quizclash-session', 'not json');
    expect(loadSession()).toBeNull();
  });

  test('clearSession removes the stored session', () => {
    saveSession({ lobbyCode: 'ABCD', playerId: 'p1', reconnectToken: 'secret-token' });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
