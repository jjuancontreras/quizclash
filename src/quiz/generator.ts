import { z } from 'zod';
import { MIN_QUESTIONS } from '../shared/constants.js';
import { prepareQuestions } from '../engine/questions.js';
import type { Question, SetupConfig } from '../shared/types.js';
import type { QuizModel, QuizSource } from './geminiClient.js';

/** Player-facing text. Deliberately generic — raw model errors can carry secrets. */
export const GENERATION_FAILURE_MESSAGE =
  "Couldn't build a quiz from that file — try a different file or paste the text.";

/**
 * Shown only when EVERY attempt failed with a plausibly-transient error
 * (rate limit, 5xx) -- never blames the host's file for what was actually
 * the AI service being overloaded at that moment.
 */
export const GENERATION_BUSY_MESSAGE =
  'The AI service is busy right now. Please wait a moment and try again.';

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** `@google/genai`'s ApiError carries a numeric `.status` -- 429 (rate
 * limit) and 5xx are the codes worth a distinct, honest message; anything
 * else (a malformed request, an unreadable file) is a real problem with
 * this attempt, not a busy service. */
function isRetryableStatus(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return false;
  const status = (error as { status: unknown }).status;
  return typeof status === 'number' && RETRYABLE_STATUS_CODES.has(status);
}

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

interface AttemptOutcome {
  readonly questions: Question[] | null;
  /** True only when this attempt's failure looks transient (rate limit,
   * 5xx) rather than a genuine content/schema problem with this file. */
  readonly transient: boolean;
}

async function attempt(
  model: QuizModel,
  source: QuizSource,
  config: SetupConfig,
  random: () => number,
): Promise<AttemptOutcome> {
  let raw: string;
  try {
    raw = await model.generate(source, config);
  } catch (error) {
    // The player only ever sees one of the two GENERATION_*_MESSAGE
    // constants, so an unresolvable model id, an expired key, an exhausted
    // quota and an unreadable PDF are otherwise indistinguishable from
    // outside. Keep the detail where the operator can reach it.
    console.error('quiz generation attempt failed', error);
    return { questions: null, transient: isRetryableStatus(error) };
  }

  const parsed = parseQuestions(raw);
  if (parsed === null) return { questions: null, transient: false };

  // The prompt asks for exactly `count` and the schema sets no upper bound,
  // so nothing but this stops an over-generous model from handing four
  // friends a 25-minute game. Spec section 8: the server-side layer enforces.
  const prepared = prepareQuestions(parsed, random).slice(0, config.count);
  return prepared.length >= MIN_QUESTIONS
    ? { questions: prepared, transient: false }
    : { questions: null, transient: false };
}

/**
 * One retry, then give up. Spec §8: every failure must return the host to a
 * screen where they can try again — never loop, never strand the lobby.
 *
 * `retryDelayMs` (default 0, so every existing test stays instant) pauses
 * before the retry. A rate-limit or 5xx failure is far more likely to clear
 * given a moment than to clear on an immediate back-to-back retry -- the
 * real caller (GameRoom) passes a real delay; tests that want an instant
 * retry simply don't pass one.
 */
export async function generateQuiz(
  model: QuizModel,
  source: QuizSource,
  config: SetupConfig,
  random: () => number = Math.random,
  retryDelayMs = 0,
): Promise<GenerationResult> {
  let sawNonTransientFailure = false;

  for (let tries = 0; tries < 2; tries++) {
    if (tries > 0 && retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
    const outcome = await attempt(model, source, config, random);
    if (outcome.questions !== null) return { ok: true, questions: outcome.questions };
    if (!outcome.transient) sawNonTransientFailure = true;
  }

  return {
    ok: false,
    reason: sawNonTransientFailure ? GENERATION_FAILURE_MESSAGE : GENERATION_BUSY_MESSAGE,
  };
}
