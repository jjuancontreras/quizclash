import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '../components/ui/button.js';
import type { PublicState } from '../../../src/shared/types.js';

export interface PodiumScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
  readonly onPlayAgain: () => void;
}

export default function PodiumScreen({ state, selfId, onPlayAgain }: PodiumScreenProps) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const isHost = state.hostId === selfId;
  const hasFiredConfetti = useRef(false);

  useEffect(() => {
    if (hasFiredConfetti.current) return;
    hasFiredConfetti.current = true;
    confetti({ particleCount: 150, spread: 90, origin: { y: 0.6 } });
  }, []);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6">
      <h1 className="font-heading text-2xl">Final Ranking</h1>
      <ol className="flex w-full flex-col gap-2">
        {ranked.map((player, i) => (
          <li
            key={player.id}
            data-testid="podium-row"
            className="flex items-center justify-between rounded-base border-2 border-border bg-secondary-background px-4 py-3"
          >
            <span className="font-heading">
              #{i + 1} {player.name}
            </span>
            <span className="font-bold">{player.score}</span>
          </li>
        ))}
      </ol>
      {isHost && (
        <Button onClick={onPlayAgain} className="w-full">
          Play Again
        </Button>
      )}
    </div>
  );
}
