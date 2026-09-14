import { ANSWER_STYLES } from '../lib/colors.js';
import type { ChoiceIndex } from '../../../src/shared/types.js';

export interface AnswerTileProps {
  readonly choiceIndex: ChoiceIndex;
  readonly text: string;
  /** null while the question is live and no answer key is known yet — the client never has this before REVEAL. */
  readonly isCorrect: boolean | null;
  readonly isSelected: boolean;
  readonly onSelect: (choiceIndex: ChoiceIndex) => void;
  /** True once this player has already answered (QUESTION) or on REVEAL, where selection is read-only. */
  readonly disabled?: boolean;
}

const SHAPE_GLYPH: Record<string, string> = {
  circle: '●',
  triangle: '▲',
  square: '■',
  diamond: '◆',
};

export default function AnswerTile({ choiceIndex, text, isCorrect, isSelected, onSelect, disabled = false }: AnswerTileProps) {
  const style = ANSWER_STYLES[choiceIndex]!;
  const isWrongSelection = isSelected && isCorrect === false;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(choiceIndex)}
      data-correct={isCorrect === true ? 'true' : undefined}
      data-wrong-selection={isWrongSelection ? 'true' : undefined}
      className={`flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-base border-2 border-border p-4 font-bold text-black disabled:opacity-70 ${style.hue} ${
        isCorrect === true ? 'ring-4 ring-green-600' : ''
      } ${isWrongSelection ? 'ring-4 ring-red-600' : ''}`}
    >
      <span className="text-2xl">{SHAPE_GLYPH[style.shape]}</span>
      <span>{text}</span>
    </button>
  );
}
