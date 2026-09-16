import { afterEach, describe, expect, test, vi } from 'vitest';
import { generateQuiz, GENERATION_BUSY_MESSAGE, GENERATION_FAILURE_MESSAGE } from './generator.js';
import type { QuizModel, QuizSource } from './geminiClient.js';
import type { SetupConfig } from '../shared/types.js';

/** Shaped like @google/genai's real ApiError: a plain Error with a numeric
 * `.status`, not a subclass -- attempt()'s detection must not assume the
 * real class, only the shape it actually checks. */
function apiError(status: number, message: string): Error {
  const error = new Error(message);
  (error as Error & { status: number }).status = status;
  return error;
}

const source: QuizSource = { kind: 'text', text: 'Mitochondria make ATP.' };
const config: SetupConfig = { count: 5, difficulty: 'easy', focus: '', sourceKind: 'text' };

function validPayload(count: number): string {
  const questions = Array.from({ length: count }, (_, i) => ({
    question: `Question number ${i}?`,
    choices: ['A', 'B', 'C', 'D'],
    correctIndex: 0,
    explanation: 'Because.',
    sourceQuote: 'Mitochondria make ATP.',
  }));
  return JSON.stringify({ questions });
}

function modelReturning(...payloads: string[]): QuizModel {
  const generate = vi.fn();
  for (const p of payloads) generate.mockResolvedValueOnce(p);
  return { generate } as unknown as QuizModel;
}

function modelThrowing(...errors: Error[]): QuizModel {
  const generate = vi.fn();
  for (const e of errors) generate.mockRejectedValueOnce(e);
  return { generate } as unknown as QuizModel;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generateQuiz', () => {
  test('returns prepared questions when the model responds well', async () => {
    const result = await generateQuiz(modelReturning(validPayload(5)), source, config, () => 0.5);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.questions).toHaveLength(5);
  });

  test('retries exactly once when the model returns unparseable JSON', async () => {
    const model = modelReturning('not json at all', validPayload(5));
    const result = await generateQuiz(model, source, config, () => 0.5);

    expect(result.ok).toBe(true);
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  test('gives up after the single retry rather than looping', async () => {
    const model = modelReturning('nope', 'still nope');
    const result = await generateQuiz(model, source, config, () => 0.5);

    expect(result.ok).toBe(false);
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  test('retries once when the model call itself throws', async () => {
    const model = modelThrowing(new Error('network'), new Error('network'));
    const result = await generateQuiz(model, source, config, () => 0.5);

    expect(result.ok).toBe(false);
    expect(model.generate).toHaveBeenCalledTimes(2);
  });

  test('fails when too few questions survive validation', async () => {
    const payload = JSON.stringify({
      questions: [
        { question: 'ok?', choices: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'x', sourceQuote: 'y' },
      ],
    });
    const result = await generateQuiz(modelReturning(payload, payload), source, config, () => 0.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(GENERATION_FAILURE_MESSAGE);
  });

  test('drops over-budget questions but keeps the round when enough survive', async () => {
    const questions = [
      ...JSON.parse(validPayload(5)).questions,
      { question: 'a'.repeat(500), choices: ['A', 'B', 'C', 'D'], correctIndex: 0, explanation: 'x', sourceQuote: 'y' },
    ];
    const result = await generateQuiz(
      modelReturning(JSON.stringify({ questions })),
      source,
      config,
      () => 0.5,
    );

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.questions).toHaveLength(5);
  });

  test('fails cleanly when the payload is valid JSON of the wrong shape', async () => {
    const model = modelReturning('{"items":[]}', '{"items":[]}');
    const result = await generateQuiz(model, source, config, () => 0.5);

    expect(result.ok).toBe(false);
  });

  test('never leaks a raw model error message to the player-facing reason', async () => {
    const model = modelThrowing(new Error('API key invalid: sk-secret'), new Error('again'));
    const result = await generateQuiz(model, source, config, () => 0.5);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(GENERATION_FAILURE_MESSAGE);
  });

  /**
   * The player sees one generic sentence whatever went wrong, so an
   * unresolvable model id, an expired key, an exhausted quota and a genuinely
   * unreadable PDF are indistinguishable from the outside. The operator has
   * to be able to tell them apart.
   */
  test('logs the model error server-side instead of swallowing it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('model not found: gemini-flash-latest');

    await generateQuiz(modelThrowing(failure, failure), source, config, () => 0.5);

    expect(logged).toHaveBeenCalledTimes(2);
    expect(logged.mock.calls[0]?.[1]).toBe(failure);
  });

  /**
   * The prompt asks for exactly config.count questions and the schema puts no
   * upper bound on the array. A model that returns 40 would otherwise hand
   * four friends a 25-minute game. Spec section 8: the server-side layer is
   * the one that enforces.
   */
  test('caps the round at the requested question count', async () => {
    const result = await generateQuiz(modelReturning(validPayload(40)), source, config, () => 0.5);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.questions).toHaveLength(config.count);
  });

  describe('distinguishing a busy AI service from a genuine content problem', () => {
    test('reports GENERATION_BUSY_MESSAGE when every attempt failed with a rate-limit/5xx status', async () => {
      const model = modelThrowing(apiError(503, 'high demand'), apiError(429, 'rate limited'));
      const result = await generateQuiz(model, source, config, () => 0.5);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(GENERATION_BUSY_MESSAGE);
    });

    test('reports GENERATION_FAILURE_MESSAGE when a non-transient failure occurs even once, mixed with a transient one', async () => {
      // First attempt looks like a real problem (a non-retryable status),
      // second looks transient -- the safer, more actionable message wins
      // rather than a mixed signal defaulting to "just wait and retry".
      const model = modelThrowing(apiError(400, 'bad request'), apiError(503, 'high demand'));
      const result = await generateQuiz(model, source, config, () => 0.5);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(GENERATION_FAILURE_MESSAGE);
    });

    test('a non-5xx/429 thrown error (e.g. a genuinely bad request) is treated as non-transient', async () => {
      const badRequest = apiError(400, 'invalid request');
      const model = modelThrowing(badRequest, badRequest);
      const result = await generateQuiz(model, source, config, () => 0.5);

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe(GENERATION_FAILURE_MESSAGE);
    });

    test('succeeds normally on the retry after one transient failure, with no special message', async () => {
      const model: QuizModel = { generate: vi.fn() };
      vi.mocked(model.generate).mockRejectedValueOnce(apiError(503, 'high demand'));
      vi.mocked(model.generate).mockResolvedValueOnce(validPayload(5));

      const result = await generateQuiz(model, source, config, () => 0.5);

      expect(result.ok).toBe(true);
    });
  });

  describe('the retry delay', () => {
    test('defaults to no delay, so every test above stays instant', async () => {
      const model = modelReturning('not json', validPayload(5));
      const start = Date.now();
      await generateQuiz(model, source, config, () => 0.5);

      expect(Date.now() - start).toBeLessThan(100);
    });

    test('waits retryDelayMs before the retry when one is passed', async () => {
      vi.useFakeTimers();
      try {
        const model = modelReturning('not json', validPayload(5));
        const resultPromise = generateQuiz(model, source, config, () => 0.5, 2000);

        // Only the first attempt has happened yet -- the retry is pending
        // behind the delay.
        await vi.advanceTimersByTimeAsync(0);
        expect(model.generate).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(2000);
        const result = await resultPromise;

        expect(model.generate).toHaveBeenCalledTimes(2);
        expect(result.ok).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
