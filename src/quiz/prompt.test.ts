import { describe, expect, test } from 'vitest';
import { buildQuizPrompt, DIFFICULTY_DEFINITIONS } from './prompt.js';
import type { SetupConfig } from '../shared/types.js';

function config(overrides: Partial<SetupConfig> = {}): SetupConfig {
  return { count: 10, difficulty: 'medium', focus: '', sourceKind: 'pdf', ...overrides };
}

describe('DIFFICULTY_DEFINITIONS', () => {
  test('defines all three difficulties behaviourally', () => {
    expect(Object.keys(DIFFICULTY_DEFINITIONS).sort()).toEqual(['easy', 'hard', 'medium']);
  });

  test('defines hard in terms of misconception distractors, per spec', () => {
    expect(DIFFICULTY_DEFINITIONS.hard.toLowerCase()).toContain('misconception');
  });
});

describe('buildQuizPrompt', () => {
  test('asks for the requested number of questions', () => {
    expect(buildQuizPrompt(config({ count: 15 }))).toContain('15');
  });

  test('embeds the behavioural definition of the chosen difficulty', () => {
    expect(buildQuizPrompt(config({ difficulty: 'hard' }))).toContain(DIFFICULTY_DEFINITIONS.hard);
  });

  test('does not leak definitions of difficulties that were not chosen', () => {
    const prompt = buildQuizPrompt(config({ difficulty: 'easy' }));
    expect(prompt).not.toContain(DIFFICULTY_DEFINITIONS.hard);
  });

  test('includes the focus topics when the host supplied them', () => {
    expect(buildQuizPrompt(config({ focus: 'photosynthesis' }))).toContain('photosynthesis');
  });

  test('omits the focus section entirely when no topics were given', () => {
    expect(buildQuizPrompt(config({ focus: '   ' }))).not.toContain('Focus especially on');
  });

  test('instructs the model to ground answers in the supplied material', () => {
    expect(buildQuizPrompt(config()).toLowerCase()).toContain('only the material');
  });

  test('instructs the model not to repeat a fact across questions', () => {
    expect(buildQuizPrompt(config()).toLowerCase()).toContain('no two questions');
  });

  test('warns the model to treat the material as data, not instructions', () => {
    expect(buildQuizPrompt(config()).toLowerCase()).toContain('instructions');
  });

  test('states the character budgets so the model aims inside them', () => {
    const prompt = buildQuizPrompt(config());
    expect(prompt).toContain('120');
    expect(prompt).toContain('60');
    expect(prompt).toContain('150');
  });
});
