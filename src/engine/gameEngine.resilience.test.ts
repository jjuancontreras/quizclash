import { describe, expect, test } from 'vitest';
import { createInitialState, reduce } from './gameEngine.js';
import { GENERATION_TIMEOUT_MS, QUESTION_WINDOW_MS, REVEAL_MS } from '../shared/constants.js';
import type { GameState, Question, SetupConfig } from '../shared/types.js';

const config: SetupConfig = { count: 5, difficulty: 'easy', focus: '', sourceKind: 'text' };

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    question: `Q${i}?`,
    choices: ['right', 'w1', 'w2', 'w3'],
    correctIndex: 0,
    explanation: 'because',
    sourceQuote: 'quote',
  }));
}

function atFirstQuestion(playerIds: string[], count = 3): GameState {
  let state = playerIds.reduce<GameState>(
    (s, id, i) =>
      reduce(s, { type: 'PLAYER_JOIN', playerId: id, name: id, avatarSeed: 's' }, i).state,
    createInitialState('ABCD'),
  );
  state = reduce(state, { type: 'OPEN_SETUP', playerId: playerIds[0]! }, 100).state;
  state = reduce(state, { type: 'SUBMIT_SETUP', playerId: playerIds[0]!, config }, 200).state;
  state = reduce(state, { type: 'GENERATION_SUCCEEDED', questions: questions(count) }, 300).state;
  return reduce(state, { type: 'TIMEOUT' }, 1000).state;
}

describe('PLAYER_LEAVE mid-game', () => {
  test('keeps the seat and the score instead of removing the player', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1000).state;
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1500);

    expect(result.state.players).toHaveLength(2);
    expect(result.state.players.find((p) => p.id === 'p1')?.score).toBe(1000);
  });

  test('marks the player disconnected so the UI can grey them out', () => {
    const result = reduce(atFirstQuestion(['p1', 'p2']), { type: 'PLAYER_LEAVE', playerId: 'p2' }, 1500);
    expect(result.state.players.find((p) => p.id === 'p2')?.connected).toBe(false);
  });

  test('does not hold the round hostage — remaining players finish the question', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 1100).state;
    const result = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1200);

    expect(result.state.phase).toBe('REVEAL');
  });

  test('continues the game when the host drops mid-game', () => {
    const result = reduce(atFirstQuestion(['p1', 'p2']), { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1500);

    expect(result.state.phase).toBe('QUESTION');
    expect(result.state.hostId).toBe('p1');
  });

  test('asks for cleanup only when every player has disconnected', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1100).state;
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 1200);

    expect(result.effect).toEqual({ type: 'CLEANUP' });
  });
});

describe('PLAYER_LEAVE before a round is running', () => {
  test('frees the seat and promotes a new host when the host drops during SETUP', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's' }, 1).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;

    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 200);

    expect(result.state.players).toHaveLength(1);
    expect(result.state.hostId).toBe('p2');
  });

  test('frees the seat and promotes a new host when the host drops during GENERATING, and generation still completes into COUNTDOWN', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's' }, 1).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    state = reduce(state, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;

    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 300).state;
    expect(state.players).toHaveLength(1);
    expect(state.hostId).toBe('p2');
    expect(state.phase).toBe('GENERATING');

    const result = reduce(state, { type: 'GENERATION_SUCCEEDED', questions: questions(3) }, 400);
    expect(result.state.phase).toBe('COUNTDOWN');
  });

  test('a promoted host can recover the lobby after a stranded generation times out', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's' }, 1).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    state = reduce(state, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 300).state;

    state = reduce(state, { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS).state;
    expect(state.phase).toBe('SETUP');
    expect(state.hostId).toBe('p2');

    const result = reduce(state, { type: 'OPEN_SETUP', playerId: 'p2' }, 200 + GENERATION_TIMEOUT_MS + 1);
    expect(result.broadcasts).not.toContainEqual({ type: 'REJECTED', reason: 'NOT_HOST' });
  });
});

describe('PLAYER_RECONNECT', () => {
  test('restores the player to their existing seat with their score intact', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1000).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1100).state;
    const result = reduce(state, { type: 'PLAYER_RECONNECT', playerId: 'p1' }, 1200);

    expect(result.state.players.find((p) => p.id === 'p1')?.connected).toBe(true);
    expect(result.state.players.find((p) => p.id === 'p1')?.score).toBe(1000);
  });

  test('broadcasts a full state snapshot so the client lands in the live phase', () => {
    const state = atFirstQuestion(['p1', 'p2']);
    const result = reduce(state, { type: 'PLAYER_RECONNECT', playerId: 'p1' }, 1200);
    const message = result.broadcasts[0];

    expect(message?.type).toBe('STATE');
    if (message?.type === 'STATE') expect(message.state.phase).toBe('QUESTION');
  });

  test('ignores a reconnect for an unknown player', () => {
    const state = atFirstQuestion(['p1']);
    const result = reduce(state, { type: 'PLAYER_RECONNECT', playerId: 'ghost' }, 1200);

    expect(result.state.players).toHaveLength(1);
  });

  test('does not resurrect a player who left during the lobby', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's' }, 1).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 2).state;
    const result = reduce(state, { type: 'PLAYER_RECONNECT', playerId: 'p2' }, 3);

    expect(result.state.players).toHaveLength(1);
  });
});

describe('PLAY_AGAIN', () => {
  function atPodium(): GameState {
    let state = atFirstQuestion(['p1', 'p2'], 1);
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1000).state;
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p2', choiceIndex: 1 }, 1100).state;
    return reduce(state, { type: 'TIMEOUT' }, 1100 + REVEAL_MS).state;
  }

  test('returns to the lobby with the same players seated', () => {
    const result = reduce(atPodium(), { type: 'PLAY_AGAIN', playerId: 'p1' }, 9000);

    expect(result.state.phase).toBe('LOBBY');
    expect(result.state.players).toHaveLength(2);
  });

  test('resets every score to zero', () => {
    const result = reduce(atPodium(), { type: 'PLAY_AGAIN', playerId: 'p1' }, 9000);
    expect(result.state.players.every((p) => p.score === 0)).toBe(true);
  });

  test('discards the previous questions so a known answer key cannot be replayed', () => {
    const result = reduce(atPodium(), { type: 'PLAY_AGAIN', playerId: 'p1' }, 9000);

    expect(result.state.questions).toEqual([]);
    expect(result.state.questionIndex).toBe(0);
  });

  test('rejects a non-host trying to restart', () => {
    const result = reduce(atPodium(), { type: 'PLAY_AGAIN', playerId: 'p2' }, 9000);

    expect(result.state.phase).toBe('PODIUM');
    expect(result.broadcasts).toContainEqual({ type: 'REJECTED', reason: 'NOT_HOST' });
  });
});
