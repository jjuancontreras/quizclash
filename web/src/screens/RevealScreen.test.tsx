import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import RevealScreen from './RevealScreen.js';
import type { PublicState } from '../../../src/shared/types.js';

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'REVEAL',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 1000, joinedAtMs: 0, connected: true },
      { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 500, joinedAtMs: 1, connected: true },
    ],
    questionIndex: 0,
    totalQuestions: 5,
    phaseEndsAtMs: Date.now() + 5000,
    prompt: { question: 'What powers the cell?', choices: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi body'] },
    answered: [],
    reveal: { correctIndex: 1, explanation: 'Mitochondria produce ATP.', sourceQuote: 'The mitochondrion is the powerhouse of the cell.' },
    deltas: [
      { playerId: 'p1', points: 1000, choiceIndex: 1 },
      { playerId: 'p2', points: 0, choiceIndex: 0 },
    ],
    error: null,
    ...overrides,
  };
}

describe('RevealScreen', () => {
  test('shows the explanation and source quote', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    expect(screen.getByText('Mitochondria produce ATP.')).toBeInTheDocument();
    expect(screen.getByText('The mitochondrion is the powerhouse of the cell.')).toBeInTheDocument();
  });

  test('marks the correct choice distinctly', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    const correctTile = screen.getByText('Mitochondria').closest('button');
    expect(correctTile).toHaveAttribute('data-correct', 'true');
  });

  test('shows this player\'s own delta', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    expect(screen.getByText(/\+1000/)).toBeInTheDocument();
  });

  test('shows a zero delta plainly for a wrong answer, not as an error', () => {
    render(<RevealScreen state={makeState()} selfId="p2" />);
    expect(screen.getByText(/\+0/)).toBeInTheDocument();
  });

  test('shows a scoreboard sorted by score descending', () => {
    render(<RevealScreen state={makeState()} selfId="p1" />);
    const names = screen.getAllByTestId('scoreboard-row').map((row) => row.textContent);
    expect(names[0]).toContain('Juan');
    expect(names[1]).toContain('Maria');
  });
});
