const AVATAR_STYLE = 'bottts';
const SEED_COUNT = 12;
const SEEDS = Array.from({ length: SEED_COUNT }, (_, i) => `quizclash-avatar-${i}`);

function avatarUrl(seed: string): string {
  return `https://api.dicebear.com/10.x/${AVATAR_STYLE}/svg?seed=${encodeURIComponent(seed)}`;
}

export interface AvatarPickerProps {
  readonly value: string;
  readonly onChange: (seed: string) => void;
}

export default function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  return (
    <div className="grid grid-cols-4 gap-3" role="group" aria-label="Choose an avatar">
      {SEEDS.map((seed) => {
        const isSelected = seed === value;
        return (
          <button
            key={seed}
            type="button"
            onClick={() => onChange(seed)}
            className={`rounded-base border-2 border-border p-1 transition-transform ${
              isSelected ? 'bg-main scale-105' : 'bg-secondary-background'
            }`}
          >
            <img
              src={avatarUrl(seed)}
              alt={isSelected ? `${seed} (selected)` : seed}
              className="h-full w-full"
            />
          </button>
        );
      })}
    </div>
  );
}
