import { describe, expect, test, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SetupScreen from './SetupScreen.js';
import type { PublicState } from '../../../src/shared/types.js';
import { MAX_UPLOAD_BYTES } from '../../../src/shared/constants.js';

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'SETUP',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [],
    questionIndex: 0,
    totalQuestions: 0,
    phaseEndsAtMs: null,
    prompt: null,
    answered: [],
    reveal: null,
    deltas: [],
    error: null,
    ...overrides,
  };
}

describe('SetupScreen', () => {
  test('non-host players see a waiting message, not the form', () => {
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p2" onSubmit={() => {}} />);
    expect(screen.getByText(/host is building/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
  });

  test('the host sees the real setup form, not the waiting message', () => {
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={() => {}} />);
    expect(screen.queryByText(/host is building/i)).not.toBeInTheDocument();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate/i })).toBeInTheDocument();
  });

  test('Generate is disabled until a source is provided', () => {
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
  });

  test('typing pasted text enables Generate and submits a text source', async () => {
    const onSubmit = vi.fn();
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /paste text/i }));
    await user.type(screen.getByLabelText(/paste your material/i), 'Mitochondria are the powerhouse of the cell.');
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ count: 10, difficulty: 'medium', sourceKind: 'text' }),
      { kind: 'text', text: 'Mitochondria are the powerhouse of the cell.' },
    );
  });

  test('uploading a PDF enables Generate and submits a pdf source', async () => {
    const onSubmit = vi.fn();
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /upload pdf/i }));
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();

    const file = new File(['%PDF-1.4 fake pdf bytes'], 'reviewer.pdf', { type: 'application/pdf' });
    const input = screen.getByLabelText(/drop a pdf/i);
    await user.upload(input, file);

    await waitFor(() => expect(screen.getByRole('button', { name: /generate/i })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: 'pdf' }),
      expect.objectContaining({ kind: 'pdf', base64: expect.any(String) }),
    );
    const [, source] = onSubmit.mock.calls[0]!;
    expect((source as { kind: 'pdf'; base64: string }).base64.length).toBeGreaterThan(0);
  });

  test('an oversized PDF is rejected client-side and never enables Generate', async () => {
    const onSubmit = vi.fn();
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /upload pdf/i }));

    const oversizedFile = new File(['not actually 10MB'], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversizedFile, 'size', { value: MAX_UPLOAD_BYTES + 1 });

    const input = screen.getByLabelText(/drop a pdf/i);
    await user.upload(input, oversizedFile);

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
    expect(screen.getByRole('button', { name: /generate/i })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('switching tabs hides the other tab\'s input, in both directions', async () => {
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={() => {}} />);
    const user = userEvent.setup();

    // The paste-text tab is the default.
    expect(screen.getByLabelText(/paste your material/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/drop a pdf/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /upload pdf/i }));
    expect(screen.getByLabelText(/drop a pdf/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/paste your material/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: /paste text/i }));
    expect(screen.getByLabelText(/paste your material/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/drop a pdf/i)).not.toBeInTheDocument();
  });

  test('selecting a question count pill changes the submitted config', async () => {
    const onSubmit = vi.fn();
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /paste text/i }));
    await user.type(screen.getByLabelText(/paste your material/i), 'Some material.');
    await user.click(screen.getByRole('button', { name: '20' }));
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ count: 20 }), expect.anything());
  });

  test('selecting a difficulty pill changes the submitted config', async () => {
    const onSubmit = vi.fn();
    render(<SetupScreen state={makeState({ hostId: 'p1' })} selfId="p1" onSubmit={onSubmit} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: /paste text/i }));
    await user.type(screen.getByLabelText(/paste your material/i), 'Some material.');
    await user.click(screen.getByRole('button', { name: /^hard$/i }));
    await user.click(screen.getByRole('button', { name: /generate/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ difficulty: 'hard' }), expect.anything());
  });

  test('shows a building-the-quiz state during GENERATING for every player, host included', () => {
    render(<SetupScreen state={makeState({ phase: 'GENERATING', hostId: 'p1' })} selfId="p1" onSubmit={() => {}} />);
    expect(screen.getByText(/building your quiz/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate/i })).not.toBeInTheDocument();
  });

  test('shows a building-the-quiz state during GENERATING for non-host players too', () => {
    render(<SetupScreen state={makeState({ phase: 'GENERATING', hostId: 'p1' })} selfId="p2" onSubmit={() => {}} />);
    expect(screen.getByText(/building your quiz/i)).toBeInTheDocument();
    expect(screen.queryByText(/host is building/i)).not.toBeInTheDocument();
  });

  // Finding 3 (Plan B review): a generation failure populates state.error,
  // but the host previously saw no explanation when GENERATING bounced back
  // to SETUP — just the upload wizard reappearing.
  test('renders state.error for the host when generation has failed', () => {
    render(
      <SetupScreen
        state={makeState({ hostId: 'p1', error: 'Quiz generation timed out. Please try again.' })}
        selfId="p1"
        onSubmit={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/quiz generation timed out/i);
  });

  test('renders nothing extra when state.error is null', () => {
    render(<SetupScreen state={makeState({ hostId: 'p1', error: null })} selfId="p1" onSubmit={() => {}} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
