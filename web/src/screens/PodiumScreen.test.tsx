import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PodiumScreen from './PodiumScreen.js';
import type { PublicState } from '../../../src/shared/types.js';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'PODIUM',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 3000, joinedAtMs: 0, connected: true },
      { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 4500, joinedAtMs: 1, connected: true },
    ],
    questionIndex: 4,
    totalQuestions: 5,
    phaseEndsAtMs: null,
    prompt: null,
    answered: [],
    reveal: null,
    deltas: [],
    error: null,
    ...overrides,
  };
}

describe('PodiumScreen', () => {
  test('ranks players by score, highest first', () => {
    render(<PodiumScreen state={makeState()} selfId="p1" onPlayAgain={() => {}} />);
    const rows = screen.getAllByTestId('podium-row').map((r) => r.textContent);
    expect(rows[0]).toContain('Maria');
    expect(rows[1]).toContain('Juan');
  });

  test('fires confetti on mount', async () => {
    const confetti = (await import('canvas-confetti')).default;
    render(<PodiumScreen state={makeState()} selfId="p1" onPlayAgain={() => {}} />);
    expect(confetti).toHaveBeenCalled();
  });

  test('shows Play Again only to the host', () => {
    render(<PodiumScreen state={makeState({ hostId: 'p1' })} selfId="p1" onPlayAgain={() => {}} />);
    expect(screen.getByRole('button', { name: /play again/i })).toBeInTheDocument();
  });

  test('does not show Play Again to a non-host', () => {
    render(<PodiumScreen state={makeState({ hostId: 'p1' })} selfId="p2" onPlayAgain={() => {}} />);
    expect(screen.queryByRole('button', { name: /play again/i })).not.toBeInTheDocument();
  });

  test('clicking Play Again calls onPlayAgain', async () => {
    const onPlayAgain = vi.fn();
    render(<PodiumScreen state={makeState({ hostId: 'p1' })} selfId="p1" onPlayAgain={onPlayAgain} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /play again/i }));
    expect(onPlayAgain).toHaveBeenCalled();
  });
});
