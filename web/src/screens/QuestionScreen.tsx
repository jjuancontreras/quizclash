import { useEffect, useState } from 'react';
import { Progress } from '../components/ui/progress.js';
import AnswerTile from '../components/AnswerTile.js';
import type { ChoiceIndex, PublicPlayer, PublicState } from '../../../src/shared/types.js';
import { QUESTION_WINDOW_MS } from '../../../src/shared/constants.js';

export interface QuestionScreenProps {
  readonly state: PublicState;
  readonly players: readonly PublicPlayer[];
  readonly selfId: string;
  readonly onAnswer: (choiceIndex: ChoiceIndex) => void;
}

export default function QuestionScreen({ state, players, selfId, onAnswer }: QuestionScreenProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (state.phaseEndsAtMs === null) return;
    let frame: number;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.phaseEndsAtMs]);

  if (state.prompt === null) return null;

  const hasAnswered = state.answered.includes(selfId);
  // A separate person has answered while I'm still deciding: the server has
  // already capped my remaining time (HURRY_WINDOW_MS) by the time this is
  // true, so the banner and the sudden drop in the bar below explain the
  // same event, not two different ones.
  const shouldHurry = !hasAnswered && state.answered.length > 0;
  const timeFraction =
    state.phaseEndsAtMs === null ? 1 : Math.max(0, (state.phaseEndsAtMs - now) / QUESTION_WINDOW_MS);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 p-4" style={{ flexBasis: '35%' }}>
        <p className="text-center text-xs font-bold uppercase tracking-wide text-foreground/60">
          Question {state.questionIndex + 1} of {state.totalQuestions}
        </p>

        <Progress value={timeFraction * 100} />

        {shouldHurry && (
          <p className="animate-pulse text-center text-sm font-bold text-red-600">
            ⚡ Someone already answered — hurry up!
          </p>
        )}

        <p className="text-center text-sm text-foreground/70">
          {state.answered.length} of {players.length} players answered
        </p>

        <div className="flex justify-center gap-2">
          {players.map((player) => {
            const playerAnswered = state.answered.includes(player.id);
            return (
              <div
                key={player.id}
                data-testid="player-answered-status"
                data-answered={playerAnswered ? 'true' : 'false'}
                className={`relative flex h-9 w-9 items-center justify-center rounded-base border-2 border-border transition-opacity ${
                  playerAnswered ? 'bg-main' : 'bg-secondary-background opacity-60'
                }`}
                title={`${player.name}${playerAnswered ? ' — answered' : ''}`}
              >
                <img
                  src={`https://api.dicebear.com/10.x/bottts/svg?seed=${encodeURIComponent(player.avatarSeed)}`}
                  alt={player.name}
                  className="h-6 w-6"
                />
                {playerAnswered && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-green-400 text-[10px] leading-none">
                    ✓
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <h2 className="text-center font-heading text-xl">{state.prompt.question}</h2>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" style={{ flexBasis: '55%' }}>
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
