import { describe, expect, test, vi } from 'vitest';
import { generateQuiz, GENERATION_FAILURE_MESSAGE } from './generator.js';
import type { QuizModel, QuizSource } from './geminiClient.js';
import type { SetupConfig } from '../shared/types.js';

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
    if (!result.ok) expect(result.reason).not.toContain('sk-secret');
  });
});
