import { useState } from 'react';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Label } from '../components/ui/label.js';
import type { PublicState, QuestionCount, Difficulty, SetupConfig } from '../../../src/shared/types.js';
import { MAX_UPLOAD_BYTES } from '../../../src/shared/constants.js';

const COUNTS: readonly QuestionCount[] = [5, 10, 15, 20];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];

export interface SetupScreenProps {
  readonly state: PublicState;
  readonly selfId: string;
  readonly onSubmit: (
    config: SetupConfig,
    source: { kind: 'pdf'; base64: string } | { kind: 'text'; text: string },
  ) => void;
}

export default function SetupScreen({ state, selfId, onSubmit }: SetupScreenProps) {
  const [sourceTab, setSourceTab] = useState<'pdf' | 'text'>('text');
  const [pastedText, setPastedText] = useState('');
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [count, setCount] = useState<QuestionCount>(10);
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [focus, setFocus] = useState('');

  if (state.phase === 'GENERATING') {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="font-heading text-lg">Building your quiz…</p>
      </Card>
    );
  }

  const isHost = state.hostId === selfId;
  if (!isHost) {
    return (
      <Card className="mx-auto max-w-md p-6 text-center">
        <p className="font-heading text-lg">Host is building the quiz…</p>
      </Card>
    );
  }

  const hasSource = sourceTab === 'text' ? pastedText.trim().length > 0 : pdfBase64 !== null;

  function handleGenerate() {
    const config: SetupConfig = { count, difficulty, focus: focus.trim(), sourceKind: sourceTab };
    const source =
      sourceTab === 'text'
        ? ({ kind: 'text', text: pastedText.trim() } as const)
        : ({ kind: 'pdf', base64: pdfBase64! } as const);
    onSubmit(config, source);
  }

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-5 p-6">
      <div role="tablist" className="flex gap-2">
        <button
          role="tab"
          aria-selected={sourceTab === 'pdf'}
          onClick={() => setSourceTab('pdf')}
          className={`rounded-base border-2 border-border px-4 py-2 font-bold ${sourceTab === 'pdf' ? 'bg-main' : 'bg-secondary-background'}`}
        >
          Upload PDF
        </button>
        <button
          role="tab"
          aria-selected={sourceTab === 'text'}
          onClick={() => setSourceTab('text')}
          className={`rounded-base border-2 border-border px-4 py-2 font-bold ${sourceTab === 'text' ? 'bg-main' : 'bg-secondary-background'}`}
        >
          Paste Text
        </button>
      </div>

      {sourceTab === 'pdf' ? (
        <div>
          <Label htmlFor="pdf-upload">Drop a PDF</Label>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file === undefined) return;
              if (file.size > MAX_UPLOAD_BYTES) {
                setPdfBase64(null);
                setPdfError('That PDF is too large — please use a file under 10MB.');
                return;
              }
              setPdfError(null);
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                setPdfBase64(result.split(',')[1] ?? '');
              };
              reader.readAsDataURL(file);
            }}
          />
          {pdfError !== null && (
            <p role="alert" className="text-sm font-bold text-red-600">
              {pdfError}
            </p>
          )}
        </div>
      ) : (
        <div>
          <Label htmlFor="paste-text">Paste your material</Label>
          <textarea
            id="paste-text"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            className="w-full rounded-base border-2 border-border bg-secondary-background p-2"
            rows={5}
          />
        </div>
      )}

      <fieldset className="flex flex-col gap-2" disabled={!hasSource}>
        <Label>How many questions?</Label>
        <div className="flex gap-2">
          {COUNTS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCount(c)}
              className={`rounded-base border-2 border-border px-3 py-2 font-bold ${count === c ? 'bg-main' : 'bg-secondary-background'}`}
            >
              {c}
            </button>
          ))}
        </div>

        <Label>Difficulty</Label>
        <div className="flex gap-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              className={`rounded-base border-2 border-border px-3 py-2 font-bold capitalize ${difficulty === d ? 'bg-main' : 'bg-secondary-background'}`}
            >
              {d}
            </button>
          ))}
        </div>

        <Label htmlFor="focus">Focus (optional)</Label>
        <input
          id="focus"
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          placeholder="e.g. photosynthesis, cell division"
          className="rounded-base border-2 border-border bg-secondary-background p-2"
        />
      </fieldset>

      <Button disabled={!hasSource} onClick={handleGenerate} className="w-full">
        Generate
      </Button>
    </Card>
  );
}
