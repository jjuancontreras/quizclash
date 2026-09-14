import { useState } from 'react';
import { Button } from '../components/ui/button.js';
import { Input } from '../components/ui/input.js';
import { Label } from '../components/ui/label.js';
import { Card } from '../components/ui/card.js';
import AvatarPicker from '../components/AvatarPicker.js';

const MAX_NAME_CHARS = 16;

export interface IdentityScreenProps {
  readonly onJoin: (params: { code: string; name: string; avatarSeed: string }) => void;
}

export default function IdentityScreen({ onJoin }: IdentityScreenProps) {
  const [name, setName] = useState('');
  const [avatarSeed, setAvatarSeed] = useState('quizclash-avatar-0');
  const [code, setCode] = useState('');

  const canJoinExisting = name.trim().length > 0 && code.trim().length > 0;
  const canCreate = name.trim().length > 0;

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-4 p-6">
      <div>
        <Label htmlFor="player-name">Name</Label>
        <Input
          id="player-name"
          value={name}
          maxLength={MAX_NAME_CHARS}
          onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_CHARS))}
          placeholder="Your name"
        />
      </div>

      <AvatarPicker value={avatarSeed} onChange={setAvatarSeed} />

      <div className="flex flex-col gap-2">
        <Label htmlFor="lobby-code">Lobby code</Label>
        <Input
          id="lobby-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCD"
        />
        <Button
          disabled={!canJoinExisting}
          onClick={() => onJoin({ code: code.trim().toUpperCase(), name: name.trim(), avatarSeed })}
        >
          Join
        </Button>
      </div>

      <div className="text-center text-sm text-foreground/70">or</div>

      <Button
        variant="neutral"
        disabled={!canCreate}
        onClick={() => onJoin({ code: '', name: name.trim(), avatarSeed })}
      >
        Create Lobby
      </Button>
    </Card>
  );
}
