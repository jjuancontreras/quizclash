import { describe, expect, test, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuestionScreen from './QuestionScreen.js';
import type { PublicState, PublicPlayer } from '../../../src/shared/types.js';

const players: readonly PublicPlayer[] = [
  { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 0, joinedAtMs: 0, connected: true },
  { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 0, joinedAtMs: 1, connected: true },
];

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'QUESTION',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players,
    questionIndex: 0,
    totalQuestions: 5,
    phaseEndsAtMs: Date.now() + 20000,
    prompt: { question: 'What powers the cell?', choices: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'] },
    answered: [],
    reveal: null,
    deltas: [],
    error: null,
    ...overrides,
  };
}

describe('QuestionScreen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('shrinks the timer bar over time, driven by the animation-frame loop rather than a frozen read', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const { container } = render(
      <QuestionScreen state={makeState({ phaseEndsAtMs: now + 20000 })} players={players} selfId="p1" onAnswer={() => {}} />,
    );
    const indicator = container.querySelector('[data-slot="progress-indicator"]') as HTMLElement;
    const initialTransform = indicator.style.transform;

    // Advance the (faked) rAF loop so the component's own tick picks up the new
    // time, mirroring CountdownScreen's test for the same requestAnimationFrame
    // pattern — advancing fake timers moves Date.now() in lockstep with the
    // clock that schedules requestAnimationFrame.
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(indicator.style.transform).not.toBe(initialTransform);
  });

  test('renders the question text and all four choices', () => {
    render(<QuestionScreen state={makeState()} players={players} selfId="p1" onAnswer={() => {}} />);
    expect(screen.getByText('What powers the cell?')).toBeInTheDocument();
    expect(screen.getByText('Mitochondria')).toBeInTheDocument();
  });

  test('calls onAnswer with the clicked choice index', async () => {
    const onAnswer = vi.fn();
    render(<QuestionScreen state={makeState()} players={players} selfId="p1" onAnswer={onAnswer} />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Mitochondria'));
    expect(onAnswer).toHaveBeenCalledWith(1);
  });

  test('shows how many of the seated players have answered', () => {
    render(<QuestionScreen state={makeState({ answered: ['p1'] })} players={players} selfId="p1" onAnswer={() => {}} />);
    expect(screen.getByText(/1.*2/)).toBeInTheDocument();
  });

  test('disables further selection once this player has already answered', () => {
    render(<QuestionScreen state={makeState({ answered: ['p1'] })} players={players} onAnswer={() => {}} selfId="p1" />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).toBeDisabled();
    }
  });

  test('does not disable tiles for a player who has not yet answered', () => {
    render(<QuestionScreen state={makeState({ answered: ['p2'] })} players={players} onAnswer={() => {}} selfId="p1" />);
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toBeDisabled();
    }
  });

  test('shows which question this is out of the total the host configured', () => {
    render(
      <QuestionScreen
        state={makeState({ questionIndex: 2, totalQuestions: 5 })}
        players={players}
        selfId="p1"
        onAnswer={() => {}}
      />,
    );
    expect(screen.getByText(/question 3 of 5/i)).toBeInTheDocument();
  });

  test('marks each player who has answered in the per-player roster, and leaves the rest unmarked', () => {
    render(<QuestionScreen state={makeState({ answered: ['p1'] })} players={players} selfId="p1" onAnswer={() => {}} />);
    const statuses = screen.getAllByTestId('player-answered-status');

    expect(statuses).toHaveLength(2);
    expect(statuses.find((el) => el.title.startsWith('Juan'))).toHaveAttribute('data-answered', 'true');
    expect(statuses.find((el) => el.title.startsWith('Maria'))).toHaveAttribute('data-answered', 'false');
  });

  test('shows a hurry-up prompt once someone else has answered and I have not', () => {
    render(<QuestionScreen state={makeState({ answered: ['p2'] })} players={players} selfId="p1" onAnswer={() => {}} />);
    expect(screen.getByText(/hurry up/i)).toBeInTheDocument();
  });

  test('does not show the hurry-up prompt once I have answered myself', () => {
    render(<QuestionScreen state={makeState({ answered: ['p1'] })} players={players} selfId="p1" onAnswer={() => {}} />);
    expect(screen.queryByText(/hurry up/i)).not.toBeInTheDocument();
  });

  test('does not show the hurry-up prompt while nobody has answered yet', () => {
    render(<QuestionScreen state={makeState({ answered: [] })} players={players} selfId="p1" onAnswer={() => {}} />);
    expect(screen.queryByText(/hurry up/i)).not.toBeInTheDocument();
  });
});
