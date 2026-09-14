import { describe, expect, test } from 'vitest';
import { ANSWER_STYLES } from './colors.js';

describe('ANSWER_STYLES', () => {
  test('has exactly four entries, one per answer slot', () => {
    expect(ANSWER_STYLES).toHaveLength(4);
  });

  test('every entry has a distinct shape', () => {
    const shapes = ANSWER_STYLES.map((s) => s.shape);
    expect(new Set(shapes).size).toBe(4);
  });

  test('every entry has a distinct hue', () => {
    const hues = ANSWER_STYLES.map((s) => s.hue);
    expect(new Set(hues).size).toBe(4);
  });

  test('matches the spec table order: circle, triangle, square, diamond', () => {
    expect(ANSWER_STYLES.map((s) => s.shape)).toEqual(['circle', 'triangle', 'square', 'diamond']);
  });
});
