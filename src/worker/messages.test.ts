import { describe, expect, test } from 'vitest';
import { parseClientMessage, MAX_UPLOAD_BASE64_CHARS } from './messages.js';

const PLAYER = 'p1';

function setupMessage(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'SUBMIT_SETUP',
    config: { count: 10, difficulty: 'medium', focus: '', sourceKind: 'text' },
    source: { kind: 'text', text: 'Mitochondria make ATP.' },
    ...overrides,
  });
}

describe('parseClientMessage — malformed input', () => {
  test('returns null for text that is not JSON', () => {
    expect(parseClientMessage('<<<not json', PLAYER)).toBeNull();
  });

  test('returns null for JSON that is not an object', () => {
    expect(parseClientMessage('"a string"', PLAYER)).toBeNull();
    expect(parseClientMessage('42', PLAYER)).toBeNull();
    expect(parseClientMessage('null', PLAYER)).toBeNull();
  });

  test('returns null for an unknown message type', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'DROP_TABLE' }), PLAYER)).toBeNull();
  });
});

describe('parseClientMessage — simple events', () => {
  test('attaches the socket\'s own player id rather than trusting the body', () => {
    const raw = JSON.stringify({ type: 'OPEN_SETUP', playerId: 'somebody-else' });
    expect(parseClientMessage(raw, PLAYER)?.event).toEqual({ type: 'OPEN_SETUP', playerId: PLAYER });
  });

  test('parses PLAY_AGAIN', () => {
    const raw = JSON.stringify({ type: 'PLAY_AGAIN' });
    expect(parseClientMessage(raw, PLAYER)?.event.type).toBe('PLAY_AGAIN');
  });
});

describe('parseClientMessage — SUBMIT_ANSWER', () => {
  test('accepts a valid answer slot', () => {
    const raw = JSON.stringify({ type: 'SUBMIT_ANSWER', choiceIndex: 2 });
    expect(parseClientMessage(raw, PLAYER)?.event).toEqual({
      type: 'SUBMIT_ANSWER',
      playerId: PLAYER,
      choiceIndex: 2,
    });
  });

  test('rejects an out-of-range slot that would index past the choices', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'SUBMIT_ANSWER', choiceIndex: 9 }), PLAYER)).toBeNull();
  });

  test('rejects a non-integer slot', () => {
    expect(parseClientMessage(JSON.stringify({ type: 'SUBMIT_ANSWER', choiceIndex: '0' }), PLAYER)).toBeNull();
  });
});

describe('parseClientMessage — SUBMIT_SETUP', () => {
  test('accepts a well-formed setup and returns the source alongside the event', () => {
    const parsed = parseClientMessage(setupMessage(), PLAYER);

    expect(parsed?.event.type).toBe('SUBMIT_SETUP');
    expect(parsed?.source).toEqual({ kind: 'text', text: 'Mitochondria make ATP.' });
  });

  test('rejects a question count that is not one of the four offered', () => {
    const raw = setupMessage({ config: { count: 500, difficulty: 'easy', focus: '', sourceKind: 'text' } });
    expect(parseClientMessage(raw, PLAYER)).toBeNull();
  });

  test('rejects an unknown difficulty', () => {
    const raw = setupMessage({ config: { count: 5, difficulty: 'impossible', focus: '', sourceKind: 'text' } });
    expect(parseClientMessage(raw, PLAYER)).toBeNull();
  });

  test('rejects a PDF over the upload cap — the client-side limit is a courtesy, not a control', () => {
    const raw = setupMessage({
      source: { kind: 'pdf', base64: 'A'.repeat(MAX_UPLOAD_BASE64_CHARS + 1) },
    });
    expect(parseClientMessage(raw, PLAYER)).toBeNull();
  });

  test('accepts a PDF at exactly the cap', () => {
    const raw = setupMessage({
      source: { kind: 'pdf', base64: 'A'.repeat(MAX_UPLOAD_BASE64_CHARS) },
    });
    expect(parseClientMessage(raw, PLAYER)).not.toBeNull();
  });

  test('rejects empty pasted text rather than sending a blank prompt to Gemini', () => {
    const raw = setupMessage({ source: { kind: 'text', text: '   \n  ' } });
    expect(parseClientMessage(raw, PLAYER)).toBeNull();
  });

  test('rejects a source of an unknown kind', () => {
    const raw = setupMessage({ source: { kind: 'exe', bytes: 'x' } });
    expect(parseClientMessage(raw, PLAYER)).toBeNull();
  });

  test('caps the focus field so it cannot be used to smuggle a long prompt', () => {
    const raw = setupMessage({
      config: { count: 5, difficulty: 'easy', focus: 'x'.repeat(5000), sourceKind: 'text' },
    });
    expect(parseClientMessage(raw, PLAYER)).toBeNull();
  });
});
