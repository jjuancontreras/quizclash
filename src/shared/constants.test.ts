import { describe, expect, test } from 'vitest';
import {
  QUESTION_WINDOW_MS,
  MAX_PLAYERS,
  MIN_QUESTIONS,
  MAX_QUESTION_CHARS,
  MAX_CHOICE_CHARS,
  BASE_POINTS,
} from './constants.js';

describe('game constants', () => {
  test('question window is 20 seconds per spec', () => {
    expect(QUESTION_WINDOW_MS).toBe(20_000);
  });

  test('lobby holds at most 4 players', () => {
    expect(MAX_PLAYERS).toBe(4);
  });

  test('a round needs at least 5 surviving questions', () => {
    expect(MIN_QUESTIONS).toBe(5);
  });

  test('mobile text budgets match the 375px layout budget', () => {
    expect(MAX_QUESTION_CHARS).toBe(120);
    expect(MAX_CHOICE_CHARS).toBe(60);
  });

  test('a perfect instant answer is worth the full base points', () => {
    expect(BASE_POINTS).toBe(1000);
  });
});
