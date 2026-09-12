import { describe, expect, test } from 'vitest';
import { createInitialState, reduce } from './gameEngine.js';
import { COUNTDOWN_MS, GENERATION_TIMEOUT_MS } from '../shared/constants.js';
import type { EngineEvent, GameState, Question, SetupConfig } from '../shared/types.js';

const config: SetupConfig = { count: 5, difficulty: 'easy', focus: '', sourceKind: 'text' };

function lobbyWith(ids: string[]): GameState {
  return ids.reduce<GameState>(
    (s, id, i) =>
      reduce(s, { type: 'PLAYER_JOIN', playerId: id, name: id, avatarSeed: 's' }, i).state,
    createInitialState('ABCD'),
  );
}

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    question: `Q${i}?`,
    choices: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'because',
    sourceQuote: 'quote',
  }));
}

describe('OPEN_SETUP', () => {
  test('moves the lobby into SETUP when the host asks', () => {
    const result = reduce(lobbyWith(['p1', 'p2']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100);
    expect(result.state.phase).toBe('SETUP');
  });

  test('rejects a non-host trying to open setup', () => {
    const result = reduce(lobbyWith(['p1', 'p2']), { type: 'OPEN_SETUP', playerId: 'p2' }, 100);

    expect(result.state.phase).toBe('LOBBY');
    expect(result.broadcasts).toContainEqual({ type: 'REJECTED', reason: 'NOT_HOST' });
  });
});

describe('SUBMIT_SETUP', () => {
  function inSetup(): GameState {
    return reduce(lobbyWith(['p1', 'p2']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
  }

  test('moves to GENERATING and asks the adapter to call the model', () => {
    const result = reduce(inSetup(), { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200);

    expect(result.state.phase).toBe('GENERATING');
    expect(result.effect).toEqual({ type: 'GENERATE', config });
  });

  test('arms a generation timeout so a hung model cannot strand the lobby', () => {
    const result = reduce(inSetup(), { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200);
    expect(result.alarmAtMs).toBe(200 + GENERATION_TIMEOUT_MS);
  });

  test('rejects a non-host submitting setup', () => {
    const result = reduce(inSetup(), { type: 'SUBMIT_SETUP', playerId: 'p2', config }, 200);

    expect(result.state.phase).toBe('SETUP');
    expect(result.broadcasts).toContainEqual({ type: 'REJECTED', reason: 'NOT_HOST' });
  });

  test('rejects setup submitted from the wrong phase', () => {
    const result = reduce(lobbyWith(['p1']), { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200);
    expect(result.broadcasts).toContainEqual({ type: 'REJECTED', reason: 'BAD_PHASE' });
  });
});

describe('GENERATION_SUCCEEDED', () => {
  function generating(): GameState {
    const setup = reduce(lobbyWith(['p1']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    return reduce(setup, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;
  }

  test('stores the questions and starts the countdown', () => {
    const result = reduce(generating(), { type: 'GENERATION_SUCCEEDED', questions: questions(5) }, 300);

    expect(result.state.phase).toBe('COUNTDOWN');
    expect(result.state.questions).toHaveLength(5);
  });

  test('schedules the first question exactly one countdown later', () => {
    const result = reduce(generating(), { type: 'GENERATION_SUCCEEDED', questions: questions(5) }, 300);

    expect(result.state.phaseEndsAtMs).toBe(300 + COUNTDOWN_MS);
    expect(result.alarmAtMs).toBe(300 + COUNTDOWN_MS);
  });

  test('clears any error left over from a previous failed attempt', () => {
    const failed = reduce(generating(), { type: 'GENERATION_FAILED', reason: 'boom' }, 300).state;
    const retried = reduce(failed, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 400).state;
    const result = reduce(retried, { type: 'GENERATION_SUCCEEDED', questions: questions(5) }, 500);

    expect(result.state.error).toBeNull();
  });
});

describe('GENERATION_FAILED', () => {
  function generating(): GameState {
    const setup = reduce(lobbyWith(['p1']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    return reduce(setup, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;
  }

  test('returns the host to SETUP so they can retry, never stranding the lobby', () => {
    const result = reduce(generating(), { type: 'GENERATION_FAILED', reason: 'bad file' }, 300);

    expect(result.state.phase).toBe('SETUP');
    expect(result.state.error).toBe('bad file');
  });

  test('a generation timeout fails the same way as a model error', () => {
    const result = reduce(generating(), { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS);
    expect(result.state.phase).toBe('SETUP');
    expect(result.state.error).not.toBeNull();
  });
});
