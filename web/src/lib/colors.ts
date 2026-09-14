export type AnswerShape = 'circle' | 'triangle' | 'square' | 'diamond';

export interface AnswerStyle {
  readonly shape: AnswerShape;
  /** A Tailwind background-color utility class, not a raw hex value — keeps every hue theme-consistent with the neobrutalism palette's saturation. */
  readonly hue: string;
}

/**
 * Spec §9: color is never the only signal an answer choice carries. Roughly
 * 1 in 12 men has some color vision deficiency — pairing each hue with a
 * distinct shape means the tiles are still distinguishable without color.
 */
export const ANSWER_STYLES: readonly AnswerStyle[] = [
  { shape: 'circle', hue: 'bg-red-400' },
  { shape: 'triangle', hue: 'bg-blue-400' },
  { shape: 'square', hue: 'bg-yellow-400' },
  { shape: 'diamond', hue: 'bg-green-400' },
];
