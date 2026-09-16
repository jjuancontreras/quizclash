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

/** A/B/C/D, not a shape+color pair — a conventional multiple-choice label
 * that's colorblind-safe on its own, so no separate accessibility signal
 * is needed the way the old shape-per-tile design required one. */
const CHOICE_LETTERS = ['A', 'B', 'C', 'D'] as const;

export default function AnswerTile({ choiceIndex, text, isCorrect, isSelected, onSelect, disabled = false }: AnswerTileProps) {
  const letter = CHOICE_LETTERS[choiceIndex];
  const isWrongSelection = isSelected && isCorrect === false;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(choiceIndex)}
      data-correct={isCorrect === true ? 'true' : undefined}
      data-wrong-selection={isWrongSelection ? 'true' : undefined}
      className={`flex w-full cursor-pointer items-center gap-3 rounded-base border-2 border-border bg-secondary-background p-3 text-left font-bold text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
        isCorrect === true
          ? 'border-green-600 bg-green-100'
          : isWrongSelection
            ? 'border-red-600 bg-red-100'
            : 'hover:bg-main/20'
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-base border-2 border-border font-heading ${
          isCorrect === true ? 'bg-green-400' : isWrongSelection ? 'bg-red-400' : 'bg-main'
        }`}
      >
        {letter}
      </span>
      <span>{text}</span>
    </button>
  );
}
