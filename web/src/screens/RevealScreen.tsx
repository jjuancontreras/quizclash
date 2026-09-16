import AnswerTile from '../components/AnswerTile.js';
import type { ChoiceIndex, PublicState } from '../../../src/shared/types.js';

export interface RevealScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
}

export default function RevealScreen({ state, selfId }: RevealScreenProps) {
  if (state.prompt === null || state.reveal === null) return null;

  const myDelta = state.deltas.find((d) => d.playerId === selfId);
  const ranked = [...state.players].sort((a, b) => b.score - a.score);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex flex-col gap-3">
        {state.prompt.choices.map((choice, i) => (
          <AnswerTile
            key={i}
            choiceIndex={i as ChoiceIndex}
            text={choice}
            isCorrect={i === state.reveal!.correctIndex}
            isSelected={myDelta?.choiceIndex === i}
            onSelect={() => {}}
            disabled
          />
        ))}
      </div>

      <div className="rounded-base border-2 border-border bg-secondary-background p-3">
        <p className="font-bold">{state.reveal.explanation}</p>
        <p className="mt-1 text-sm italic text-foreground/70">
          "<span>{state.reveal.sourceQuote}</span>"
        </p>
      </div>

      {myDelta !== undefined && (
        <p className="text-center font-heading text-2xl">
          {myDelta.points > 0 ? `+${myDelta.points}` : '+0'}
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {ranked.map((player) => (
          <li
            key={player.id}
            data-testid="scoreboard-row"
            className="flex justify-between rounded-base border-2 border-border bg-secondary-background px-3 py-2"
          >
            <span>{player.name}</span>
            <span className="font-bold">{player.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
