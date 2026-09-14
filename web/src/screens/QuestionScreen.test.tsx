import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
});
