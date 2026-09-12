import {
  MAX_CHOICE_CHARS,
  MAX_EXPLANATION_CHARS,
  MAX_QUESTION_CHARS,
} from '../shared/constants.js';
import type { Question } from '../shared/types.js';

const REQUIRED_CHOICE_COUNT = 4;

/**
 * The mobile layout budget is enforced here, not in CSS — the text is
 * model-generated, so the limit has to hold before it ever reaches a screen.
 */
export function isQuestionWithinBudget(q: Question): boolean {
  if (q.question.trim().length === 0) return false;
  if (q.question.length > MAX_QUESTION_CHARS) return false;
  if (q.explanation.length > MAX_EXPLANATION_CHARS) return false;
  if (q.choices.length !== REQUIRED_CHOICE_COUNT) return false;
  if (q.correctIndex < 0 || q.correctIndex >= REQUIRED_CHOICE_COUNT) return false;
  return q.choices.every((c) => c.trim().length > 0 && c.length <= MAX_CHOICE_CHARS);
}

/**
 * Fisher-Yates over a copy. Models favour particular answer slots; without
 * this, players detect the pattern within a few questions and exploit it.
 */
export function shuffleQuestionChoices(q: Question, random: () => number = Math.random): Question {
  const correctText = q.choices[q.correctIndex];
  const shuffled = [...q.choices];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = shuffled[i]!;
    const b = shuffled[j]!;
    shuffled[i] = b;
    shuffled[j] = a;
  }

  return { ...q, choices: shuffled, correctIndex: shuffled.indexOf(correctText ?? '') };
}

function normalizeStem(stem: string): string {
  return stem.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

export function dedupeQuestions(questions: readonly Question[]): Question[] {
  const seen = new Set<string>();
  const kept: Question[] = [];

  for (const q of questions) {
    const key = normalizeStem(q.question);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(q);
  }

  return kept;
}

/** Validate → dedupe → shuffle. The full post-generation pipeline. */
export function prepareQuestions(
  raw: readonly Question[],
  random: () => number = Math.random,
): Question[] {
  return dedupeQuestions(raw.filter(isQuestionWithinBudget)).map((q) =>
    shuffleQuestionChoices(q, random),
  );
}
