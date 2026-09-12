import { describe, expect, test } from 'vitest';
import { scoreAnswer } from './scoring.js';
import { QUESTION_WINDOW_MS } from '../shared/constants.js';

const shownAtMs = 1_000_000;
const windowMs = QUESTION_WINDOW_MS;

function score(offsetMs: number, isCorrect: boolean): number {
  return scoreAnswer({ answeredAtMs: shownAtMs + offsetMs, shownAtMs, windowMs, isCorrect });
}

describe('scoreAnswer', () => {
  test('awards full points for an instantaneous correct answer', () => {
    expect(score(0, true)).toBe(1000);
  });

  test('awards half points for a correct answer at the buzzer', () => {
    expect(score(windowMs, true)).toBe(500);
  });

  test('awards three-quarter points at the halfway mark', () => {
    expect(score(windowMs / 2, true)).toBe(750);
  });

  test('awards nothing for a wrong answer however fast it arrives', () => {
    expect(score(0, false)).toBe(0);
    expect(score(windowMs / 2, false)).toBe(0);
  });

  test('never awards less than half for any correct answer inside the window', () => {
    for (let offset = 0; offset <= windowMs; offset += 250) {
      expect(score(offset, true)).toBeGreaterThanOrEqual(500);
    }
  });

  test('clamps an answer arriving after the window to the buzzer score, not below', () => {
    expect(score(windowMs + 5_000, true)).toBe(500);
  });

  test('clamps a negative elapsed time to full points rather than exceeding the base', () => {
    expect(score(-500, true)).toBe(1000);
  });

  test('returns an integer so scores never display a fraction', () => {
    expect(Number.isInteger(score(3_333, true))).toBe(true);
  });

  test('treats a zero-length window as instantaneous instead of dividing by zero', () => {
    const points = scoreAnswer({ answeredAtMs: 10, shownAtMs: 10, windowMs: 0, isCorrect: true });
    expect(points).toBe(1000);
  });
});
