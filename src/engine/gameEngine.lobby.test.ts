import { describe, expect, test } from 'vitest';
import { createInitialState, reduce, sanitizeName, toPublicState } from './gameEngine.js';
import { MAX_NAME_CHARS } from '../shared/constants.js';
import type { EngineEvent, GameState } from '../shared/types.js';

function join(playerId: string, name = playerId): EngineEvent {
  return { type: 'PLAYER_JOIN', playerId, name, avatarSeed: 'seed' };
}

function joinAll(state: GameState, ids: string[], startMs = 0): GameState {
  return ids.reduce((s, id, i) => reduce(s, join(id), startMs + i).state, state);
}

describe('sanitizeName', () => {
  test('trims surrounding whitespace', () => {
    expect(sanitizeName('  Juan  ')).toBe('Juan');
  });

  test('caps the name at the display budget', () => {
    expect(sanitizeName('a'.repeat(50))).toHaveLength(16);
  });

  test('strips control characters that could break other players\' rendering', () => {
    expect(sanitizeName('Ju\x00an\x1b')).toBe('Juan');
  });

  test('falls back to a default when nothing usable remains', () => {
    expect(sanitizeName('   ')).toBe('Player');
  });

  test('trims trailing whitespace introduced by truncation', () => {
    expect(sanitizeName('Hello World1234 x')).toBe('Hello World1234');
  });
});

describe('PLAYER_JOIN', () => {
  test('seats the first player and makes them host', () => {
    const { state } = reduce(createInitialState('ABCD'), join('p1'), 0);

    expect(state.players).toHaveLength(1);
    expect(state.hostId).toBe('p1');
  });

  test('seats up to four players', () => {
    const state = joinAll(createInitialState('ABCD'), ['p1', 'p2', 'p3', 'p4']);
    expect(state.players).toHaveLength(4);
  });

  test('rejects a fifth player without disturbing the seated four', () => {
    const full = joinAll(createInitialState('ABCD'), ['p1', 'p2', 'p3', 'p4']);
    const result = reduce(full, join('p5'), 10);

    expect(result.state.players).toHaveLength(4);
    expect(result.broadcasts).toContainEqual({ type: 'REJECTED', reason: 'LOBBY_FULL' });
  });

  test('suffixes a duplicate display name instead of seating two identical players', () => {
    let state = reduce(createInitialState('ABCD'), join('p1', 'Juan'), 0).state;
    state = reduce(state, join('p2', 'Juan'), 1).state;

    expect(state.players.map((p) => p.name)).toEqual(['Juan', 'Juan (2)']);
  });

  test('caps a collision suffix within the display budget for a maximum-length name', () => {
    const maxLengthName = 'A'.repeat(MAX_NAME_CHARS);
    let state = reduce(createInitialState('ABCD'), join('p1', maxLengthName), 0).state;
    state = reduce(state, join('p2', maxLengthName), 1).state;

    const [first, second] = state.players.map((p) => p.name);
    expect(second).not.toBe(first);
    expect(second?.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
  });

  test('does not mutate the previous state object', () => {
    const before = createInitialState('ABCD');
    const snapshot = JSON.stringify(before);
    reduce(before, join('p1'), 0);

    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('starts every player at zero points', () => {
    const { state } = reduce(createInitialState('ABCD'), join('p1'), 0);
    expect(state.players[0]?.score).toBe(0);
  });

  test('keeps the live question deadline as the alarm instead of the idle timeout', () => {
    const lobby = joinAll(createInitialState('ABCD'), ['p1', 'p2']);
    const live: GameState = { ...lobby, phase: 'QUESTION', phaseEndsAtMs: 12_345 };

    const result = reduce(live, join('p3'), 0);

    expect(result.alarmAtMs).toBe(12_345);
  });
});

describe('PLAYER_LEAVE in LOBBY', () => {
  test('frees the seat entirely', () => {
    const state = joinAll(createInitialState('ABCD'), ['p1', 'p2']);
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 5);

    expect(result.state.players).toHaveLength(1);
  });

  test('promotes the longest-connected remaining player when the host leaves', () => {
    const state = joinAll(createInitialState('ABCD'), ['p1', 'p2', 'p3']);
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 5);

    expect(result.state.hostId).toBe('p2');
  });

  test('clears the host when the last player leaves and asks for cleanup', () => {
    const state = joinAll(createInitialState('ABCD'), ['p1']);
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 5);

    expect(result.state.hostId).toBeNull();
    expect(result.effect).toEqual({ type: 'CLEANUP' });
  });

  test('ignores a leave event for someone who was never seated', () => {
    const state = joinAll(createInitialState('ABCD'), ['p1']);
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'ghost' }, 5);

    expect(result.state.players).toHaveLength(1);
  });
});

describe('toPublicState', () => {
  test('never exposes the answer key while a question is live', () => {
    const state = joinAll(createInitialState('ABCD'), ['p1']);
    const publicState = toPublicState({ ...state, phase: 'QUESTION' });

    expect(publicState.reveal).toBeNull();
    expect(JSON.stringify(publicState)).not.toContain('correctIndex');
  });
});
