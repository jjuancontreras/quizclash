import { describe, expect, test } from 'vitest';
import { createInitialState, reduce } from './gameEngine.js';
import { COUNTDOWN_MS, GENERATION_TIMEOUT_MS } from '../shared/constants.js';
import type { EngineEvent, GameState, Question, SetupConfig } from '../shared/types.js';

const config: SetupConfig = { count: 5, difficulty: 'easy', focus: '', sourceKind: 'text' };

function lobbyWith(ids: string[]): GameState {
  return ids.reduce<GameState>(
    (s, id, i) =>
      reduce(
        s,
        { type: 'PLAYER_JOIN', playerId: id, name: id, avatarSeed: 's', reconnectToken: `${id}-token` },
        i,
      ).state,
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
    expect(result.replies).toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
  });

  test('rejects a non-host in the wrong phase with NOT_HOST, not BAD_PHASE', () => {
    // Both guards would fire here (wrong actor AND wrong phase, already GENERATING).
    // The host check must win so a guard-ordering regression is caught.
    const setup = reduce(lobbyWith(['p1', 'p2']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    const generating = reduce(setup, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;

    const result = reduce(generating, { type: 'OPEN_SETUP', playerId: 'p2' }, 300);

    expect(result.state.phase).toBe('GENERATING');
    expect(result.replies).toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
    expect(result.replies).not.toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'BAD_PHASE' },
    });
  });
});

describe('NOT_HOST replies are unicast', () => {
  test('a non-host\'s OPEN_SETUP rejection is a reply addressed only to them', () => {
    const state = lobbyWith(['p1', 'p2']);
    const result = reduce(state, { type: 'OPEN_SETUP', playerId: 'p2' }, 100);

    expect(result.broadcasts).toHaveLength(0);
    expect(result.replies).toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
  });
});

describe('SUBMIT_SETUP', () => {
  function inSetup(): GameState {
    return reduce(lobbyWith(['p1', 'p2']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
  }

  test('moves to GENERATING and asks the adapter to call the model', () => {
    const result = reduce(inSetup(), { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200);

    expect(result.state.phase).toBe('GENERATING');
    expect(result.effect).toEqual({ type: 'GENERATE', generationId: result.state.generationId, config });
  });

  test('arms a generation timeout so a hung model cannot strand the lobby', () => {
    const result = reduce(inSetup(), { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200);
    expect(result.alarmAtMs).toBe(200 + GENERATION_TIMEOUT_MS);
  });

  test('rejects a non-host submitting setup', () => {
    const result = reduce(inSetup(), { type: 'SUBMIT_SETUP', playerId: 'p2', config }, 200);

    expect(result.state.phase).toBe('SETUP');
    expect(result.replies).toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
  });

  test('rejects setup submitted from the wrong phase', () => {
    const result = reduce(lobbyWith(['p1']), { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200);
    expect(result.replies).toContainEqual({
      to: 'p1',
      message: { type: 'REJECTED', reason: 'BAD_PHASE' },
    });
  });

  test('rejects a non-host in the wrong phase with NOT_HOST, not BAD_PHASE', () => {
    // Both guards would fire here (wrong actor AND wrong phase, still LOBBY).
    // The host check must win so a guard-ordering regression is caught.
    const result = reduce(lobbyWith(['p1', 'p2']), { type: 'SUBMIT_SETUP', playerId: 'p2', config }, 200);

    expect(result.state.phase).toBe('LOBBY');
    expect(result.replies).toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
    expect(result.replies).not.toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'BAD_PHASE' },
    });
  });
});

describe('GENERATION_SUCCEEDED', () => {
  function generating(): GameState {
    const setup = reduce(lobbyWith(['p1']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    return reduce(setup, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;
  }

  test('stores the questions and starts the countdown', () => {
    const state = generating();
    const result = reduce(
      state,
      { type: 'GENERATION_SUCCEEDED', generationId: state.generationId, questions: questions(5) },
      300,
    );

    expect(result.state.phase).toBe('COUNTDOWN');
    expect(result.state.questions).toHaveLength(5);
  });

  test('schedules the first question exactly one countdown later', () => {
    const state = generating();
    const result = reduce(
      state,
      { type: 'GENERATION_SUCCEEDED', generationId: state.generationId, questions: questions(5) },
      300,
    );

    expect(result.state.phaseEndsAtMs).toBe(300 + COUNTDOWN_MS);
    expect(result.alarmAtMs).toBe(300 + COUNTDOWN_MS);
  });

  test('clears any error left over from a previous failed attempt', () => {
    const first = generating();
    const failed = reduce(
      first,
      { type: 'GENERATION_FAILED', generationId: first.generationId, reason: 'boom' },
      300,
    ).state;
    const retried = reduce(failed, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 400).state;
    const result = reduce(
      retried,
      { type: 'GENERATION_SUCCEEDED', generationId: retried.generationId, questions: questions(5) },
      500,
    );

    expect(result.state.error).toBeNull();
  });

  /**
   * The phase check alone cannot see this one: attempt A timed out, the host
   * retried, and the lobby is in GENERATING again — for attempt B. When A's
   * abandoned promise finally settles, only the attempt's own identity tells
   * the two apart. Accepting A here plays A's questions and lets A's
   * COUNTDOWN alarm overwrite B's timeout.
   */
  test('ignores a stale GENERATION_SUCCEEDED that lands while a retry is generating', () => {
    const first = generating();
    const timedOut = reduce(first, { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS).state;
    const retrying = reduce(
      timedOut,
      { type: 'SUBMIT_SETUP', playerId: 'p1', config },
      300 + GENERATION_TIMEOUT_MS,
    ).state;

    const result = reduce(
      retrying,
      { type: 'GENERATION_SUCCEEDED', generationId: first.generationId, questions: questions(5) },
      400 + GENERATION_TIMEOUT_MS,
    );

    expect(result.state).toEqual(retrying);
    expect(result.state.phase).toBe('GENERATING');
    expect(result.alarmAtMs).toBeNull();
  });

  test('accepts the result of the attempt that is actually in flight', () => {
    const first = generating();
    const timedOut = reduce(first, { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS).state;
    const retrying = reduce(
      timedOut,
      { type: 'SUBMIT_SETUP', playerId: 'p1', config },
      300 + GENERATION_TIMEOUT_MS,
    ).state;

    const result = reduce(
      retrying,
      { type: 'GENERATION_SUCCEEDED', generationId: retrying.generationId, questions: questions(5) },
      400 + GENERATION_TIMEOUT_MS,
    );

    expect(result.state.phase).toBe('COUNTDOWN');
    expect(retrying.generationId).not.toBe(first.generationId);
  });
});

describe('GENERATION_FAILED', () => {
  function generating(): GameState {
    const setup = reduce(lobbyWith(['p1']), { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    return reduce(setup, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;
  }

  test('returns the host to SETUP so they can retry, never stranding the lobby', () => {
    const state = generating();
    const result = reduce(
      state,
      { type: 'GENERATION_FAILED', generationId: state.generationId, reason: 'bad file' },
      300,
    );

    expect(result.state.phase).toBe('SETUP');
    expect(result.state.error).toBe('bad file');
  });

  test('ignores a stale GENERATION_FAILED that lands while a retry is generating', () => {
    const first = generating();
    const timedOut = reduce(first, { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS).state;
    const retrying = reduce(
      timedOut,
      { type: 'SUBMIT_SETUP', playerId: 'p1', config },
      300 + GENERATION_TIMEOUT_MS,
    ).state;

    const result = reduce(
      retrying,
      { type: 'GENERATION_FAILED', generationId: first.generationId, reason: 'attempt A gave up' },
      400 + GENERATION_TIMEOUT_MS,
    );

    expect(result.state).toEqual(retrying);
    expect(result.state.phase).toBe('GENERATING');
    expect(result.state.error).toBeNull();
  });

  test('a generation timeout fails the same way as a model error', () => {
    const result = reduce(generating(), { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS);
    expect(result.state.phase).toBe('SETUP');
    expect(result.state.error).not.toBeNull();
  });

  test('ignores a stale GENERATION_FAILED once the host has already recovered from a timeout', () => {
    // Attempt A times out and the host is back in SETUP. A late rejection
    // from attempt A must not clobber whatever the lobby is doing now.
    const timedOut = reduce(generating(), { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS).state;

    const result = reduce(
      timedOut,
      {
        type: 'GENERATION_FAILED',
        generationId: timedOut.generationId,
        reason: 'a different, later-arriving failure',
      },
      500,
    );

    expect(result.state).toEqual(timedOut);
  });

  test('ignores a stale GENERATION_FAILED once the lobby has moved on to COUNTDOWN', () => {
    // Attempt A's rejection arrives after attempt B already succeeded and
    // started the countdown. It must not overwrite the stored error or
    // clear phaseEndsAtMs, which is non-null here (unlike the SETUP case).
    const state = generating();
    const succeeded = reduce(
      state,
      { type: 'GENERATION_SUCCEEDED', generationId: state.generationId, questions: questions(5) },
      300,
    ).state;

    const result = reduce(
      succeeded,
      {
        type: 'GENERATION_FAILED',
        generationId: succeeded.generationId,
        reason: 'stale failure from an abandoned attempt',
      },
      400,
    );

    expect(result.state).toEqual(succeeded);
    expect(result.state.phase).toBe('COUNTDOWN');
    expect(result.state.error).toBeNull();
    expect(result.state.phaseEndsAtMs).toBe(succeeded.phaseEndsAtMs);
  });
});
