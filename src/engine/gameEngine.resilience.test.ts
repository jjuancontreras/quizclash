import { describe, expect, test } from 'vitest';
import { createInitialState, reduce } from './gameEngine.js';
import {
  GENERATION_TIMEOUT_MS,
  IDLE_CLEANUP_MS,
  QUESTION_WINDOW_MS,
  REVEAL_MS,
} from '../shared/constants.js';
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

/** Every test player reconnects with this same deterministic token. */
function tokenFor(playerId: string): string {
  return `${playerId}-token`;
}

function lobbyOf(playerIds: string[]): GameState {
  return playerIds.reduce<GameState>(
    (s, id, i) =>
      reduce(
        s,
        { type: 'PLAYER_JOIN', playerId: id, name: id, avatarSeed: 's', reconnectToken: tokenFor(id) },
        i,
      ).state,
    createInitialState('ABCD'),
  );
}

function atFirstQuestion(playerIds: string[], count = 3): GameState {
  let state = playerIds.reduce<GameState>(
    (s, id, i) =>
      reduce(
        s,
        { type: 'PLAYER_JOIN', playerId: id, name: id, avatarSeed: 's', reconnectToken: tokenFor(id) },
        i,
      ).state,
    createInitialState('ABCD'),
  );
  state = reduce(state, { type: 'OPEN_SETUP', playerId: playerIds[0]! }, 100).state;
  state = reduce(state, { type: 'SUBMIT_SETUP', playerId: playerIds[0]!, config }, 200).state;
  state = reduce(state, { type: 'GENERATION_SUCCEEDED', generationId: state.generationId, questions: questions(count) }, 300).state;
  return reduce(state, { type: 'TIMEOUT' }, 1000).state;
}

/**
 * A full four-player game where one player drops during the only question and
 * the other three finish it. Ends on the podium with a seat still held by a
 * disconnected player — the exact state findings 1 and 2 are about.
 */
function podiumAfterMidGameDrop(dropId: string): GameState {
  const ids = ['p1', 'p2', 'p3', 'p4'];
  let state = atFirstQuestion(ids, 1);
  state = reduce(state, { type: 'PLAYER_LEAVE', playerId: dropId }, 1100).state;

  for (const id of ids.filter((i) => i !== dropId)) {
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: id, choiceIndex: 0 }, 1200).state;
  }

  return reduce(state, { type: 'TIMEOUT' }, 1200 + REVEAL_MS).state;
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

  test('reveals immediately when the last player the round was waiting on disconnects', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1000).state;
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 1100);

    expect(result.state.phase).toBe('REVEAL');
    expect(result.alarmAtMs).toBe(1100 + REVEAL_MS);
  });

  test('keeps waiting when a connected player still owes an answer', () => {
    let state = atFirstQuestion(['p1', 'p2', 'p3']);
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1000).state;
    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 1100);

    expect(result.state.phase).toBe('QUESTION');
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
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's', reconnectToken: 'p1-token' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's', reconnectToken: 'p2-token' }, 1).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;

    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 200);

    expect(result.state.players).toHaveLength(1);
    expect(result.state.hostId).toBe('p2');
  });

  test('frees the seat and promotes a new host when the host drops during GENERATING, and generation still completes into COUNTDOWN', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's', reconnectToken: 'p1-token' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's', reconnectToken: 'p2-token' }, 1).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    state = reduce(state, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;

    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 300).state;
    expect(state.players).toHaveLength(1);
    expect(state.hostId).toBe('p2');
    expect(state.phase).toBe('GENERATING');

    const result = reduce(state, { type: 'GENERATION_SUCCEEDED', generationId: state.generationId, questions: questions(3) }, 400);
    expect(result.state.phase).toBe('COUNTDOWN');
  });

  test('preserves the pending generation deadline instead of replacing it with the idle-cleanup alarm', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's', reconnectToken: 'p1-token' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's', reconnectToken: 'p2-token' }, 1).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    const submitted = reduce(state, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200);
    state = submitted.state;
    const generationDeadline = submitted.alarmAtMs;

    const result = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 300);

    expect(result.alarmAtMs).toBe(generationDeadline);
    expect(result.alarmAtMs).not.toBe(300 + IDLE_CLEANUP_MS);
  });

  test('a promoted host can recover the lobby after a stranded generation times out', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's', reconnectToken: 'p1-token' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's', reconnectToken: 'p2-token' }, 1).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    state = reduce(state, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 300).state;

    state = reduce(state, { type: 'TIMEOUT' }, 200 + GENERATION_TIMEOUT_MS).state;
    expect(state.phase).toBe('SETUP');
    expect(state.hostId).toBe('p2');

    const result = reduce(state, { type: 'OPEN_SETUP', playerId: 'p2' }, 200 + GENERATION_TIMEOUT_MS + 1);
    expect(result.replies).not.toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
  });
});

describe('PLAYER_RECONNECT', () => {
  test('restores the player to their existing seat with their score intact', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1000).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1100).state;
    const result = reduce(
      state,
      { type: 'PLAYER_RECONNECT', playerId: 'p1', reconnectToken: tokenFor('p1') },
      1200,
    );

    expect(result.state.players.find((p) => p.id === 'p1')?.connected).toBe(true);
    expect(result.state.players.find((p) => p.id === 'p1')?.score).toBe(1000);
  });

  test('broadcasts a full state snapshot so the client lands in the live phase', () => {
    const state = atFirstQuestion(['p1', 'p2']);
    const result = reduce(
      state,
      { type: 'PLAYER_RECONNECT', playerId: 'p1', reconnectToken: tokenFor('p1') },
      1200,
    );
    const message = result.broadcasts[0];

    expect(message?.type).toBe('STATE');
    if (message?.type === 'STATE') expect(message.state.phase).toBe('QUESTION');
  });

  test('ignores a reconnect for an unknown player regardless of the token supplied', () => {
    const state = atFirstQuestion(['p1']);
    const result = reduce(
      state,
      { type: 'PLAYER_RECONNECT', playerId: 'ghost', reconnectToken: 'whatever' },
      1200,
    );

    expect(result.state.players).toHaveLength(1);
  });

  /**
   * The reconnect token is the whole point of this feature: a player who
   * merely reads another player's id off their own screen (every id is
   * broadcast in every STATE frame) must not be able to seat themselves as
   * that player. A mismatched token must be rejected, and rejected without
   * touching state at all — not even flipping `connected` back to true.
   */
  test('rejects a reconnect whose token does not match the seated player\'s, leaving state untouched', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1100).state;

    const result = reduce(
      state,
      { type: 'PLAYER_RECONNECT', playerId: 'p1', reconnectToken: 'an-attacker-guess' },
      1200,
    );

    expect(result.replies).toContainEqual({
      to: 'p1',
      message: { type: 'REJECTED', reason: 'BAD_TOKEN' },
    });
    expect(result.state).toEqual(state);
    expect(result.state.players.find((p) => p.id === 'p1')?.connected).toBe(false);
  });

  /**
   * `alarmAtMs: null` means "leave the existing alarm alone", which is only
   * safe while an alarm exists. Once the last connected player left, the
   * adapter ran CLEANUP and deleted it, so a reconnect that re-arms nothing
   * lands in a QUESTION no event can ever end.
   */
  test('re-arms the alarm so a room whose alarm was deleted by cleanup can still advance', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = reduce(state, { type: 'SUBMIT_ANSWER', playerId: 'p1', choiceIndex: 0 }, 1000).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1100).state;

    const emptied = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 1200);
    expect(emptied.effect).toEqual({ type: 'CLEANUP' });

    const result = reduce(
      emptied.state,
      { type: 'PLAYER_RECONNECT', playerId: 'p1', reconnectToken: tokenFor('p1') },
      1300,
    );

    expect(result.state.phase).toBe('QUESTION');
    expect(result.alarmAtMs).toBe(result.state.phaseEndsAtMs);
    expect(result.alarmAtMs).not.toBeNull();
  });

  test('does not resurrect a player who left during the lobby', () => {
    let state = reduce(createInitialState('ABCD'), { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's', reconnectToken: 'p1-token' }, 0).state;
    state = reduce(state, { type: 'PLAYER_JOIN', playerId: 'p2', name: 'p2', avatarSeed: 's', reconnectToken: 'p2-token' }, 1).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p2' }, 2).state;
    const result = reduce(
      state,
      { type: 'PLAYER_RECONNECT', playerId: 'p2', reconnectToken: 'p2-token' },
      3,
    );

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
    expect(result.replies).toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
  });

  test('rejects a restart asked for from a phase that is not the podium', () => {
    const result = reduce(lobbyOf(['p1', 'p2']), { type: 'PLAY_AGAIN', playerId: 'p1' }, 9000);

    expect(result.state.phase).toBe('LOBBY');
    expect(result.replies).toContainEqual({
      to: 'p1',
      message: { type: 'REJECTED', reason: 'BAD_PHASE' },
    });
  });
});

/**
 * A seat marked `connected: false` by a mid-game disconnect has no event left
 * that can remove it: its PLAYER_LEAVE already fired, and no LOBBY event
 * unseats a disconnected player. Unless PLAY_AGAIN prunes it, the ghost fills
 * the lobby forever and the next friend is told the room is full.
 */
describe('PLAY_AGAIN after a mid-game disconnect', () => {
  test('drops the disconnected seat instead of carrying the ghost into the new lobby', () => {
    const result = reduce(podiumAfterMidGameDrop('p4'), { type: 'PLAY_AGAIN', playerId: 'p1' }, 9000);

    expect(result.state.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });

  test('frees the ghost seat so a replacement player can take it', () => {
    const lobby = reduce(podiumAfterMidGameDrop('p4'), { type: 'PLAY_AGAIN', playerId: 'p1' }, 9000).state;
    const joined = reduce(lobby, { type: 'PLAYER_JOIN', playerId: 'ana', name: 'Ana', avatarSeed: 's', reconnectToken: 'ana-token' }, 9100);

    expect(joined.replies).not.toContainEqual({
      to: 'ana',
      message: { type: 'REJECTED', reason: 'LOBBY_FULL' },
    });
    expect(joined.state.players).toHaveLength(4);
  });

  test('still resets the surviving players\' scores', () => {
    const result = reduce(podiumAfterMidGameDrop('p4'), { type: 'PLAY_AGAIN', playerId: 'p1' }, 9000);
    expect(result.state.players.every((p) => p.score === 0)).toBe(true);
  });

  test('promotes the longest-connected survivor when the host itself is pruned', () => {
    // Defensive: enterPodium already promotes a connected host, so a
    // disconnected hostId should not reach PLAY_AGAIN. Pin the rule anyway —
    // the handler must never hand the new lobby a host who is not in it.
    const stranded: GameState = {
      ...podiumAfterMidGameDrop('p4'),
      hostId: 'gone',
      players: [
        { id: 'gone', name: 'gone', avatarSeed: 's', score: 0, joinedAtMs: 0, connected: false, reconnectToken: 'gone-token' },
        { id: 'p2', name: 'p2', avatarSeed: 's', score: 10, joinedAtMs: 1, connected: true, reconnectToken: 'p2-token' },
        { id: 'p3', name: 'p3', avatarSeed: 's', score: 10, joinedAtMs: 2, connected: true, reconnectToken: 'p3-token' },
      ],
    };

    const result = reduce(stranded, { type: 'PLAY_AGAIN', playerId: 'gone' }, 9000);

    expect(result.state.players.map((p) => p.id)).toEqual(['p2', 'p3']);
    expect(result.state.hostId).toBe('p2');
  });

  test('leaves hostId null when nobody connected survives the prune', () => {
    const emptied: GameState = {
      ...podiumAfterMidGameDrop('p4'),
      hostId: 'gone',
      players: [
        { id: 'gone', name: 'gone', avatarSeed: 's', score: 0, joinedAtMs: 0, connected: false, reconnectToken: 'gone-token' },
      ],
    };

    const result = reduce(emptied, { type: 'PLAY_AGAIN', playerId: 'gone' }, 9000);

    expect(result.state.players).toEqual([]);
    expect(result.state.hostId).toBeNull();
  });
});

/**
 * Spec §6 keeps the host's seat mid-round so a wifi blip does not destroy the
 * lobby, but the podium is where the lobby needs a host again: both PLAY_AGAIN
 * and OPEN_SETUP are host-only, so a hostId pointing at someone gone is a dead
 * end for everyone still in the room.
 */
describe('host promotion on entry to PODIUM', () => {
  test('promotes the longest-connected player when the host dropped mid-game', () => {
    expect(podiumAfterMidGameDrop('p1').hostId).toBe('p2');
  });

  test('lets the promoted host restart the game', () => {
    const result = reduce(podiumAfterMidGameDrop('p1'), { type: 'PLAY_AGAIN', playerId: 'p2' }, 9000);

    expect(result.replies).not.toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
    expect(result.state.phase).toBe('LOBBY');
  });

  test('lets the promoted host open setup for another round', () => {
    const result = reduce(podiumAfterMidGameDrop('p1'), { type: 'OPEN_SETUP', playerId: 'p2' }, 9000);

    expect(result.replies).not.toContainEqual({
      to: 'p2',
      message: { type: 'REJECTED', reason: 'NOT_HOST' },
    });
    expect(result.state.phase).toBe('SETUP');
  });

  test('leaves a still-connected host in place rather than rotating the role', () => {
    expect(podiumAfterMidGameDrop('p4').hostId).toBe('p1');
  });
});
