import { describe, expect, test } from 'vitest';
import { isChoiceIndex } from './types.js';

describe('isChoiceIndex', () => {
  test('accepts every valid answer slot', () => {
    expect(isChoiceIndex(0)).toBe(true);
    expect(isChoiceIndex(3)).toBe(true);
  });

  test('rejects an index past the fourth choice', () => {
    expect(isChoiceIndex(4)).toBe(false);
  });

  test('rejects a negative index', () => {
    expect(isChoiceIndex(-1)).toBe(false);
  });

  test('rejects non-integers so a fractional wire value cannot index an array', () => {
    expect(isChoiceIndex(1.5)).toBe(false);
  });

  test('rejects non-numbers arriving from an untrusted socket message', () => {
    expect(isChoiceIndex('2')).toBe(false);
    expect(isChoiceIndex(null)).toBe(false);
    expect(isChoiceIndex(undefined)).toBe(false);
  });
});
