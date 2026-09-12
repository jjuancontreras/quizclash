import { describe, expect, test } from 'vitest';
import {
  isQuestionWithinBudget,
  shuffleQuestionChoices,
  dedupeQuestions,
  prepareQuestions,
} from './questions.js';
import type { Question } from '../shared/types.js';

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    question: 'What is the powerhouse of the cell?',
    choices: ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi body'],
    correctIndex: 0,
    explanation: 'Mitochondria produce ATP.',
    sourceQuote: 'The mitochondrion is the powerhouse of the cell.',
    ...overrides,
  };
}

describe('isQuestionWithinBudget', () => {
  test('accepts a question inside the mobile text budget', () => {
    expect(isQuestionWithinBudget(makeQuestion())).toBe(true);
  });

  test('rejects a question stem longer than the 120-char phone budget', () => {
    expect(isQuestionWithinBudget(makeQuestion({ question: 'a'.repeat(121) }))).toBe(false);
  });

  test('rejects a choice longer than the 60-char grid-cell budget', () => {
    const choices = ['b'.repeat(61), 'x', 'y', 'z'];
    expect(isQuestionWithinBudget(makeQuestion({ choices }))).toBe(false);
  });

  test('rejects a question that does not have exactly four choices', () => {
    expect(isQuestionWithinBudget(makeQuestion({ choices: ['a', 'b', 'c'] }))).toBe(false);
  });

  test('rejects a correctIndex pointing outside the choices', () => {
    expect(isQuestionWithinBudget(makeQuestion({ correctIndex: 4 }))).toBe(false);
  });

  test('rejects an empty question stem', () => {
    expect(isQuestionWithinBudget(makeQuestion({ question: '   ' }))).toBe(false);
  });

  test('rejects a question with duplicate choice text', () => {
    const choices = ['ATP', 'ATP', 'Ribosome', 'Golgi body'];
    expect(isQuestionWithinBudget(makeQuestion({ choices }))).toBe(false);
  });

  test('rejects a question with choices differing only by case or whitespace', () => {
    const choices = ['ATP', ' atp ', 'Ribosome', 'Golgi body'];
    expect(isQuestionWithinBudget(makeQuestion({ choices }))).toBe(false);
  });

  test('accepts a question with four genuinely distinct choices', () => {
    const choices = ['ATP', 'DNA', 'Ribosome', 'Golgi body'];
    expect(isQuestionWithinBudget(makeQuestion({ choices }))).toBe(true);
  });
});

describe('shuffleQuestionChoices', () => {
  test('keeps correctIndex pointing at the same answer text after shuffling', () => {
    const original = makeQuestion();
    const correctText = original.choices[original.correctIndex];

    for (let seed = 0; seed < 50; seed++) {
      const shuffled = shuffleQuestionChoices(original, () => seed / 50);
      expect(shuffled.choices[shuffled.correctIndex]).toBe(correctText);
    }
  });

  test('preserves the full set of choices', () => {
    const shuffled = shuffleQuestionChoices(makeQuestion(), () => 0.42);
    expect([...shuffled.choices].sort()).toEqual([...makeQuestion().choices].sort());
  });

  test('does not mutate the input question', () => {
    const original = makeQuestion();
    const before = JSON.stringify(original);
    shuffleQuestionChoices(original, () => 0.7);
    expect(JSON.stringify(original)).toBe(before);
  });

  test('actually shuffles choices — detects regressions to no-op', () => {
    const original = makeQuestion();
    const originalOrder = original.choices.join(',');
    let shuffledAtLeastOnce = false;

    for (let seed = 0; seed < 50; seed++) {
      const shuffled = shuffleQuestionChoices(original, () => seed / 50);
      if (shuffled.choices.join(',') !== originalOrder) {
        shuffledAtLeastOnce = true;
        break;
      }
    }

    expect(shuffledAtLeastOnce).toBe(true);
  });
});

describe('dedupeQuestions', () => {
  test('removes a question repeating an earlier stem', () => {
    const result = dedupeQuestions([makeQuestion(), makeQuestion()]);
    expect(result).toHaveLength(1);
  });

  test('treats casing and punctuation differences as the same question', () => {
    const a = makeQuestion({ question: 'What is ATP?' });
    const b = makeQuestion({ question: 'what is atp???' });
    expect(dedupeQuestions([a, b])).toHaveLength(1);
  });

  test('keeps genuinely different questions', () => {
    const a = makeQuestion({ question: 'What is ATP?' });
    const b = makeQuestion({ question: 'What is DNA?' });
    expect(dedupeQuestions([a, b])).toHaveLength(2);
  });

  test('keeps the first occurrence', () => {
    const a = makeQuestion({ question: 'What is ATP?', explanation: 'first' });
    const b = makeQuestion({ question: 'What is ATP?', explanation: 'second' });
    expect(dedupeQuestions([a, b])[0]?.explanation).toBe('first');
  });
});

describe('prepareQuestions', () => {
  test('drops over-budget questions rather than truncating them', () => {
    const good = makeQuestion({ question: 'What is ATP?' });
    const tooLong = makeQuestion({ question: 'a'.repeat(200) });
    const result = prepareQuestions([good, tooLong], () => 0.5);
    expect(result).toHaveLength(1);
    expect(result[0]?.question).toBe('What is ATP?');
  });

  test('applies dedupe and shuffle together', () => {
    const result = prepareQuestions([makeQuestion(), makeQuestion()], () => 0.5);
    expect(result).toHaveLength(1);
    expect(result[0]?.choices[result[0]!.correctIndex]).toBe('Mitochondria');
  });

  test('returns an empty array for empty input rather than throwing', () => {
    expect(prepareQuestions([], () => 0.5)).toEqual([]);
  });
});
