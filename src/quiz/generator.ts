import { z } from 'zod';
import { MIN_QUESTIONS } from '../shared/constants.js';
import { prepareQuestions } from '../engine/questions.js';
import type { Question, SetupConfig } from '../shared/types.js';
import type { QuizModel, QuizSource } from './geminiClient.js';

/** Player-facing text. Deliberately generic — raw model errors can carry secrets. */
export const GENERATION_FAILURE_MESSAGE =
  "Couldn't build a quiz from that file — try a different file or paste the text.";

const PayloadSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string(),
      choices: z.array(z.string()),
      correctIndex: z.number().int(),
      explanation: z.string(),
      sourceQuote: z.string(),
    }),
  ),
});

export type GenerationResult =
  | { readonly ok: true; readonly questions: Question[] }
  | { readonly ok: false; readonly reason: string };

function parseQuestions(raw: string): Question[] | null {
  try {
    const parsed = PayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.questions : null;
  } catch {
    return null;
  }
}

async function attempt(
  model: QuizModel,
  source: QuizSource,
  config: SetupConfig,
  random: () => number,
): Promise<Question[] | null> {
  let raw: string;
  try {
    raw = await model.generate(source, config);
  } catch {
    return null;
  }

  const parsed = parseQuestions(raw);
  if (parsed === null) return null;

  const prepared = prepareQuestions(parsed, random);
  return prepared.length >= MIN_QUESTIONS ? prepared : null;
}

/**
 * One retry, then give up. Spec §8: every failure must return the host to a
 * screen where they can try again — never loop, never strand the lobby.
 */
export async function generateQuiz(
  model: QuizModel,
  source: QuizSource,
  config: SetupConfig,
  random: () => number = Math.random,
): Promise<GenerationResult> {
  for (let tries = 0; tries < 2; tries++) {
    const questions = await attempt(model, source, config, random);
    if (questions !== null) return { ok: true, questions };
  }
  return { ok: false, reason: GENERATION_FAILURE_MESSAGE };
}
