import { useEffect, useState } from 'react';
import { Button } from '../components/ui/button.js';
import { Card } from '../components/ui/card.js';
import { Label } from '../components/ui/label.js';
import { Progress } from '../components/ui/progress.js';
import type { PublicState, QuestionCount, Difficulty, SetupConfig } from '../../../src/shared/types.js';
import { GENERATION_TIMEOUT_MS, MAX_UPLOAD_BYTES } from '../../../src/shared/constants.js';

const COUNTS: readonly QuestionCount[] = [5, 10, 15, 20];
const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'];
const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / 1_048_576;

/** Shared by every selectable pill (tabs, question count, difficulty): a
 * real pointer cursor and a visible hover state, whether or not it's
 * already selected — a raw <button> gives neither by default. */
function pillClasses(selected: boolean): string {
  const base =
    'cursor-pointer rounded-base border-2 border-border font-bold transition-colors disabled:cursor-not-allowed disabled:pointer-events-none disabled:opacity-50';
  return selected
    ? `${base} bg-main hover:brightness-95`
    : `${base} bg-secondary-background hover:bg-main/30`;
}

/**
 * Ticks `now` forward via requestAnimationFrame while `active`, matching
 * QuestionScreen/CountdownScreen's pattern — used here to drive a real
 * elapsed-time progress bar during GENERATING instead of a static message.
 */
function useTickingNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    let frame: number;
    const tick = () => {
      setNow(Date.now());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return now;
}

/** Shown to host and non-host alike during GENERATING — the only visible
 * difference between them before this was who saw the upload wizard. */
function GeneratingCard({ phaseEndsAtMs }: { readonly phaseEndsAtMs: number | null }) {
  const now = useTickingNow(phaseEndsAtMs !== null);
  const elapsedFraction =
    phaseEndsAtMs === null
      ? 0
      : Math.min(1, Math.max(0, 1 - (phaseEndsAtMs - now) / GENERATION_TIMEOUT_MS));

  return (
    <Card className="mx-auto flex max-w-md flex-col gap-3 p-6 text-center">
      <p className="font-heading text-lg">Building your quiz…</p>
      <Progress value={elapsedFraction * 100} />
      <p className="text-sm text-foreground/70">
        This can take up to a minute or two — the AI is reading your material and writing
        questions.
      </p>
    </Card>
  );
}

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
    return <GeneratingCard phaseEndsAtMs={state.phaseEndsAtMs} />;
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
      {state.error !== null && (
        <p role="alert" className="text-sm font-bold text-red-600">
          {state.error}
        </p>
      )}

      <div role="tablist" className="flex gap-2">
        <button
          role="tab"
          aria-selected={sourceTab === 'pdf'}
          onClick={() => setSourceTab('pdf')}
          className={`${pillClasses(sourceTab === 'pdf')} px-4 py-2`}
        >
          Upload PDF
        </button>
        <button
          role="tab"
          aria-selected={sourceTab === 'text'}
          onClick={() => setSourceTab('text')}
          className={`${pillClasses(sourceTab === 'text')} px-4 py-2`}
        >
          Paste Text
        </button>
      </div>

      {sourceTab === 'pdf' ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="pdf-upload">Drop a PDF</Label>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf"
            className="cursor-pointer rounded-base border-2 border-border bg-secondary-background p-2 text-sm file:mr-3 file:cursor-pointer file:rounded-base file:border-2 file:border-border file:bg-main file:px-3 file:py-1.5 file:font-bold file:text-main-foreground file:shadow-shadow hover:file:brightness-95"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file === undefined) return;
              if (file.size > MAX_UPLOAD_BYTES) {
                setPdfBase64(null);
                setPdfError(`That PDF is too large — please use a file under ${MAX_UPLOAD_MB}MB.`);
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
          <p className="text-xs text-foreground/70">Max {MAX_UPLOAD_MB}MB.</p>
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
              className={`${pillClasses(count === c)} px-3 py-2`}
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
              className={`${pillClasses(difficulty === d)} px-3 py-2 capitalize`}
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
