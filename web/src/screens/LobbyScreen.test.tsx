import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LobbyScreen from './LobbyScreen.js';
import type { PublicState } from '../../../src/shared/types.js';

function makeState(overrides: Partial<PublicState> = {}): PublicState {
  return {
    phase: 'LOBBY',
    lobbyCode: 'ABCD',
    hostId: 'p1',
    players: [
      { id: 'p1', name: 'Juan', avatarSeed: 's1', score: 0, joinedAtMs: 0, connected: true },
      { id: 'p2', name: 'Maria', avatarSeed: 's2', score: 0, joinedAtMs: 1, connected: true },
    ],
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

describe('LobbyScreen', () => {
  test('shows the lobby code', () => {
    render(<LobbyScreen state={makeState()} selfId="p1" onOpenSetup={() => {}} />);
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  test('shows two filled avatar slots and two empty placeholders for a 2-player lobby', () => {
    render(<LobbyScreen state={makeState()} selfId="p1" onOpenSetup={() => {}} />);
    expect(screen.getByText('Juan')).toBeInTheDocument();
    expect(screen.getByText('Maria')).toBeInTheDocument();
    expect(screen.getAllByText(/waiting/i)).toHaveLength(2);
  });

  test('shows a Start button only to the host', () => {
    render(<LobbyScreen state={makeState({ hostId: 'p1' })} selfId="p1" onOpenSetup={() => {}} />);
    expect(screen.getByRole('button', { name: /start/i })).toBeInTheDocument();
  });

  test('does not show a Start button to a non-host', () => {
    render(<LobbyScreen state={makeState({ hostId: 'p1' })} selfId="p2" onOpenSetup={() => {}} />);
    expect(screen.queryByRole('button', { name: /start/i })).not.toBeInTheDocument();
  });

  test('clicking Start calls onOpenSetup', async () => {
    const onOpenSetup = vi.fn();
    render(<LobbyScreen state={makeState({ hostId: 'p1' })} selfId="p1" onOpenSetup={onOpenSetup} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /start/i }));
    expect(onOpenSetup).toHaveBeenCalled();
  });
});
