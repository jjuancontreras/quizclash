import { motion } from 'motion/react';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import type { PublicState } from '../../../src/shared/types.js';

const LOBBY_SLOTS = 4;

export interface LobbyScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
  readonly onOpenSetup: () => void;
}

export default function LobbyScreen({ state, selfId, onOpenSetup }: LobbyScreenProps) {
  const isHost = state.hostId === selfId;
  const slots = Array.from({ length: LOBBY_SLOTS }, (_, i) => state.players[i] ?? null);

  return (
    <Card className="mx-auto flex max-w-md flex-col items-center gap-6 p-6">
      <div className="text-center">
        <div className="text-sm text-foreground/70">Lobby code</div>
        <div className="text-3xl font-heading tracking-widest">{state.lobbyCode}</div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {slots.map((player, i) =>
          player === null ? (
            <div
              key={`empty-${i}`}
              className="flex h-24 w-24 items-center justify-center rounded-base border-2 border-dashed border-border text-xs text-foreground/50"
            >
              Waiting…
            </div>
          ) : (
            <motion.div
              key={player.id}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="flex h-24 w-24 flex-col items-center justify-center gap-1 rounded-base border-2 border-border bg-secondary-background"
            >
              <img
                src={`https://api.dicebear.com/10.x/bottts/svg?seed=${encodeURIComponent(player.avatarSeed)}`}
                alt={player.name}
                className="h-12 w-12"
              />
              <span className="text-xs font-bold">{player.name}</span>
            </motion.div>
          ),
        )}
      </div>

      {isHost && (
        <Button onClick={onOpenSetup} className="w-full">
          Start
        </Button>
      )}
    </Card>
  );
}
