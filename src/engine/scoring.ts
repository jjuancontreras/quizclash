import { BASE_POINTS } from '../shared/constants.js';

export interface ScoreInput {
  readonly answeredAtMs: number;
  readonly shownAtMs: number;
  readonly windowMs: number;
  readonly isCorrect: boolean;
}

/**
 * points = correct ? round(BASE * (1 - 0.5 * timeUsed / windowMs)) : 0
 *
 * Halving rather than decaying to zero is deliberate (spec §6): speed should
 * decide between two players who both know the answer, but knowing it must
 * always beat not knowing it.
 */
export function scoreAnswer({ answeredAtMs, shownAtMs, windowMs, isCorrect }: ScoreInput): number {
  if (!isCorrect) return 0;
  if (windowMs <= 0) return BASE_POINTS;

  const elapsedMs = answeredAtMs - shownAtMs;
  const clampedMs = Math.min(Math.max(elapsedMs, 0), windowMs);
  const fractionUsed = clampedMs / windowMs;

  return Math.round(BASE_POINTS * (1 - 0.5 * fractionUsed));
}
