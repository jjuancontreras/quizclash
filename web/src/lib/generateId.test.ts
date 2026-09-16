import { afterEach, describe, expect, test, vi } from 'vitest';
import { generateId } from './generateId.js';

describe('generateId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('uses crypto.randomUUID when it is available', () => {
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');

    expect(generateId()).toBe('11111111-1111-4111-8111-111111111111');
    expect(spy).toHaveBeenCalledOnce();
  });

  test('falls back to a getRandomValues-built v4 UUID when randomUUID is unavailable', () => {
    const original = crypto.randomUUID;
    // Simulate an insecure context (plain HTTP on a non-localhost host),
    // where the browser does not expose crypto.randomUUID at all.
    // @ts-expect-error -- deliberately removing the method for this test
    delete crypto.randomUUID;

    try {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      crypto.randomUUID = original;
    }
  });

  test('the fallback produces a different id on each call', () => {
    const original = crypto.randomUUID;
    // @ts-expect-error -- deliberately removing the method for this test
    delete crypto.randomUUID;

    try {
      expect(generateId()).not.toBe(generateId());
    } finally {
      crypto.randomUUID = original;
    }
  });
});
