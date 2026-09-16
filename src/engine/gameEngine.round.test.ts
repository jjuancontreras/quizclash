import { describe, expect, test } from 'vitest';
import { createInitialState, reduce, toPublicState } from './gameEngine.js';
import { HURRY_WINDOW_MS, QUESTION_WINDOW_MS, REVEAL_MS } from '../shared/constants.js';
import type { ChoiceIndex, GameState, Question, SetupConfig } from '../shared/types.js';

const config: SetupConfig = { count: 5, difficulty: 'easy', focus: '', sourceKind: 'text' };

function questions(count: number): Question[] {
  return Array.from({ length: count }, (_, i) => ({
    question: `Q${i}?`,
    choices: ['right', 'wrong1', 'wrong2', 'wrong3'],
    correctIndex: 0,
    explanation: 'because',
    sourceQuote: 'quote',
  }));
}

/** Drive a lobby all the way to a live first question at t=1000. */
function atFirstQuestion(playerIds: string[], count = 5): GameState {
  let state = playerIds.reduce<GameState>(
    (s, id, i) =>
      reduce(
        s,
        { type: 'PLAYER_JOIN', playerId: id, name: id, avatarSeed: 's', reconnectToken: `${id}-token` },
        i,
      ).state,
    createInitialState('ABCD'),
  );
  state = reduce(state, { type: 'OPEN_SETUP', playerId: playerIds[0]! }, 100).state;
  state = reduce(state, { type: 'SUBMIT_SETUP', playerId: playerIds[0]!, config }, 200).state;
  state = reduce(state, { type: 'GENERATION_SUCCEEDED', generationId: state.generationId, questions: questions(count) }, 300).state;
  return reduce(state, { type: 'TIMEOUT' }, 1000).state;
}

function answer(state: GameState, playerId: string, choiceIndex: ChoiceIndex, atMs: number) {
  return reduce(state, { type: 'SUBMIT_ANSWER', playerId, choiceIndex }, atMs);
}

describe('countdown expiry', () => {
  test('shows the first question and records when it was shown', () => {
    const state = atFirstQuestion(['p1']);

    expect(state.phase).toBe('QUESTION');
    expect(state.questionShownAtMs).toBe(1000);
  });

  test('arms the alarm for the end of the answer window', () => {
    let state = reduce(
      createInitialState('ABCD'),
      { type: 'PLAYER_JOIN', playerId: 'p1', name: 'p1', avatarSeed: 's', reconnectToken: 'p1-token' },
      0,
    ).state;
    state = reduce(state, { type: 'OPEN_SETUP', playerId: 'p1' }, 100).state;
    state = reduce(state, { type: 'SUBMIT_SETUP', playerId: 'p1', config }, 200).state;
    state = reduce(state, { type: 'GENERATION_SUCCEEDED', generationId: state.generationId, questions: questions(5) }, 300).state;
    const result = reduce(state, { type: 'TIMEOUT' }, 1000);

    expect(result.alarmAtMs).toBe(1000 + QUESTION_WINDOW_MS);
  });
});

describe('SUBMIT_ANSWER', () => {
  test('awards near-full points for an immediate correct answer', () => {
    const result = answer(atFirstQuestion(['p1', 'p2']), 'p1', 0, 1000);
    expect(result.state.players.find((p) => p.id === 'p1')?.score).toBe(1000);
  });

  test('awards nothing for a fast wrong answer', () => {
    const result = answer(atFirstQuestion(['p1', 'p2']), 'p1', 1, 1000);
    expect(result.state.players.find((p) => p.id === 'p1')?.score).toBe(0);
  });

  test('awards half points for a correct answer at the buzzer', () => {
    const state = atFirstQuestion(['p1', 'p2']);
    const result = answer(state, 'p1', 0, 1000 + QUESTION_WINDOW_MS);

    expect(result.state.players.find((p) => p.id === 'p1')?.score).toBe(500);
  });

  test('ignores a second answer from the same player', () => {
    let state = answer(atFirstQuestion(['p1', 'p2']), 'p1', 0, 1000).state;
    state = answer(state, 'p1', 1, 1500).state;

    expect(state.players.find((p) => p.id === 'p1')?.score).toBe(1000);
    expect(state.answers.filter((a) => a.playerId === 'p1')).toHaveLength(1);
  });

  test('advances to REVEAL as soon as every seated player has answered', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = answer(state, 'p1', 0, 1000).state;
    const result = answer(state, 'p2', 1, 1200);

    expect(result.state.phase).toBe('REVEAL');
  });

  test('stays on the question while anyone has not answered', () => {
    const result = answer(atFirstQuestion(['p1', 'p2']), 'p1', 0, 1000);
    expect(result.state.phase).toBe('QUESTION');
  });

  /**
   * A disconnected player's answer stays in `state.answers` — it is what
   * holds their score. Comparing the NUMBER of answers against the NUMBER of
   * connected players therefore lets a departed player's answer stand in for
   * a live player's missing one: below, p1's answer covers p3, and the round
   * reveals while p3 is still connected and still waiting. From the table it
   * just looks like the question skipped. The completion test must ask
   * "has every connected player answered", per player.
   */
  test('does not reveal while a connected player still owes an answer, even after an answered player disconnects', () => {
    let state = atFirstQuestion(['p1', 'p2', 'p3']);
    state = answer(state, 'p1', 0, 1100).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1200).state;

    const result = answer(state, 'p2', 0, 1300);

    expect(result.state.phase).toBe('QUESTION');
    expect(result.state.answers.some((a) => a.playerId === 'p3')).toBe(false);
  });

  test('lets the last connected player take the turn a count comparison would have stolen', () => {
    let state = atFirstQuestion(['p1', 'p2', 'p3']);
    state = answer(state, 'p1', 0, 1100).state;
    state = reduce(state, { type: 'PLAYER_LEAVE', playerId: 'p1' }, 1200).state;
    state = answer(state, 'p2', 0, 1300).state;

    const result = answer(state, 'p3', 0, 1400);

    expect(result.state.phase).toBe('REVEAL');
    expect(result.state.players.find((p) => p.id === 'p3')?.score).toBeGreaterThan(0);
  });

  test('ignores a repeat answer from a player even after the round has moved on', () => {
    let state = atFirstQuestion(['p1', 'p2']);
    state = answer(state, 'p1', 0, 1000).state;
    state = answer(state, 'p2', 0, 1100).state;
    const late = answer(state, 'p1', 1, 1200);

    expect(late.state.players.find((p) => p.id === 'p1')?.score).toBe(1000);
  });

  test('ignores an answer from someone not seated in this lobby', () => {
    const result = answer(atFirstQuestion(['p1', 'p2']), 'ghost', 0, 1000);
    expect(result.state.answers).toHaveLength(0);
  });

  test('ignores an answer from a player who has not yet answered once the phase leaves QUESTION', () => {
    let state = atFirstQuestion(['p1', 'p2', 'p3']);
    state = answer(state, 'p1', 0, 1000).state;
    // Window closes before p2/p3 answer: phase moves to REVEAL with only p1's answer recorded.
    state = reduce(state, { type: 'TIMEOUT' }, 1000 + QUESTION_WINDOW_MS).state;
    expect(state.phase).toBe('REVEAL');

    // p2 never answered this question, so the duplicate-answer guard cannot be
    // what stops this submission — only the phase guard can.
    const late = answer(state, 'p2', 1, 1000 + QUESTION_WINDOW_MS + 100);

    expect(late.state.answers).toEqual(state.answers);
    expect(late.state.players.find((p) => p.id === 'p2')?.score).toBe(0);
    expect(late.state.phase).toBe('REVEAL');
  });

  describe('the hurry window (competitive pressure after the first answer)', () => {
    test('shortens everyone else\'s remaining time to HURRY_WINDOW_MS once the first player answers', () => {
      // atFirstQuestion lands at t=1000, so the full-window deadline is 21000.
      let state = atFirstQuestion(['p1', 'p2', 'p3']);
      const result = answer(state, 'p1', 0, 1000);

      expect(result.state.phaseEndsAtMs).toBe(1000 + HURRY_WINDOW_MS);
      expect(result.alarmAtMs).toBe(1000 + HURRY_WINDOW_MS);
    });

    test('never extends the deadline: answering with less than the hurry window already remaining changes nothing', () => {
      let state = atFirstQuestion(['p1', 'p2']);
      // Full window ends at 21000; answering at 20800 leaves only 200ms, far
      // under HURRY_WINDOW_MS -- the deadline must not jump forward to
      // 20800 + HURRY_WINDOW_MS, which would be LATER than the original.
      const result = answer(state, 'p1', 1, 20_800);

      expect(result.state.phaseEndsAtMs).toBe(21_000);
    });

    test('does not re-shorten on a second answer -- only the first answer sets the hurry deadline', () => {
      let state = atFirstQuestion(['p1', 'p2', 'p3']);
      state = answer(state, 'p1', 0, 1000).state;
      const afterFirst = state.phaseEndsAtMs;

      const result = answer(state, 'p2', 0, 1500);

      expect(result.state.phaseEndsAtMs).toBe(afterFirst);
    });

    test('a solo player answering reveals immediately -- the hurry window never has anyone left to pressure', () => {
      const result = answer(atFirstQuestion(['p1']), 'p1', 0, 1000);
      expect(result.state.phase).toBe('REVEAL');
    });
  });
});

describe('question window expiry', () => {
  test('advances to REVEAL when the window closes with nobody answering', () => {
    const state = atFirstQuestion(['p1', 'p2']);
    const result = reduce(state, { type: 'TIMEOUT' }, 1000 + QUESTION_WINDOW_MS);

    expect(result.state.phase).toBe('REVEAL');
  });

  test('leaves a non-answering player on zero points', () => {
    const state = atFirstQuestion(['p1', 'p2']);
    const result = reduce(state, { type: 'TIMEOUT' }, 1000 + QUESTION_WINDOW_MS);

    expect(result.state.players.find((p) => p.id === 'p2')?.score).toBe(0);
  });
});

describe('reveal expiry', () => {
  function atReveal(): GameState {
    let state = atFirstQuestion(['p1'], 2);
    return answer(state, 'p1', 0, 1000).state;
  }

  test('holds REVEAL for the configured duration', () => {
    expect(atReveal().phaseEndsAtMs).toBe(1000 + REVEAL_MS);
  });

  test('advances to the next question and clears the previous answers', () => {
    const result = reduce(atReveal(), { type: 'TIMEOUT' }, 1000 + REVEAL_MS);

    expect(result.state.phase).toBe('QUESTION');
    expect(result.state.questionIndex).toBe(1);
    expect(result.state.answers).toEqual([]);
  });

  test('goes to PODIUM after the final question instead of a sixth', () => {
    let state = atFirstQuestion(['p1'], 1);
    state = answer(state, 'p1', 0, 1000).state;
    const result = reduce(state, { type: 'TIMEOUT' }, 1000 + REVEAL_MS);

    expect(result.state.phase).toBe('PODIUM');
  });

  test('carries scores through to the podium', () => {
    let state = atFirstQuestion(['p1'], 1);
    state = answer(state, 'p1', 0, 1000).state;
    const result = reduce(state, { type: 'TIMEOUT' }, 1000 + REVEAL_MS);

    expect(result.state.players[0]?.score).toBe(1000);
  });
});

describe('answered and deltas projections', () => {
  test('answered lists player ids who have answered the live question, during QUESTION only', () => {
    let state = atFirstQuestion(['p1', 'p2', 'p3']);
    state = answer(state, 'p1', 0, 1000).state;

    const publicState = toPublicState(state);
    expect(publicState.answered).toEqual(['p1']);
  });

  test('answered is empty outside QUESTION', () => {
    const state = atFirstQuestion(['p1', 'p2'], 1);
    const publicState = toPublicState({ ...state, phase: 'LOBBY' });
    expect(publicState.answered).toEqual([]);
  });

  test('deltas carries each answer\'s points and choice, during REVEAL only', () => {
    let state = atFirstQuestion(['p1', 'p2'], 1);
    state = answer(state, 'p1', 0, 1000).state;
    const result = answer(state, 'p2', 1, 1200); // both have now answered -> REVEAL

    expect(result.state.phase).toBe('REVEAL');
    const publicState = toPublicState(result.state);
    expect(publicState.deltas).toContainEqual({ playerId: 'p1', points: 1000, choiceIndex: 0 });
    expect(publicState.deltas).toContainEqual({ playerId: 'p2', points: 0, choiceIndex: 1 });
  });

  test('deltas is empty outside REVEAL', () => {
    const state = atFirstQuestion(['p1'], 1);
    expect(toPublicState(state).deltas).toEqual([]);
  });
});
