import { describe, expect, test, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App.js';
import { useGameConnection } from './hooks/useGameConnection.js';

vi.mock('./hooks/useGameConnection.js');

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('shows IdentityScreen when there is no state yet', () => {
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: vi.fn(),
      send: vi.fn(),
    });

    render(<App />);
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
  });

  test('renders LobbyScreen when phase is LOBBY', () => {
    vi.mocked(useGameConnection).mockReturnValue({
      state: {
        phase: 'LOBBY',
        lobbyCode: 'ABCD',
        hostId: 'p1',
        players: [{ id: 'p1', name: 'Juan', avatarSeed: 's1', score: 0, joinedAtMs: 0, connected: true }],
        questionIndex: 0,
        totalQuestions: 0,
        phaseEndsAtMs: null,
        prompt: null,
        answered: [],
        reveal: null,
        deltas: [],
        error: null,
      },
      connectionStatus: 'connected',
      rejection: null,
      join: vi.fn(),
      send: vi.fn(),
    });

    render(<App />);
    expect(screen.getByText('ABCD')).toBeInTheDocument();
  });

  test('calling join with an empty code fetches a fresh lobby code before connecting', async () => {
    const joinSpy = vi.fn();
    vi.mocked(useGameConnection).mockReturnValue({
      state: null,
      connectionStatus: 'disconnected',
      rejection: null,
      join: joinSpy,
      send: vi.fn(),
    });
    globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ code: 'NEWC' }) }) as unknown as typeof fetch;

    render(<App />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/name/i), 'Juan');
    await user.click(screen.getAllByRole('img')[0]!);
    await user.click(screen.getByRole('button', { name: /create lobby/i }));

    expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/lobby'), expect.objectContaining({ method: 'POST' }));
    expect(joinSpy).toHaveBeenCalledWith(expect.objectContaining({ code: 'NEWC' }));
  });
});
