import { Progress } from '../components/ui/progress.js';
import AnswerTile from '../components/AnswerTile.js';
import type { ChoiceIndex, PublicPlayer, PublicState } from '../../../src/shared/types.js';

export interface QuestionScreenProps {
  readonly state: PublicState;
  readonly players: readonly PublicPlayer[];
  readonly selfId: string;
  readonly onAnswer: (choiceIndex: ChoiceIndex) => void;
}

export default function QuestionScreen({ state, players, selfId, onAnswer }: QuestionScreenProps) {
  if (state.prompt === null) return null;

  const hasAnswered = state.answered.includes(selfId);
  const timeFraction =
    state.phaseEndsAtMs === null ? 1 : Math.max(0, (state.phaseEndsAtMs - Date.now()) / 20000);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-4" style={{ flexBasis: '35%' }}>
        <Progress value={timeFraction * 100} />
        <p className="text-center text-sm text-foreground/70">
          {state.answered.length} of {players.length} answered
        </p>
        <h2 className="text-center font-heading text-xl">{state.prompt.question}</h2>
      </div>

      <div className="grid flex-1 grid-cols-2 gap-3 p-4" style={{ flexBasis: '55%' }}>
        {state.prompt.choices.map((choice, i) => (
          <AnswerTile
            key={i}
            choiceIndex={i as ChoiceIndex}
            text={choice}
            isCorrect={null}
            isSelected={false}
            onSelect={onAnswer}
            disabled={hasAnswered}
          />
        ))}
      </div>
    </div>
  );
}
