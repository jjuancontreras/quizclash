import { describe, expect, test } from 'vitest';
import {
  LOBBY_ALPHABET,
  generateLobbyCode,
  isValidLobbyCode,
  normalizeLobbyCode,
} from './lobbyCode.js';

describe('LOBBY_ALPHABET', () => {
  test('excludes characters people confuse when reading a code aloud', () => {
    for (const ambiguous of ['0', 'O', '1', 'I', 'L']) {
      expect(LOBBY_ALPHABET).not.toContain(ambiguous);
    }
  });

  test('is large enough that collisions are rare', () => {
    expect(LOBBY_ALPHABET.length).toBeGreaterThanOrEqual(20);
  });
});

describe('generateLobbyCode', () => {
  test('produces a 4-character code', () => {
    expect(generateLobbyCode()).toHaveLength(4);
  });

  test('produces only alphabet characters', () => {
    for (let i = 0; i < 200; i++) {
      for (const char of generateLobbyCode()) {
        expect(LOBBY_ALPHABET).toContain(char);
      }
    }
  });

  test('is deterministic when given a seeded random source', () => {
    const always = () => 0;
    const expected = LOBBY_ALPHABET[0]!.repeat(4);
    expect(generateLobbyCode(always)).toBe(expected);
  });
});

describe('normalizeLobbyCode', () => {
  test('uppercases so a player typing lowercase still joins', () => {
    expect(normalizeLobbyCode('abcd')).toBe('ABCD');
  });

  test('strips surrounding whitespace pasted from a chat message', () => {
    expect(normalizeLobbyCode('  ABCD \n')).toBe('ABCD');
  });
});

describe('isValidLobbyCode', () => {
  test('accepts a well-formed code', () => {
    expect(isValidLobbyCode(generateLobbyCode())).toBe(true);
  });

  test('rejects the wrong length', () => {
    expect(isValidLobbyCode('ABC')).toBe(false);
    expect(isValidLobbyCode('ABCDE')).toBe(false);
  });

  test('rejects a code containing an excluded ambiguous character', () => {
    expect(isValidLobbyCode('AB0D')).toBe(false);
  });

  test('rejects lowercase — callers must normalize first', () => {
    expect(isValidLobbyCode('abcd')).toBe(false);
  });
});
